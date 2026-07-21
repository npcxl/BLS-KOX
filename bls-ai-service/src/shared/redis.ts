import Redis from 'ioredis';
import { env } from '../config/env';

let redisClient: Redis | null = null;

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
