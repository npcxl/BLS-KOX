/**
 * P10: Security Center API
 *
 * 路由:
 *   GET    /system/security/stats        — 安全态势统计
 *   GET    /system/security/rules        — 风险规则列表
 *   GET    /system/security/events       — 安全事件列表（分页）
 *   GET    /system/security/blacklist    — IP 黑名单列表
 *   POST   /system/security/blacklist    — 添加 IP 到黑名单
 *   DELETE /system/security/blacklist/:id — 移除 IP
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getRedisClient } from '../../../shared/utils/redis';
import { DEFAULT_RULES, type RiskRule } from '../../../security/event-center/risk-rules';
import { getRequestContext } from '../../../core/request-context';
import { logger } from '../../../core/logger';

const router = new Router({ prefix: '/system/security' });
const T = 'sys_ip_blacklist';

// ====== GET /stats ======
router.get('/stats', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  const redis = getRedisClient();
  let blockedIps = 0;
  if (redis) {
    try {
      const keys = await redis.keys('security:blocked_ip:*');
      blockedIps = keys.length;
    } catch { /* ignore */ }
  }

  const db = (await getDb()) as any;
  // 最近 24h 安全事件数
  const recentEvents = await db.selectFrom('sys_security_log')
    .select((eb: any) => eb.fn.countAll().as('cnt'))
    .where('create_time', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .executeTakeFirst() as any;

  // 持久化黑名单数
  const permBlocked = await db.selectFrom(T)
    .select((eb: any) => eb.fn.countAll().as('cnt'))
    .where('status', '=', '0')
    .executeTakeFirst() as any;

  // 各风险等级事件数
  const byRisk = await db.selectFrom('sys_security_log')
    .select(['risk_level', (eb: any) => eb.fn.countAll().as('cnt')])
    .where('create_time', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .groupBy('risk_level')
    .execute() as any[];

  ctx.body = {
    code: 200,
    data: {
      recentEvents: Number(recentEvents?.cnt ?? 0),
      tempBlockedIps: blockedIps,
      permBlockedIps: Number(permBlocked?.cnt ?? 0),
      byRisk: Object.fromEntries(byRisk.map((r: any) => [r.risk_level, Number(r.cnt)])),
    },
  };
});

// ====== GET /rules ======
router.get('/rules', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  ctx.body = {
    code: 200,
    data: DEFAULT_RULES.map((r: RiskRule) => ({
      id: r.id,
      name: r.name,
      eventTypes: r.eventTypes,
      threshold: r.threshold,
      windowSeconds: r.windowSeconds,
      riskLevel: r.riskLevel,
      actions: r.actions,
      weight: r.weight,
    })),
  };
});

// ====== GET /events ======
router.get('/events', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const page = Math.max(1, +q.pageNum || 1);
  const size = Math.min(100, +q.pageSize || 20);

  let b = db.selectFrom('sys_security_log').selectAll();

  if (q.eventType) b = b.where('event_type', '=', String(q.eventType));
  if (q.riskLevel) b = b.where('risk_level', '=', String(q.riskLevel));
  if (q.username) b = b.where('username', 'like', `%${q.username}%`);
  if (q.clientIp) b = b.where('client_ip', '=', String(q.clientIp));
  if (q.keyword) {
    b = b.where((eb: any) =>
      eb.or([
        eb('title', 'like', `%${q.keyword}%`),
        eb('detail', 'like', `%${q.keyword}%`),
      ]),
    );
  }

  const count = await (b as any).clearSelect()
    .select((eb: any) => eb.fn.countAll().as('total'))
    .executeTakeFirst();

  const rows = await b
    .orderBy('create_time', 'desc')
    .limit(size).offset((page - 1) * size)
    .execute();

  ctx.body = { code: 200, data: rows, total: Number(count?.total ?? 0) };
});

// ====== GET /blacklist ======
router.get('/blacklist', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const page = Math.max(1, +q.pageNum || 1);
  const size = Math.min(100, +q.pageSize || 20);

  let b = db.selectFrom(T).selectAll().where('status', '=', '0');

  if (q.ip) b = b.where('ip_address', 'like', `%${q.ip}%`);
  if (q.source) b = b.where('source', '=', String(q.source));

  const count = await (b as any).clearSelect()
    .select((eb: any) => eb.fn.countAll().as('total'))
    .executeTakeFirst();

  const rows = await b.orderBy('create_time', 'desc')
    .limit(size).offset((page - 1) * size)
    .execute();

  ctx.body = { code: 200, data: rows, total: Number(count?.total ?? 0) };
});

// ====== POST /blacklist ======
router.post('/blacklist', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const body = ctx.request.body as any;
  const ip = (body.ipAddress ?? body.ip ?? '').trim();
  if (!ip) { ctx.body = { code: 400, message: 'IP 地址不能为空' }; return; }

  const userId = (ctx.state.user as any)?.userId ?? '';
  const username = (ctx.state.user as any)?.username ?? '';

  await db.insertInto(T).values({
    id: generateSnowflakeId(),
    ip_address: ip,
    reason: body.reason ?? null,
    source: 'manual',
    status: '0',
    expire_at: body.expireAt ?? null,
    tenant_id: getRequestContext()?.tenantId ?? '000000',
    create_by: username,
  }).execute();

  // 同步到 Redis，使立即生效
  const redis = getRedisClient();
  if (redis) {
    const ttl = body.expireAt
      ? Math.max(1, Math.floor((new Date(body.expireAt).getTime() - Date.now()) / 1000))
      : 3600;
    try { await redis.set(`security:blocked_ip:${ip}`, '1', 'EX', ttl); } catch { /* ignore */ }
  }

  logger.info('[security] IP blacklisted', { ip, by: username });
  ctx.body = { code: 200, message: 'IP 已加入黑名单' };
});

// ====== DELETE /blacklist/:id ======
router.delete('/blacklist/:id', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const row = await db.selectFrom(T).selectAll().where('id', '=', ctx.params.id).executeTakeFirst();
  if (!row) { ctx.body = { code: 404, message: '记录不存在' }; return; }

  await db.updateTable(T).set({ status: '1' }).where('id', '=', ctx.params.id).execute();

  // 移除 Redis 中的临时封禁
  const redis = getRedisClient();
  if (redis) {
    try { await redis.del(`security:blocked_ip:${(row as any).ip_address}`); } catch { /* ignore */ }
  }

  ctx.body = { code: 200, message: 'IP 已解封' };
});

export default router;
