import Redis from 'ioredis';
import { env } from '../../config/env';

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!env.redis.enabled) return null;
  if (!client) {
    client = new Redis({
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password || undefined,
      keyPrefix: env.redis.keyPrefix,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
  }
  return client;
}
