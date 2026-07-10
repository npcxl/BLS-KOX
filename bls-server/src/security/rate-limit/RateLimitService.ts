import { getRedisClient } from '../../shared/utils/redis';
import { logger } from '../../core/logger';
import type { RateLimitRule, RateLimitResult } from './types';

export class RateLimitService {
  private rules: RateLimitRule[];

  constructor(rules: RateLimitRule[]) {
    this.rules = rules;
  }

  getRules(): RateLimitRule[] { return this.rules; }

  /**
   * 检查限流
   * @returns { allowed, remaining, resetAt, retryAfter }
   */
  async check(
    rule: RateLimitRule,
    dimension: string,
    path: string,
  ): Promise<RateLimitResult> {
    const key = `rate:${rule.dimensions.join(':')}:${dimension}:${path}`;
    const now = Math.floor(Date.now() / 1000);
    const windowEnd = now + rule.windowSeconds;

    const client = getRedisClient();
    if (!client) return { allowed: true, remaining: rule.limit, resetAt: windowEnd, retryAfter: 0 };

    try {
      // 原子操作：INCR + EXPIRE
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, rule.windowSeconds);
      }

      const remaining = Math.max(0, rule.limit - count);
      const allowed = count <= rule.limit;

      return {
        allowed,
        remaining,
        resetAt: windowEnd,
        retryAfter: allowed ? 0 : rule.windowSeconds,
      };
    } catch (error) {
      logger.error('Rate limit check failed', { error: String(error) });
      return { allowed: true, remaining: 1, resetAt: windowEnd, retryAfter: 0 };
    }
  }
}
