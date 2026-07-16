/**
 * 注解式限流。
 *
 * 设计：
 *   - 使用 Redis Lua INCR + EXPIRE 原子计数（与现有 RateLimitService 相同的 Lua 脚本）
 *   - 提供独立的限流检查函数，可被中间件或业务代码调用
 *
 * 使用示例：
 *   const rl = createRateLimiter(getRedisClient());
 *   const ok = await rl.check('login:ip:192.168.1.1', { limit: 20, windowSeconds: 60 });
 *   if (!ok) { ctx.throw(429); }
 */
import type { Redis } from 'ioredis';

export interface RateLimitCheck {
  /** 限流 Key */
  key: string;
  /** Key 前缀，默认 "rate:" */
  prefix?: string;
  /** 时间窗口内最大请求数 */
  limit: number;
  /** 时间窗口（秒） */
  windowSeconds: number;
}

const RATE_LIMIT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  end
  return current
`;

export function createRateLimiter(redis: Redis) {
  return {
    /**
     * 检查是否超过限流阈值。
     * @returns true = 放行, false = 超限
     */
    async check(config: RateLimitCheck): Promise<{
      allowed: boolean;
      current: number;
      limit: number;
      remaining: number;
      resetAt: number;
    }> {
      const prefix = config.prefix ?? 'rate:';
      const fullKey = prefix + config.key;

      const current = (await redis.eval(
        RATE_LIMIT_LUA,
        1,
        fullKey,
        String(config.windowSeconds),
      )) as number;

      const remaining = Math.max(0, config.limit - current);
      const ttl = await redis.ttl(fullKey);
      const resetAt = ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + config.windowSeconds * 1000;

      return {
        allowed: current <= config.limit,
        current,
        limit: config.limit,
        remaining,
        resetAt,
      };
    },
  };
}
