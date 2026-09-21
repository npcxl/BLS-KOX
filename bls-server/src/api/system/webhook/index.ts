/**
 * Webhook Platform
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { getCurrentTenantId, requireTenantId } from '../../../middleware/tenant';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { createHash, createHmac } from 'crypto';
import { validateWebhookUrl } from './validate';
import { logger } from '../../../core/logger';
import type { ForbiddenError } from '../../../core/errors';
import { entitlementService } from '../../../services/entitlement-service';
import { quotaService } from '../../../services/quota-service';
import { FEATURE_KEYS, QUOTA_KEYS } from '../../../shared/constants/entitlements';
import { encryptSecret, decryptSecret } from '../../../shared/utils/secret-crypto';

/** 阶段五：DB 中 secret 为 AES-256-GCM 密文；兼容历史明文 */
function safeDecryptSecret(value: unknown): string | null {
  if (!value) return null;
  try {
    return decryptSecret(String(value));
  } catch {
    return null;
  }
}

/** 列表 / 详情只返回脱敏 secret */
function maskSecret(value: unknown): string | null {
  const plain = safeDecryptSecret(value);
  if (!plain) return null;
  if (plain.length <= 8) return '****';
  return `${plain.slice(0, 4)}****${plain.slice(-4)}`;
}

const router = new Router({ prefix: '/system/webhooks' });
const T = 'sys_webhook';
const DL = 'sys_webhook_delivery';
const FETCH_TIMEOUT = 10_000;

/** AbortController fetch */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 注册 Webhook */
router.post('/', jwtAuth(), hasPerm('system:webhook:add'), async (ctx: Context) => {
  const tid = requireTenantId();
  const b: any = ctx.request.body ?? {};

  // 阶段三：套餐权益 + Webhook 数量配额
  await entitlementService.assertFeature(tid, FEATURE_KEYS.WEBHOOK, 'Webhook');
  const idem = String(ctx.get('Idempotency-Key') ?? '').trim() || undefined;
  await quotaService.consume(tid, QUOTA_KEYS.MAX_WEBHOOKS, 1, { idempotencyKey: idem, reason: 'webhook.create' });

  const valid = await validateWebhookUrl(b.url);
  if (!valid.valid) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_WEBHOOKS, 1).catch(() => {});
    ctx.body = { code: 400, message: valid.error };
    return;
  }

  const secret = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 32);
  const id = generateSnowflakeId().toString();
  try {
    await (await getDb()).insertInto(T).values({
      webhook_id: id, tenant_id: tid,
      name: b.name, url: b.url.trim(), events: JSON.stringify(b.events ?? []),
      // 阶段五：secret 以 AES-256-GCM 密文落库
      secret: encryptSecret(secret), status: '0',
      created_at: new Date(), updated_at: new Date(),
    } as any).execute();
  } catch (error) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_WEBHOOKS, 1).catch(() => {});
    throw error;
  }
  // 明文 secret 仅此一次返回
  ctx.body = { code: 200, data: { webhookId: id, secret }, message: '注册成功' };
});

/** 获取列表（secret 脱敏，不返回明文） */
router.get('/', jwtAuth(), hasPerm('system:webhook:list'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const rows = await (await getDb()).selectFrom(T).selectAll().where('tenant_id', '=', tid).orderBy('created_at', 'desc').execute();
  ctx.body = {
    code: 200,
    data: rows.map((row: any) => ({ ...row, secret: maskSecret(row.secret) })),
  };
});

/** 更新 */
router.put('/:id', jwtAuth(), hasPerm('system:webhook:edit'), async (ctx: Context) => {
  const tid = requireTenantId();
  const b: any = ctx.request.body ?? {};
  const db = await getDb();
  const row = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!row) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  if (b.url) {
    const valid = await validateWebhookUrl(b.url);
    if (!valid.valid) { ctx.body = { code: 400, message: valid.error }; return; }
  }

  await db.updateTable(T).set({
    name: b.name ?? row.name,
    url: b.url ? b.url.trim() : row.url,
    events: b.events ? JSON.stringify(b.events) : row.events,
    status: b.status !== undefined ? b.status : row.status,
    updated_at: new Date(),
  } as any).where('webhook_id', '=', ctx.params.id).execute();

  ctx.body = { code: 200, message: '更新成功' };
});

/** 删除 */
router.delete('/:id', jwtAuth(), hasPerm('system:webhook:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const db = await getDb();
  const result: any = await db.deleteFrom(T)
    .where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid)
    .executeTakeFirst();
  // 阶段三：删除成功 → 归还 Webhook 配额
  const deleted = Number(result?.numDeletedRows ?? 0);
  if (deleted > 0) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_WEBHOOKS, deleted).catch(() => {});
  }
  ctx.body = { code: 200, message: '删除成功' };
});

/** 投递日志 */
router.get('/:id/logs', jwtAuth(), hasPerm('system:webhook:logs'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const q: any = ctx.query;
  const page = Math.max(1, +q.pageNum || 1);
  const size = Math.min(100, +q.pageSize || 20);

  let b = (await getDb()).selectFrom(DL).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid);
  if (q.event) b = b.where('event', '=', String(q.event));

  const count = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('created_at', 'desc').limit(size).offset((page - 1) * size).execute();

  ctx.body = { code: 200, data: rows, total: Number(count?.total ?? 0) };
});

/** 测试发送 */
router.post('/:id/test', jwtAuth(), hasPerm('system:webhook:test'), async (ctx: Context) => {
  const tid = requireTenantId();
  const db = await getDb();
  const webhook = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString() });
  const signature = createHmac('sha256', safeDecryptSecret(webhook.secret) ?? '').update(payload).digest('hex');
  const start = Date.now();

  try {
    const res = await fetchWithTimeout(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
      body: payload,
      redirect: 'manual',
    });
    const responseBody = await res.text();
    const status = res.ok ? 'success' : 'failed';

    await logDeliveryLocal(db, webhook.webhook_id, 'test', payload, status, res.status, responseBody.slice(0, 500), res.ok ? null : `HTTP ${res.status}`, 1, tid);

    ctx.body = { code: res.ok ? 200 : 500, message: res.ok ? '测试发送成功' : `发送失败: HTTP ${res.status}`, data: { responseCode: res.status, elapsedMs: Date.now() - start } };
  } catch (err: any) {
    await logDeliveryLocal(db, webhook.webhook_id, 'test', payload, 'failed', null, null, err.name === 'AbortError' ? '请求超时' : String(err.message), 1, tid);
    ctx.body = { code: 500, message: `发送失败: ${err.message}` };
  }
});

/** 重试 handler — 导出以便测试 */
export async function handleRetry(ctx: Context, getDbFn: () => any, getTenantFn: () => string | null | undefined, enqueueFn: (p: any) => Promise<void>) {
  const tid = getTenantFn();
  if (!tid) { ctx.body = { code: 403, message: '缺少租户上下文' }; return; }
  const db = await getDbFn();
  const webhook = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  await enqueueFn({
    tenantId: tid, jobType: 'webhook',
    jobData: {
      webhookId: webhook.webhook_id, url: webhook.url,
      // 阶段五：DB 中的 secret 是密文，投递 Job 需要明文（仅在内存中传递）
      secret: safeDecryptSecret(webhook.secret) ?? '',
      events: webhook.events, event: (ctx.request.body as any)?.event ?? 'manual_retry',
      tenantId: tid,
    },
  });
  ctx.body = { code: 200, message: '已重新入队' };
}

/** 重试 */
router.post('/:id/retry', jwtAuth(), hasPerm('system:webhook:logs'), async (ctx: Context) => {
  const { enqueue } = require('../../../queue/queue');
  await handleRetry(ctx, getDb, getCurrentTenantId, enqueue);
});

/** 内联 logDelivery（避免引用 webhook.job 的循环依赖） */
export async function logDeliveryLocal(
  db: any, webhookId: string, event: string, payload: string,
  status: string, responseCode: number | null, responseBody: string | null,
  errorMessage: string | null, attempt: number, tenantId: string,
) {
  try {
    await db.insertInto(DL).values({
      id: generateSnowflakeId().toString(),
      webhook_id: webhookId, event, payload, status,
      response_code: responseCode, response_body: responseBody,
      error_message: errorMessage, attempt, tenant_id: tenantId,
    } as any).execute();
  } catch (err) {
    logger.error('[webhook] log delivery failed', { webhookId, error: String(err) });
  }
}

export default router;
