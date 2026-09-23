import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../core/logger';
import { redisOperationDurationSeconds, redisOperationErrorsTotal } from '../../observability/metrics';

let redisClient: Redis | null = null;

/**
 * Redis 连接错误可见性。
 *
 * ioredis 在**没有** error 监听器时会静默吞掉连接错误（内部 silentEmit），于是「Redis 挂了」
 * 表现为会话 / 防重放 / 限流静默失效，而日志一片安静 —— 这是最危险的一类故障。
 * 这里补一个监听器让错误可见；按 30s 节流，避免断连重试把日志刷爆。
 */
const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;
let lastRedisErrorLoggedAt = 0;

function attachErrorLogging(client: Redis): void {
  client.on('error', (error: Error) => {
    const now = Date.now();
    if (now - lastRedisErrorLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) return;
    lastRedisErrorLoggedAt = now;
    logger.warn('[redis] 连接异常（会话 / 防重放 / 限流会受影响）', { error: error.message });
  });
}

function instrumentRedis(client: Redis): Redis {
  // 拦截 .call() 方法，统一采集所有 Redis 命令的耗时和错误
  const origCall = (client as any).call;
  if (origCall) {
    (client as any).call = function (...args: any[]) {
      const cmdName = typeof args[0] === 'string' ? args[0] : args[0]?.name ?? 'unknown';
      const operation = cmdName.toLowerCase();
      const end = redisOperationDurationSeconds.startTimer({ operation });

      const result = origCall.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then(
          (res: any) => { end(); return res; },
          (err: any) => {
            redisOperationErrorsTotal.inc({ operation });
            end();
            throw err;
          }
        );
      }
      return result;
    };
  }

  return client;
}

export function getRedisClient(): Redis | null {
  if (!env.redis.enabled) return null;
  if (!redisClient) {
    redisClient = new Redis({
      host: env.redis.host,
      port: env.redis.port,
      username: env.redis.username || undefined,
      password: env.redis.password || undefined,
      keyPrefix: env.redis.keyPrefix,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    instrumentRedis(redisClient);
    attachErrorLogging(redisClient);
  }
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  if (client.status === 'wait' || client.status === 'end') {
    await client.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (!redisClient) return;
  await redisClient.quit();
  redisClient = null;
}
