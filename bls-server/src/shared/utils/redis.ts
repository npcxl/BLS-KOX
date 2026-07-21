import Redis from 'ioredis';
import { env } from '../../config/env';
import { redisOperationDurationSeconds, redisOperationErrorsTotal } from '../../observability/metrics';

let redisClient: Redis | null = null;

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
