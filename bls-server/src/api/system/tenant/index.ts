import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { extractIds } from '../../../core/crud';

const router = new Router({ prefix: '/system/tenant' });
const T = 'sys_tenant';

// ====== Zod 校验 ======

const tenantCreateSchema = z.object({
  tenantName: z.string().trim().min(1, 'tenantName 不能为空').max(100),
  domainName: z.string().trim().max(200).nullish(),
  packageId: z.string().trim().max(32).nullish(),
  contactUser: z.string().trim().max(50).nullish(),
  contactPhone: z.string().trim().max(30).nullish(),
  expireTime: z.string().trim().max(30).nullish(),
  remark: z.string().max(500).nullish(),
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

/** 域名唯一性校验（uk_tenant_domain） */
async function assertDomainAvailable(db: any, domainName: string | null | undefined, excludeTenantId?: string) {
  const domain = (domainName ?? '').trim();
  if (!domain) return null;
  let q = db.selectFrom(T).select('tenant_id').where('domain_name', '=', domain);
  const rows = await q.execute() as { tenant_id: string }[];
  const conflict = rows.find((r) => !excludeTenantId || String(r.tenant_id) !== excludeTenantId);
  if (conflict) throw new ConflictError(`域名已被占用：${domain}`);
  return domain;
}

/** 统计租户下仍然有效的业务数据（用户/角色） */
async function countTenantAssets(db: any, tenantId: string): Promise<{ users: number; roles: number }> {
  const users = await db.selectFrom('sys_user').select('user_id')
    .where('tenant_id', '=', tenantId).where('deleted', '=', 0).execute();
  const roles = await db.selectFrom('sys_role').select('role_id')
    .where('tenant_id', '=', tenantId).where('deleted', '=', 0).execute();
  return { users: users.length, roles: roles.length };
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

/** GET /public-list — 登录页租户选择（匿名，仅返回最小字段） */
router.get('/public-list', async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T)
    .select(['tenant_id', 'tenant_name', 'domain_name'])
    .where('status', '=', '0')
    .where('deleted', '=', 0)
    .orderBy('create_time', 'asc')
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

/** POST /add */
router.post('/add', jwtAuth(), hasPerm('system:tenant:add'), async (ctx: Context) => {
  const b = parseOrThrow(tenantCreateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;
  const domain = await assertDomainAvailable(db, b.domainName);
  const tenantId = generateSnowflakeId();

  await db.insertInto(T).values({
    tenant_id: tenantId,
    tenant_name: b.tenantName,
    package_id: b.packageId ?? null,
    expire_time: b.expireTime ?? null,
    domain_name: domain,
    contact_user: b.contactUser ?? null,
    contact_phone: b.contactPhone ?? null,
    status: '0',
    remark: b.remark ?? null,
    deleted: 0,
  }).execute();

  success(ctx, { tenantId }, '新增成功');
});

/** PUT /edit */
router.put('/edit', jwtAuth(), hasPerm('system:tenant:edit'), async (ctx: Context) => {
  const b = parseOrThrow(tenantUpdateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const existing = await db.selectFrom(T).select(['tenant_id'])
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0).executeTakeFirst();
  if (!existing) throw new NotFoundError();

  const domain = b.domainName === undefined ? undefined : await assertDomainAvailable(db, b.domainName, b.tenantId);

  const updateData: Record<string, any> = {};
  if (b.tenantName !== undefined) updateData.tenant_name = b.tenantName;
  if (b.packageId !== undefined) updateData.package_id = b.packageId;
  if (b.expireTime !== undefined) updateData.expire_time = b.expireTime || null;
  if (domain !== undefined) updateData.domain_name = domain;
  if (b.contactUser !== undefined) updateData.contact_user = b.contactUser;
  if (b.contactPhone !== undefined) updateData.contact_phone = b.contactPhone;
  if (b.remark !== undefined) updateData.remark = b.remark;
  if (Object.keys(updateData).length === 0) throw new ValidationError('没有可更新字段');

  const result: any = await db.updateTable(T).set(updateData)
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, null, '修改成功');
});

/**
 * PUT /status — 状态切换（独立权限 system:tenant:status）
 *
 * 策略：禁止停用平台租户；停用前若该租户仍有有效用户/角色，返回 409 并说明处理方式。
 */
router.put('/status', jwtAuth(), hasPerm('system:tenant:status'), async (ctx: Context) => {
  const b = parseOrThrow(statusSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  if (b.tenantId === PLATFORM_TENANT_ID) {
    throw new ForbiddenError('平台租户不允许停用');
  }

  const existing = await db.selectFrom(T).select(['tenant_id'])
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0).executeTakeFirst();
  if (!existing) throw new NotFoundError();

  if (b.status === '1') {
    const assets = await countTenantAssets(db, b.tenantId);
    if (assets.users > 0 || assets.roles > 0) {
      throw new ConflictError(
        `租户下仍有 ${assets.users} 个用户 / ${assets.roles} 个角色，请先删除或迁移后再停用`,
      );
    }
  }

  const result: any = await db.updateTable(T).set({ status: b.status })
    .where('tenant_id', '=', b.tenantId).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, null, '状态修改成功');
});

/**
 * DELETE /remove — 逻辑删除
 *
 * 策略：禁止删除平台租户；仍有关联用户/角色时拒绝删除；否则 deleted=1。
 */
router.delete('/remove', jwtAuth(), hasPerm('system:tenant:remove'), async (ctx: Context) => {
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  if (ids.includes(PLATFORM_TENANT_ID)) throw new ForbiddenError('平台租户不允许删除');

  const db = (await getDb()) as any;
  const visible: any[] = await db.selectFrom(T).select('tenant_id')
    .where('tenant_id', 'in', ids).where('deleted', '=', 0).execute();
  if (visible.length !== ids.length) throw new NotFoundError();

  for (const id of ids) {
    const assets = await countTenantAssets(db, id);
    if (assets.users > 0 || assets.roles > 0) {
      throw new ConflictError(
        `租户 ${id} 下仍有 ${assets.users} 个用户 / ${assets.roles} 个角色，请先清理关联数据`,
      );
    }
  }

  await db.updateTable(T).set({ deleted: 1 })
    .where('tenant_id', 'in', ids).where('deleted', '=', 0).execute();

  success(ctx, { deleted: ids.length }, '删除成功');
});

export default router;
