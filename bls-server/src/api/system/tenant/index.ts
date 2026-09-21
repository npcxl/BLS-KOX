import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { extractIds } from '../../../core/crud';
import { sessionCenter } from '../../../security/session/session-center';
import { buildRequestMeta } from '../../../shared/utils/request-meta';
import { logger } from '../../../core/logger';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../../../core/security-audit';
import { enqueue } from '../../../queue/queue';
import {
  normalizeDomainName,
  normalizeExpireTime,
  provisionTenantIdempotent,
} from './provisioning';

const router = new Router({ prefix: '/system/tenant' });
const T = 'sys_tenant';

export const TENANT_OFFBOARD_JOB = 'tenant.offboard';

// ====== Zod 校验 ======

const USABLE_EXPIRE = z.string().trim().max(30).nullish();

const tenantCreateSchema = z.object({
  tenantName: z.string().trim().min(1, 'tenantName 不能为空').max(100),
  domainName: z.string().trim().max(200).nullish(),
  packageId: z.string().trim().min(1, 'packageId 不能为空').max(32),
  contactUser: z.string().trim().max(50).nullish(),
  contactPhone: z.string().trim().max(30).nullish(),
  expireTime: USABLE_EXPIRE,
  remark: z.string().max(500).nullish(),
  // 默认管理员（可选；缺省时使用 admin / 平台默认密码）
  adminUsername: z.string().trim().min(3, '管理员账号至少 3 位').max(50)
    .regex(/^[A-Za-z0-9_.@-]+$/, '管理员账号只能包含字母、数字、_ . @ -').nullish(),
  adminPassword: z.string().min(6, '管理员密码至少 6 位').max(100).nullish(),
  adminNickname: z.string().trim().max(50).nullish(),
  adminEmail: z.string().trim().max(100).nullish(),
});

const tenantUpdateSchema = tenantCreateSchema.partial().extend({
  tenantId: z.string().trim().min(1).max(32),
});

const statusSchema = z.object({
  tenantId: z.string().trim().min(1).max(32),
  status: z.enum(['0', '1']),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  return parsed.data;
}

/** 读取平台默认密码（sys.user.defaultPassword），兜底 123456 */
async function resolveDefaultAdminPassword(db: any): Promise<string> {
  const row = await db.selectFrom('sys_config')
    .select('config_value')
    .where('config_key', '=', 'sys.user.defaultPassword')
    .where('tenant_id', '=', PLATFORM_TENANT_ID)
    .where('deleted', '=', 0)
    .limit(1)
    .executeTakeFirst() as { config_value?: string } | undefined;
  return row?.config_value || '123456';
}

/** 域名唯一性校验（uk_tenant_domain） */
async function assertDomainAvailable(db: any, domainName: string | null | undefined, excludeTenantId?: string) {
  const domain = normalizeDomainName(domainName);
  if (!domain) return null;
  const rows = await db.selectFrom(T).select('tenant_id').where('domain_name', '=', domain).execute() as { tenant_id: string }[];
  const conflict = rows.find((r) => !excludeTenantId || String(r.tenant_id) !== excludeTenantId);
  if (conflict) throw new ConflictError(`域名已被占用：${domain}`);
  return domain;
}

/** GET /list — 分页（过滤已逻辑删除） */
router.get('/list', jwtAuth(), hasPerm('system:tenant:list'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const p = Math.max(1, Number(q.pageNum) || 1);
  const s = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  const offset = (p - 1) * s;

  let b = db.selectFrom(T).selectAll().where('deleted', '=', 0);

  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code', '=', 'system_tenant').where('searchable', '=', 1).where('deleted', '=', 0).execute();
  const searchFields: string[] = searchCols.map((c: any) => c.data_index.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()));

  if (q.keyword) {
    const fields = searchFields.length ? searchFields : ['tenant_name', 'domain_name'];
    b = b.where((eb: any) => eb.or(fields.map((f: string) => eb(f, 'like', `%${q.keyword}%`))));
  }

  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(field.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()), '=', String(q[field]));
    }
  }

  const countRow = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('create_time', 'desc').limit(s).offset(offset).execute();

  pageSuccess(ctx, rows, Number(countRow?.total ?? 0));
});

/**
 * GET /public-list — 登录页租户选择（匿名，仅返回最小字段）
 *
 * 安全要求（阶段一）：只按**当前请求 Host** 解析租户，绝不返回全部租户列表，
 * 否则等于把平台上所有租户名/域名暴露给任何匿名访问者。
 */
router.get('/public-list', async (ctx: Context) => {
  const meta = await buildRequestMeta(ctx);
  const domain = normalizeDomainName(meta.domainName);
  if (!domain) { success(ctx, [], '查询成功'); return; }

  const db = (await getDb()) as any;
  const rows = await db.selectFrom(T)
    .select(['tenant_id', 'tenant_name', 'domain_name'])
    .where('domain_name', '=', domain)
    .where('status', '=', '0')
    .where('offboard_status', '=', 'none')
    .where('deleted', '=', 0)
    .where((eb: any) => eb.or([eb('expire_time', 'is', null), eb('expire_time', '>', new Date())]))
    .limit(1)
    .execute();
  success(ctx, rows, '查询成功');
});

/** GET /:tenantId — 单条详情 */
router.get('/:tenantId', jwtAuth(), hasPerm('system:tenant:list'), async (ctx: Context) => {
  const row = await (await getDb()).selectFrom(T).selectAll()
    .where('tenant_id', '=', ctx.params.tenantId)
    .where('deleted', '=', 0)
    .executeTakeFirst();
  if (!row) throw new NotFoundError();
  success(ctx, row, '查询成功');
});

/**
 * POST /add — 事务化 provisioning（阶段一）
 *
 * 必须携带 `Idempotency-Key` 请求头，重复提交同一个 key 只会创建一次租户。
 */
router.post('/add', jwtAuth(), hasPerm('system:tenant:add'), async (ctx: Context) => {
  const b = parseOrThrow(tenantCreateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const idempotencyKey = String(ctx.get('Idempotency-Key') ?? '').trim();
  const defaultPassword = b.adminPassword ?? await resolveDefaultAdminPassword(db);

  const result = await provisionTenantIdempotent(idempotencyKey, {
    tenantName: b.tenantName,
    domainName: b.domainName ?? null,
    packageId: b.packageId,
    contactUser: b.contactUser ?? null,
    contactPhone: b.contactPhone ?? null,
    expireTime: b.expireTime ?? null,
    remark: b.remark ?? null,
    adminUsername: b.adminUsername?.trim() || 'admin',
    adminPassword: defaultPassword,
    adminNickname: b.adminNickname ?? null,
    adminEmail: b.adminEmail ?? null,
  });

  await writeSecurityLog({
    eventType: SecurityEventType.PERM_CHANGE,
    riskLevel: RiskLevel.MEDIUM,
    title: `创建租户：${b.tenantName}`,
    detail: { tenantId: result.tenantId, packageId: b.packageId, domain: result.domainName, idempotent: !!result.idempotent },
    actor: actorFromCtx(ctx),
    route: ctx.path, method: ctx.method, source: 'tenant',
  }).catch(() => {});

  success(ctx, result, result.idempotent ? '租户已存在（幂等）' : '新增成功');
});

/** PUT /edit */
router.put('/edit', jwtAuth(), hasPerm('system:tenant:edit'), async (ctx: Context) => {
  const b = parseOrThrow(tenantUpdateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const existing = await db.selectFrom(T).select(['tenant_id'])
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0).executeTakeFirst();
  if (!existing) throw new NotFoundError();

  const domain = b.domainName === undefined ? undefined : await assertDomainAvailable(db, b.domainName, b.tenantId);
  const expireTime = b.expireTime === undefined ? undefined : normalizeExpireTime(b.expireTime);

  if (b.packageId !== undefined && b.packageId !== null) {
    const pkg = await db.selectFrom('sys_package').select(['package_id', 'status'])
      .where('package_id', '=', b.packageId).executeTakeFirst();
    if (!pkg) throw new ValidationError('套餐不存在');
    if (String(pkg.status) !== '0') throw new ValidationError('套餐已停用');
  }

  const updateData: Record<string, any> = {};
  if (b.tenantName !== undefined) updateData.tenant_name = b.tenantName;
  if (b.packageId !== undefined) updateData.package_id = b.packageId;
  if (expireTime !== undefined) updateData.expire_time = expireTime;
  if (domain !== undefined) updateData.domain_name = domain;
  if (b.contactUser !== undefined) updateData.contact_user = b.contactUser;
  if (b.contactPhone !== undefined) updateData.contact_phone = b.contactPhone;
  if (b.remark !== undefined) updateData.remark = b.remark;
  if (Object.keys(updateData).length === 0) throw new ValidationError('没有可更新字段');

  const result: any = await db.updateTable(T).set(updateData)
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  // 套餐变更 → 立即生效：撤掉该租户的会话，避免旧套餐权限继续生效
  if (updateData.package_id !== undefined || updateData.expire_time !== undefined) {
    await sessionCenter.revokeAllForTenant(b.tenantId).catch(() => {});
  }

  success(ctx, null, '修改成功');
});

/**
 * PUT /status — 状态切换（独立权限 system:tenant:status）
 *
 * 阶段一策略：
 * - 平台租户不允许停用；
 * - 停用**不再要求**先删除用户和角色（历史行为会让运维无法快速止损）；
 * - 停用/过期租户 → 立即吊销该租户全部 Session；
 * - 恢复租户**不会**恢复旧 Session，用户必须重新登录。
 */
router.put('/status', jwtAuth(), hasPerm('system:tenant:status'), async (ctx: Context) => {
  const b = parseOrThrow(statusSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  if (b.tenantId === PLATFORM_TENANT_ID) {
    throw new ForbiddenError('平台租户不允许停用');
  }

  const existing = await db.selectFrom(T).select(['tenant_id', 'offboard_status'])
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0).executeTakeFirst();
  if (!existing) throw new NotFoundError();
  if (existing.offboard_status && existing.offboard_status !== 'none') {
    throw new ConflictError('租户正在 offboarding，无法切换状态');
  }

  const result: any = await db.updateTable(T).set({ status: b.status })
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  let revokedUsers = 0;
  if (b.status === '1') {
    revokedUsers = await sessionCenter.revokeAllForTenant(b.tenantId);
    logger.warn('[tenant] disabled, sessions revoked', { tenantId: b.tenantId, revokedUsers });
  }

  await writeSecurityLog({
    eventType: SecurityEventType.PERM_CHANGE,
    riskLevel: RiskLevel.HIGH,
    title: `租户状态变更：${b.tenantId} → ${b.status === '0' ? '启用' : '停用'}`,
    detail: { tenantId: b.tenantId, status: b.status, revokedUsers },
    actor: actorFromCtx(ctx),
    route: ctx.path, method: ctx.method, source: 'tenant',
  }).catch(() => {});

  success(ctx, { status: b.status, revokedUsers }, '状态修改成功');
});

/**
 * DELETE /remove — 异步 offboarding（阶段一）
 *
 * 不直接删除业务数据：把租户标记为 offboarding/pending、停用并吊销会话，
 * 然后投递 `tenant.offboard` 后台任务做数据清理；`deleted` 仍保持 0，
 * 真正删除由运维确认后执行。
 */
router.delete('/remove', jwtAuth(), hasPerm('system:tenant:remove'), async (ctx: Context) => {
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  if (ids.includes(PLATFORM_TENANT_ID)) throw new ForbiddenError('平台租户不允许删除');

  const db = (await getDb()) as any;
  const visible: any[] = await db.selectFrom(T).select(['tenant_id', 'tenant_name', 'offboard_status'])
    .where('tenant_id', 'in', ids).where('deleted', '=', 0).execute();
  if (visible.length !== ids.length) throw new NotFoundError();

  const pending = visible.filter((r) => r.offboard_status && r.offboard_status !== 'none');
  if (pending.length > 0) {
    throw new ConflictError(`租户 ${pending.map((r) => r.tenant_id).join(', ')} 已在 offboarding 中`);
  }

  await db.updateTable(T).set({ status: '1', offboard_status: 'pending' })
    .where('tenant_id', 'in', ids).where('deleted', '=', 0).execute();

  for (const id of ids) {
    await sessionCenter.revokeAllForTenant(id).catch(() => {});
    await enqueue({
      tenantId: id,
      jobType: TENANT_OFFBOARD_JOB,
      jobData: { tenantId: id, requestedBy: (ctx.state.user as any)?.userId ?? null, requestId: ctx.get('x-request-id') ?? null },
      maxAttempts: 5,
    }).catch((err) => {
      logger.error('[tenant] enqueue offboard job failed', { tenantId: id, error: String(err) });
    });
  }

  await writeSecurityLog({
    eventType: SecurityEventType.PERM_CHANGE,
    riskLevel: RiskLevel.HIGH,
    title: `发起租户 offboarding：${ids.join(', ')}`,
    detail: { tenantIds: ids, usernames: visible.map((r) => r.tenant_name) },
    actor: actorFromCtx(ctx),
    route: ctx.path, method: ctx.method, source: 'tenant',
  }).catch(() => {});

  success(ctx, { offboarding: ids.length, status: 'pending' }, '已进入异步注销流程');
});

export default router;
