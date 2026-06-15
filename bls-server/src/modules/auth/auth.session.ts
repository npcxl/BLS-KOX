import { getRedisClient } from '../../shared/utils/redis';
import { JwtPayload } from '../../shared/types/current-user';

const ACCESS_TTL_SECONDS = 60 * 15;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;

function accessKey(jti: string) {
  return `auth:access:${jti}`;
}

function refreshKey(jti: string) {
  return `auth:refresh:${jti}`;
}

export async function storeSession(payload: JwtPayload & { jti: string }, refreshJti: string) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.set(accessKey(payload.jti), JSON.stringify(payload), 'EX', ACCESS_TTL_SECONDS);
  await redis.set(refreshKey(refreshJti), JSON.stringify(payload), 'EX', REFRESH_TTL_SECONDS);
}

export async function revokeSession(accessJti: string, refreshJti?: string) {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.del(accessKey(accessJti));
  if (refreshJti) await redis.del(refreshKey(refreshJti));
}

export async function revokeAllUserSessions(userId: string) {
  const redis = getRedisClient();
  if (!redis) return;
  const keys = await redis.keys(`auth:access:*`);
  const matched = [] as string[];
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const payload = JSON.parse(raw) as JwtPayload;
      if (payload.userId === userId) matched.push(key);
    } catch {}
  }
  if (matched.length) await redis.del(...matched);
}
