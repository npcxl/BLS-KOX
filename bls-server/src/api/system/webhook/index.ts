/**
 * P12: Webhook Platform
 *
 * POST   /system/webhooks           注册
 * GET    /system/webhooks           列表
 * GET    /system/webhooks/:id/logs  投递日志
 * PUT    /system/webhooks/:id       更新
 * DELETE /system/webhooks/:id       删除
 * POST   /system/webhooks/:id/test  测试发送
 * POST   /system/webhooks/:id/retry 重试失败
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { jwtAuth } from '../../../middleware/auth';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { createHash, createHmac } from 'crypto';

const router = new Router({ prefix: '/system/webhooks' });
const T = 'sys_webhook';
const DL = 'sys_webhook_delivery';

/** 注册 Webhook */
router.post('/', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const b: any = ctx.request.body ?? {};
  const secret = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 32);
  const id = generateSnowflakeId().toString();
  await (await getDb()).insertInto(T).values({
    webhook_id: id, tenant_id: tid,
    name: b.name, url: b.url, events: JSON.stringify(b.events ?? []),
    secret, status: '0', enabled: true,
    created_at: new Date(), updated_at: new Date(),
  } as any).execute();
  ctx.body = { code: 200, data: { webhookId: id, secret }, message: '注册成功' };
});

/** 获取 Webhook 列表 */
router.get('/', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const rows = await (await getDb()).selectFrom(T).selectAll().where('tenant_id', '=', tid).orderBy('created_at', 'desc').execute();
  ctx.body = { code: 200, data: rows };
});

/** 更新 Webhook */
router.put('/:id', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const b: any = ctx.request.body ?? {};
  const db = await getDb();
  const row = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!row) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  await db.updateTable(T).set({
    name: b.name ?? row.name,
    url: b.url ?? row.url,
    events: b.events ? JSON.stringify(b.events) : row.events,
    enabled: b.enabled !== undefined ? b.enabled : row.enabled,
    updated_at: new Date(),
  } as any).where('webhook_id', '=', ctx.params.id).execute();

  ctx.body = { code: 200, message: '更新成功' };
});

/** 删除 Webhook */
router.delete('/:id', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const db = await getDb();
  await db.deleteFrom(T).where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

/** 获取投递日志 */
router.get('/:id/logs', jwtAuth(), async (ctx: Context) => {
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
router.post('/:id/test', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const db = await getDb();
  const webhook = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  try {
    const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', webhook.secret).update(payload).digest('hex');
    const start = Date.now();
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
      body: payload,
    });
    const responseBody = await res.text();
    const status = res.ok ? 'success' : 'failed';

    // 记录投递日志
    await db.insertInto(DL).values({
      id: generateSnowflakeId().toString(),
      webhook_id: webhook.webhook_id,
      event: 'test',
      payload,
      status,
      response_code: res.status,
      response_body: responseBody.slice(0, 500),
      error_message: res.ok ? null : `HTTP ${res.status}`,
      attempt: 1,
      tenant_id: tid,
    } as any).execute();

    ctx.body = { code: res.ok ? 200 : 500, message: res.ok ? '测试发送成功' : `发送失败: HTTP ${res.status}`, data: { responseCode: res.status, elapsedMs: Date.now() - start } };
  } catch (err: any) {
    await db.insertInto(DL).values({
      id: generateSnowflakeId().toString(),
      webhook_id: webhook.webhook_id,
      event: 'test',
      status: 'failed',
      error_message: String(err.message),
      attempt: 1,
      tenant_id: tid,
    } as any).execute();
    ctx.body = { code: 500, message: `发送失败: ${err.message}` };
  }
});

/** 重试 */
router.post('/:id/retry', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const db = await getDb();
  const webhook = await db.selectFrom(T).selectAll().where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;
  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  const { enqueue } = require('../../../queue/queue');
  await enqueue({
    tenantId: tid, jobType: 'webhook',
    jobData: { webhookId: webhook.webhook_id, url: webhook.url, secret: webhook.secret, events: webhook.events, event: (ctx.request.body as any)?.event ?? 'manual_retry' },
  });
  ctx.body = { code: 200, message: '已重新入队' };
});

export default router;
