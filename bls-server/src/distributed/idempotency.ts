/**
 * 幂等控制 —— 基于 Redis SET NX + 结果缓存。
 *
 * 设计：
 *   1. 请求带 Idempotency-Key 头
 *   2. 首次请求执行并缓存结果（TTL 可配）
 *   3. 重复请求直接返回缓存结果
 *
 * 使用示例：
 *   const idem = createIdempotencyService(getRedisClient());
 *   const result = await idem.check(ctx, async () => { ... });
 *
 * 协议：
 *   - Idempotency-Key 请求头
 *   - lock: 处理中锁，result: 结果缓存
 *   - TTL 默认 600s
 */
import type { Redis } from 'ioredis';
import type { Context } from 'koa';

export interface IdempotencyOptions {
  /** Key 前缀，默认 "idempotent:" */
  prefix?: string;
  /** 结果缓存时间（秒） */
  ttlSeconds?: number;
}

const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const LOCK_SUFFIX = ':lock';
const RESULT_SUFFIX = ':result';

export function createIdempotencyService(redis: Redis) {
  return {
    /**
     * 检查幂等性并执行操作。
     * 如果请求没有 Idempotency-Key，直接执行。
     * 如果有且是首次请求，执行并缓存结果。
     * 如果有且是重复请求，返回缓存结果。
     */
    async check<T>(
      ctx: Context,
      handler: () => Promise<T>,
      options: IdempotencyOptions = {},
    ): Promise<T> {
      const idempotencyKey = ctx.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) {
        return handler();
      }

      const prefix = options.prefix ?? 'idempotent:';
      const ttl = options.ttlSeconds ?? 600;
      const lockKey = prefix + idempotencyKey + LOCK_SUFFIX;
      const resultKey = prefix + idempotencyKey + RESULT_SUFFIX;

      // 1. 检查是否有缓存结果
      const cached = await redis.get(resultKey);
      if (cached) {
        return JSON.parse(cached) as T;
      }

      // 2. 尝试获取处理锁
      const acquired = await redis.set(lockKey, 'processing', 'PX', 60000, 'NX');
      if (acquired !== 'OK') {
        // 请求正在处理中
        ctx.status = 409;
        ctx.body = { code: 409, message: '请求正在处理中，请勿重复提交' };
        throw new Error('IDEMPOTENT_CONFLICT');
      }

      try {
        // 3. 执行目标操作
        const result = await handler();
        // 4. 缓存结果
        await redis.set(resultKey, JSON.stringify(result), 'PX', ttl * 1000);
        return result;
      } catch (err) {
        // 5. 失败时释放锁
        await redis.del(lockKey);
        throw err;
      }
    },
  };
}
