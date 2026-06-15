import { createHash } from 'crypto';
import { getRedisClient } from '../../shared/utils/redis';
import { TokenPayload } from '../../shared/utils/jwt';

const SESSION_PREFIX = 'auth:session:';
const USER_SESSIONS_PREFIX = 'auth:user-sessions:';
const REFRESH_PREFIX = 'auth:refresh:';

function sessionKey(jti: string) {
  return `${SESSION_PREFIX}${jti}`;
}

function userSessionsKey(userId: string) {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

function refreshKey(jti: string) {
  return `${REFRESH_PREFIX}${jti}`;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export type StoredSession = {
  userId: string;
  accessJti: string;
  refreshJti: string;
  refreshHash: string;
};

export async function saveSession(payload: {
  access: TokenPayload;
  refreshToken: string;
  refreshJti: string;
  refreshTtlSeconds: number;
}): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  const accessTtl = Math.max(payload.access.exp ? payload.access.exp - Math.floor(Date.now() / 1000) : 0, 1);
  const refreshHash = hashToken(payload.refreshToken);
  const stored: StoredSession = {
    userId: payload.access.userId,
    accessJti: payload.access.jti,
    refreshJti: payload.refreshJti,
    refreshHash,
  };

  await client.set(sessionKey(payload.access.jti), JSON.stringify(stored), 'EX', accessTtl);
  await client.sadd(userSessionsKey(payload.access.userId), payload.access.jti);
  await client.set(refreshKey(payload.refreshJti), refreshHash, 'EX', payload.refreshTtlSeconds);
}

export async function revokeSession(payload: { accessJti?: string; refreshJti?: string }): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  if (payload.accessJti) await client.del(sessionKey(payload.accessJti));
  if (payload.refreshJti) await client.del(refreshKey(payload.refreshJti));
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  const jtis = await client.smembers(userSessionsKey(userId));
  if (jtis.length > 0) {
    await client.del(...jtis.map((jti) => sessionKey(jti)));
    await client.del(...jtis.map((jti) => refreshKey(jti)));
  }
  await client.del(userSessionsKey(userId));
}

export async function getStoredSession(accessJti: string): Promise<StoredSession | null> {
  const client = getRedisClient();
  if (!client) return null;
  const value = await client.get(sessionKey(accessJti));
  return value ? (JSON.parse(value) as StoredSession) : null;
}
