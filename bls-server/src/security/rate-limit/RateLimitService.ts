import { getRedisClient } from '../../shared/utils/redis';
import { logger } from '../../core/logger';
import type { RateLimitRule, RateLimitResult } from './types';

/** 原子 INCR + EXPIRE Lua */
const LUA_INCR_EXPIRE = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  local ttl = redis.call('TTL', KEYS[1])
  return { current, ttl }
`;

export class RateLimitService {
  private rules: RateLimitRule[];

  constructor(rules: RateLimitRule[]) { this.rules = rules; }
  getRules(): RateLimitRule[] { return this.rules; }

  async check(rule: RateLimitRule, dimension: string, routeKey: string): Promise<RateLimitResult> {
    const key = `rate:${rule.dimensions.join(':')}:${dimension}:${routeKey}`;
    const client = getRedisClient();
    if (!client) return { allowed: true, remaining: rule.limit, resetAt: 0, retryAfter: 0 };

    try {
      const result = await client.eval(LUA_INCR_EXPIRE, 1, key, String(rule.windowSeconds)) as [number, number];
      const count = Number(result[0]);
      const ttl = Number(result[1]);
      const remaining = Math.max(0, rule.limit - count);
      return {
        allowed: count <= rule.limit,
        remaining,
        resetAt: ttl > 0 ? Math.floor(Date.now() / 1000) + ttl : 0,
        retryAfter: count <= rule.limit ? 0 : (ttl > 0 ? ttl : rule.windowSeconds),
      };
    } catch (error) {
      logger.error('Rate limit check failed', { error: String(error) });
      return { allowed: true, remaining: 1, resetAt: 0, retryAfter: 0 };
    }
  }
}
