/**
 * Blocked IP 中间件
 *
 * 在请求入口检查 IP 是否被封禁（Redis + 持久化黑名单）
 * 被封禁的 IP 直接返回 403
 */
import type { Context, Next } from 'koa';
import { getRedisClient } from '../../shared/utils/redis';
import { getDb } from '../../core/database';
import { writeSecurityLog, actorFromCtx, SecurityEventType } from '../../core/security-audit';
import { logger } from '../../core/logger';

export function blockedIpMiddleware() {
  return async (ctx: Context, next: Next) => {
    const ip = (ctx.ip ?? ctx.request.ip ?? '').replace(/^::ffff:/, '');

    // 1. 检查 Redis 临时封禁（event-center BLOCK_IP 写入，1h 过期）
    const redis = getRedisClient();
    if (redis) {
      try {
        const blocked = await redis.exists(`security:blocked_ip:${ip}`);
        if (blocked) {
          ctx.status = 403;
          ctx.body = { code: 403, message: 'IP 已被临时封禁' };
          logger.warn('[security] request blocked by Redis', { ip });
          return;
        }
      } catch { /* ignore, fall through */ }
    }

    // 2. 检查持久化黑名单表
    try {
      const db = await getDb();
      const row = await (db as any)
        .selectFrom('sys_ip_blacklist')
        .select('id')
        .where('ip_address', '=', ip)
        .where('status', '=', '0')
        .where((eb: any) => eb.or([
          eb('expire_at', 'is', null),
          eb('expire_at', '>', new Date()),
        ]))
        .executeTakeFirst();
      if (row) {
        ctx.status = 403;
        ctx.body = { code: 403, message: 'IP 已被加入黑名单' };
        logger.warn('[security] request blocked by blacklist', { ip });
        return;
      }
    } catch { /* ignore, fall through */ }

    await next();
  };
}
