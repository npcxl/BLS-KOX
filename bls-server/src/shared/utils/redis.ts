import Redis from 'ioredis';
import { env } from '../../config/env';

let redisClient: Redis | null = null;

export function getRedisClient() {
  if (!env.redis.enabled) return null;
  if (!redisClient) {
    redisClient = new Redis({
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password || undefined,
      lazyConnect: true,
      keyPrefix: env.redis.keyPrefix,
      maxRetriesPerRequest: 1,
    });
  }
  return redisClient;
}

export async function connectRedis() {
  const client = getRedisClient();
  if (!client) return null;
  if (client.status === 'ready') return client;
  if (client.status === 'connecting' || client.status === 'connect') return client;
  await client.connect();
  return client;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
