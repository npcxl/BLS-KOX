import { Context, Next } from 'koa';
import { getRedisClient } from '../shared/redis';
import { getCurrentUserId } from '../core/request-context';
import { env } from '../config/env';
import { RateLimitError } from '../core/errors';
import { logger } from '../core/logger';

/** 原子 INCR + EXPIRE Lua 脚本 */
const LUA_INCR_EXPIRE = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  local ttl = redis.call('TTL', KEYS[1])
  return { current, ttl }
`;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = getRedisClient();
  if (!client) return { allowed: true, remaining: limit, retryAfter: 0 };

  try {
    const result = (await client.eval(
      LUA_INCR_EXPIRE,
      1,
      key,
      String(windowSeconds),
    )) as [number, number];

    const count = Number(result[0]);
    const ttl = Number(result[1]);
    const remaining = Math.max(0, limit - count);

    return {
      allowed: count <= limit,
      remaining,
      retryAfter: count <= limit ? 0 : (ttl > 0 ? ttl : windowSeconds),
    };
  } catch (error: any) {
    logger.error('限流检查失败', { error: error.message });
    // 降级放行
    return { allowed: true, remaining: 1, retryAfter: 0 };
  }
}

/**
 * AI 接口限流中间件
 * 按用户维度限流，支持不同路由不同限流阈值
 */
export function aiRateLimit(limitPerMinute?: number) {
  const limit = limitPerMinute ?? env.rateLimit.aiPerMinute;
  const windowSeconds = 60;

  return async (ctx: Context, next: Next): Promise<void> => {
    const userId = getCurrentUserId() || 'anonymous';
    const routeKey = ctx.path.replace(/\//g, '_');
    const key = `rate:ai:${userId}:${routeKey}`;

    const result = await checkRateLimit(key, limit, windowSeconds);

    // 设置响应头
    ctx.set('X-RateLimit-Limit', String(limit));
    ctx.set('X-RateLimit-Remaining', String(result.remaining));
    ctx.set('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + result.retryAfter));

    if (!result.allowed) {
      ctx.set('Retry-After', String(result.retryAfter));
      logger.warn('AI 接口触发限流', {
        userId,
        path: ctx.path,
        limit,
        remaining: result.remaining,
      });
      throw new RateLimitError();
    }

    await next();
  };
}
