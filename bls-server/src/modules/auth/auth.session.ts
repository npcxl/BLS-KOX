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
  if (!client) {
    process.stdout.write('[auth.session.saveSession] redis client missing\n');
    return;
  }

  const accessTtl = Math.max(payload.access.exp ? payload.access.exp - Math.floor(Date.now() / 1000) : 0, 1);
  const refreshHash = hashToken(payload.refreshToken);
  const stored: StoredSession = {
    userId: payload.access.userId,
    accessJti: payload.access.jti,
    refreshJti: payload.refreshJti,
    refreshHash,
  };

  process.stdout.write(`[auth.session.saveSession] key=${sessionKey(payload.access.jti)} ttl=${accessTtl} refreshKey=${refreshKey(payload.refreshJti)} refreshTtl=${payload.refreshTtlSeconds}\n`);
  await client.set(sessionKey(payload.access.jti), JSON.stringify(stored), 'EX', accessTtl);
  await client.sadd(userSessionsKey(payload.access.userId), payload.access.jti);
  await client.set(refreshKey(payload.refreshJti), refreshHash, 'EX', payload.refreshTtlSeconds);
}

export async function revokeSession(payload: { accessJti?: string; refreshJti?: string }): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    process.stdout.write('[auth.session.revokeSession] redis client missing\n');
    return;
  }
  if (payload.accessJti) {
    const removed = await client.del(sessionKey(payload.accessJti));
    process.stdout.write(`[auth.session.revokeSession] accessJti=${payload.accessJti} removed=${removed}\n`);
  }
  if (payload.refreshJti) {
    const removed = await client.del(refreshKey(payload.refreshJti));
    process.stdout.write(`[auth.session.revokeSession] refreshJti=${payload.refreshJti} removed=${removed}\n`);
  }
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    process.stdout.write('[auth.session.revokeUserSessions] redis client missing\n');
    return;
  }
  const key = userSessionsKey(userId);
  const jtis = await client.smembers(key);
  process.stdout.write(`[auth.session.revokeUserSessions] userId=${userId} sessionCount=${jtis.length}\n`);
  if (jtis.length > 0) {
    const sessionRemoved = await client.del(...jtis.map((jti) => sessionKey(jti)));
    const refreshRemoved = await client.del(...jtis.map((jti) => refreshKey(jti)));
    console.log('[auth.session.revokeUserSessions] userId=%s sessionRemoved=%s refreshRemoved=%s', userId, sessionRemoved, refreshRemoved);
  }
  const setRemoved = await client.del(key);
  console.log('[auth.session.revokeUserSessions] userId=%s setRemoved=%s', userId, setRemoved);
}

export async function getStoredSession(accessJti: string): Promise<StoredSession | null> {
  const client = getRedisClient();
  if (!client) return null;
  const value = await client.get(sessionKey(accessJti));
  return value ? (JSON.parse(value) as StoredSession) : null;
}
