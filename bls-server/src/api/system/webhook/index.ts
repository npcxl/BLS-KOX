/**
 * P12: Webhook Platform
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { createHash, createHmac } from 'crypto';
import { validateWebhookUrl } from './validate';
import { logger } from '../../../core/logger';
import type { ForbiddenError } from '../../../core/errors';

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
  const tid = getCurrentTenantId() ?? '000000';
  const b: any = ctx.request.body ?? {};

  const valid = await validateWebhookUrl(b.url);
  if (!valid.valid) { ctx.body = { code: 400, message: valid.error }; return; }

  const secret = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 32);
  const id = generateSnowflakeId().toString();
  await (await getDb()).insertInto(T).values({
    webhook_id: id, tenant_id: tid,
    name: b.name, url: b.url.trim(), events: JSON.stringify(b.events ?? []),
    secret, status: '0', enabled: true,
    created_at: new Date(), updated_at: new Date(),
  } as any).execute();
  ctx.body = { code: 200, data: { webhookId: id, secret }, message: '注册成功' };
});

/** 获取列表 */
router.get('/', jwtAuth(), hasPerm('system:webhook:list'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const rows = await (await getDb()).selectFrom(T).selectAll().where('tenant_id', '=', tid).orderBy('created_at', 'desc').execute();
  ctx.body = { code: 200, data: rows };
});

/** 更新 */
router.put('/:id', jwtAuth(), hasPerm('system:webhook:edit'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
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
    enabled: b.enabled !== undefined ? b.enabled : row.enabled,
    updated_at: new Date(),
  } as any).where('webhook_id', '=', ctx.params.id).execute();

  ctx.body = { code: 200, message: '更新成功' };
});

/** 删除 */
router.delete('/:id', jwtAuth(), hasPerm('system:webhook:remove'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const db = await getDb();
  await db.deleteFrom(T).where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).execute();
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
  const tid = getCurrentTenantId() ?? '000000';
  const db = await getDb();
  const webhook = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString() });
  const signature = createHmac('sha256', webhook.secret).update(payload).digest('hex');
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

/** 重试 */
router.post('/:id/retry', jwtAuth(), hasPerm('system:webhook:logs'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const db = await getDb();
  const webhook = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  const { enqueue } = require('../../../queue/queue');
  await enqueue({
    tenantId: tid, jobType: 'webhook',
    jobData: {
      webhookId: webhook.webhook_id, url: webhook.url, secret: webhook.secret,
      events: webhook.events, event: (ctx.request.body as any)?.event ?? 'manual_retry',
      tenantId: tid,
    },
  });
  ctx.body = { code: 200, message: '已重新入队' };
});

/** 内联 logDelivery（避免引用 webhook.job 的循环依赖） */
async function logDeliveryLocal(
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
