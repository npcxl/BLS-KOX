/**
 * P12: Webhook Platform
 *
 * POST   /api/system/webhooks           注册 Webhook
 * GET    /api/system/webhooks           列表
 * PUT    /api/system/webhooks/:id       更新
 * DELETE /api/system/webhooks/:id       删除
 * POST   /api/system/webhooks/:id/test  测试发送
 * POST   /api/system/webhooks/:id/retry 重试失败
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { jwtAuth } from '../../../middleware/auth';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { createHash, createHmac } from 'crypto';

const router = new Router({ prefix: '/system/webhooks' });

/** 注册 Webhook */
router.post('/', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const b: any = ctx.request.body ?? {};
  const secret = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 32);

  const id = generateSnowflakeId().toString();
  await (await getDb()).insertInto('sys_webhook').values({
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
  const rows = await (await getDb()).selectFrom('sys_webhook').selectAll().where('tenant_id', '=', tid).execute();
  ctx.body = { code: 200, data: rows };
});

/** 测试发送 */
router.post('/:id/test', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const webhook = await (await getDb()).selectFrom('sys_webhook').selectAll()
    .where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;

  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  try {
    const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', webhook.secret).update(payload).digest('hex');

    await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
      body: payload,
    });

    ctx.body = { code: 200, message: '测试发送成功' };
  } catch (err: any) {
    ctx.body = { code: 500, message: `发送失败: ${err.message}` };
  }
});

/** 重试失败的 Webhook */
router.post('/:id/retry', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const webhook = await (await getDb()).selectFrom('sys_webhook').selectAll()
    .where('webhook_id', '=', ctx.params.id).where('tenant_id', '=', tid).executeTakeFirst() as any;

  if (!webhook) { ctx.body = { code: 404, message: 'Webhook 不存在' }; return; }

  // 重新入队
  const { enqueue } = require('../../../queue/queue');
  await enqueue({
    tenantId: tid, jobType: 'webhook',
    jobData: { webhookId: webhook.webhook_id, url: webhook.url, secret: webhook.secret, events: webhook.events },
  });

  ctx.body = { code: 200, message: '已重新入队' };
});

export default router;
