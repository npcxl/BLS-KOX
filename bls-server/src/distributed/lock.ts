/**
 * 分布式锁 —— 基于 Redis SET NX 实现。
 *
 * 使用示例：
 *   const lock = createDistributedLock(getRedisClient());
 *   const result = await lock.acquire('order:create:123', { leaseTime: 30 });
 *   if (result.status === 'acquired') {
 *     try { /* 业务逻辑 * / } finally { await result.unlock(); }
 *   } else if (result.status === 'busy') {
 *     // 锁被占用，返回 409
 *   } else {
 *     // Redis 不可用，降级执行
 *   }
 *
 * 协议：
 *   - SET NX PX 抢占锁
 *   - Lua 脚本 compare-and-delete 释放锁
 *   - Redis 异常时返回 unavailable，调用方自行降级
 */
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export interface LockOptions {
  /** 锁 Key 前缀，默认 "lock:" */
  prefix?: string;
  /** 获取锁的最大等待时间（秒），0 表示立即返回 */
  waitTime?: number;
  /** 锁的自动释放时间（秒），防止死锁 */
  leaseTime?: number;
}

export type LockAcquired = { status: 'acquired'; unlock: () => Promise<void> };
export type LockBusy = { status: 'busy' };
export type LockUnavailable = { status: 'unavailable' };
export type LockResult = LockAcquired | LockBusy | LockUnavailable;

const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

export function createDistributedLock(redis: Redis) {
  return {
    async acquire(key: string, options: LockOptions = {}): Promise<LockResult> {
      const prefix = options.prefix ?? 'lock:';
      const leaseTime = options.leaseTime ?? 30;
      const waitTime = options.waitTime ?? 0;
      const fullKey = prefix + key;
      const lockValue = randomUUID();

      let acquired = false;

      try {
        if (waitTime > 0) {
          const deadline = Date.now() + waitTime * 1000;
          while (Date.now() < deadline) {
            const ok = await redis.set(fullKey, lockValue, 'PX', leaseTime * 1000, 'NX');
            if (ok === 'OK') { acquired = true; break; }
            await sleep(100);
          }
        } else {
          const ok = await redis.set(fullKey, lockValue, 'PX', leaseTime * 1000, 'NX');
          acquired = ok === 'OK';
        }
      } catch (err) {
        console.error('[DistributedLock] Redis 异常', { key: fullKey, error: String(err) });
        return { status: 'unavailable' };
      }

      if (!acquired) {
        return { status: 'busy' };
      }

      const unlock = async () => {
        try {
          await redis.eval(RELEASE_LOCK_SCRIPT, 1, fullKey, lockValue);
        } catch (err) {
          console.error('[DistributedLock] 释放锁失败', { key: fullKey, error: String(err) });
        }
      };

      return { status: 'acquired', unlock };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
