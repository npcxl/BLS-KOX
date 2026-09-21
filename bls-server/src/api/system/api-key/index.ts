/**
 * 外部 API Key 管理（阶段六）
 *
 * 路径：/api/system/api-key/*
 *   GET    /list              列表（不含 secret，仅密文摘要与前缀提示）
 *   POST   /add               创建 —— **明文 secret 只在本次响应中返回一次**
 *   POST   /:apiKeyId/revoke  撤销（立即失效，保留记录用于审计）
 *   PUT    /status            启用 / 停用
 *   DELETE /remove            逻辑删除
 *
 * 约束：feature.openapi 权益 + max_api_keys 配额 + 租户隔离。
 */
import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { requireTenantId } from '../../../middleware/tenant';
import { ValidationError, NotFoundError } from '../../../core/errors';
import { success } from '../../../core/response';
import { extractIds } from '../../../core/crud';
import { apiKeyService, API_KEY_SCOPES } from '../../../services/api-key-service';
import { entitlementService } from '../../../services/entitlement-service';
import { quotaService } from '../../../services/quota-service';
import { FEATURE_KEYS, QUOTA_KEYS } from '../../../shared/constants/entitlements';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../../../core/security-audit';

const router = new Router({ prefix: '/system/api-key' });
const T = 'sys_api_key';

const EXPIRE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

const createSchema = z.object({
  name: z.string().trim().min(1, 'name 不能为空').max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, '至少选择一个 scope').max(5).optional(),
  expireAt: z.string().trim().max(30).nullish(),
});

const statusSchema = z.object({
  apiKeyId: z.string().trim().min(1).max(32),
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

/** 规范化过期时间（拒绝非法日期） */
function normalizeExpireAt(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (!EXPIRE_RE.test(text)) throw new ValidationError('expireAt 格式不正确，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss');
  const normalized = text.replace('T', ' ');
  const full = normalized.length === 10 ? `${normalized} 23:59:59` : normalized.length === 16 ? `${normalized}:00` : normalized;
  const [y, m, d] = full.slice(0, 10).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new ValidationError('expireAt 不是有效日期');
  }
  return full;
}

/** GET /list */
router.get('/list', jwtAuth(), hasPerm('system:apikey:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const rows = await apiKeyService.list(tid);
  success(ctx, rows.map((row) => ({
    ...row,
    scopes: String(row.scopes ?? '').split(',').filter(Boolean),
    expired: !!row.expireAt && new Date(String(row.expireAt).replace(' ', 'T')).getTime() <= Date.now(),
  })), '查询成功');
});

/** POST /add — 明文 secret 仅返回一次 */
router.post('/add', jwtAuth(), hasPerm('system:apikey:add'), async (ctx: Context) => {
  const tid = requireTenantId();
  const body = parseOrThrow(createSchema, ctx.request.body ?? {});
  const expireAt = normalizeExpireAt(body.expireAt);

  await entitlementService.assertFeature(tid, FEATURE_KEYS.OPENAPI, '开放 API');
  await quotaService.consume(tid, QUOTA_KEYS.MAX_API_KEYS, 1, {
    idempotencyKey: String(ctx.get('Idempotency-Key') ?? '').trim() || undefined,
    reason: 'apikey.create',
  });

  try {
    const created = await apiKeyService.create({
      tenantId: tid,
      name: body.name,
      scopes: body.scopes ?? ['read'],
      expireAt,
      createdBy: (ctx.state.user as any)?.userId ?? null,
    });

    await writeSecurityLog({
      eventType: SecurityEventType.API_KEY_CREATED,
      riskLevel: RiskLevel.MEDIUM,
      title: `创建 API Key：${body.name}`,
      detail: { apiKeyId: created.apiKeyId, scopes: created.scopes, expireAt: created.expireAt },
      actor: actorFromCtx(ctx),
      route: ctx.path, method: ctx.method, source: 'api-key',
    }).catch(() => {});

    // 明文 secret / apiKey 只在此响应中出现一次，之后任何接口都不会再返回
    success(ctx, {
      apiKeyId: created.apiKeyId,
      keyId: created.keyId,
      secret: created.secret,
      apiKey: created.apiKey,
      scopes: created.scopes,
      expireAt: created.expireAt,
      notice: '请立即保存 secret，服务端不会再次返回明文',
    }, '创建成功');
  } catch (error) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_API_KEYS, 1).catch(() => {});
    throw error;
  }
});

/** POST /:apiKeyId/revoke */
router.post('/:apiKeyId/revoke', jwtAuth(), hasPerm('system:apikey:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const ok = await apiKeyService.revoke(tid, ctx.params.apiKeyId);
  if (!ok) throw new NotFoundError('API Key 不存在或已撤销');

  await quotaService.release(tid, QUOTA_KEYS.MAX_API_KEYS, 1).catch(() => {});
  await writeSecurityLog({
    eventType: SecurityEventType.API_KEY_REVOKED,
    riskLevel: RiskLevel.MEDIUM,
    title: `撤销 API Key：${ctx.params.apiKeyId}`,
    detail: { apiKeyId: ctx.params.apiKeyId },
    actor: actorFromCtx(ctx),
    route: ctx.path, method: ctx.method, source: 'api-key',
  }).catch(() => {});

  success(ctx, null, '已撤销');
});

/** PUT /status */
router.put('/status', jwtAuth(), hasPerm('system:apikey:status'), async (ctx: Context) => {
  const tid = requireTenantId();
  const body = parseOrThrow(statusSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;
  const result: any = await db.updateTable(T).set({ status: body.status })
    .where('api_key_id', '=', body.apiKeyId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();
  success(ctx, { status: body.status }, '状态修改成功');
});

/** DELETE /remove — 逻辑删除 */
router.delete('/remove', jwtAuth(), hasPerm('system:apikey:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');

  const db = (await getDb()) as any;
  const visible: any[] = await db.selectFrom(T).select(['api_key_id'])
    .where('api_key_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
  if (visible.length !== ids.length) throw new NotFoundError();

  const result: any = await db.updateTable(T).set({ deleted: 1, status: '1', revoked_at: new Date() })
    .where('api_key_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();

  const removed = Number(result?.numUpdatedRows ?? 0);
  if (removed > 0) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_API_KEYS, removed).catch(() => {});
  }
  success(ctx, { deleted: removed }, '删除成功');
});

export default router;
