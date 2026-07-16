/**
 * 分布式锁 —— 基于 Redis SET NX 实现。
 *
 * 使用示例：
 *   const lock = createDistributedLock(getRedisClient());
 *   const unlock = await lock.acquire('order:create:123', { leaseTime: 30 });
 *   try { ... } finally { await unlock(); }
 *
 * 协议：
 *   - SET NX PX 抢占锁
 *   - Lua 脚本 compare-and-delete 释放锁
 */
import type { Redis } from 'ioredis';

export interface LockOptions {
  /** 锁 Key 前缀，默认 "lock:" */
  prefix?: string;
  /** 获取锁的最大等待时间（秒），0 表示立即返回 */
  waitTime?: number;
  /** 锁的自动释放时间（秒），防止死锁 */
  leaseTime?: number;
}

const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

export function createDistributedLock(redis: Redis) {
  return {
    /**
     * 获取分布式锁，返回释放函数。
     * 获取失败时返回 null（waitTime=0）或抛出异常。
     */
    async acquire(key: string, options: LockOptions = {}): Promise<() => Promise<void> | null> {
      const prefix = options.prefix ?? 'lock:';
      const leaseTime = options.leaseTime ?? 30;
      const waitTime = options.waitTime ?? 0;
      const fullKey = prefix + key;
      const lockValue = crypto.randomUUID();

      // 尝试获取锁
      let acquired = false;

      if (waitTime > 0) {
        const deadline = Date.now() + waitTime * 1000;
        while (Date.now() < deadline) {
          const ok = await redis.set(fullKey, lockValue, 'PX', leaseTime * 1000, 'NX');
          if (ok === 'OK') {
            acquired = true;
            break;
          }
          await sleep(100);
        }
      } else {
        const ok = await redis.set(fullKey, lockValue, 'PX', leaseTime * 1000, 'NX');
        acquired = ok === 'OK';
      }

      if (!acquired) {
        return null;
      }

      // 返回释放函数
      return async () => {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, fullKey, lockValue);
      };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
