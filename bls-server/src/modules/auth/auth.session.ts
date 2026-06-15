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

export async function storeSession(accessPayload: TokenPayload, refreshJti: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  const accessTtl = Math.max(accessPayload.exp ? accessPayload.exp - Math.floor(Date.now() / 1000) : 0, 1);
  await client.set(sessionKey(accessPayload.jti), JSON.stringify({ userId: accessPayload.userId, refreshJti }), 'EX', accessTtl);
  await client.sadd(userSessionsKey(accessPayload.userId), accessPayload.jti);
  await client.set(refreshKey(refreshJti), accessPayload.jti, 'EX', 7 * 24 * 60 * 60);
}

export async function revokeSession(accessJti?: string, refreshJti?: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  if (accessJti) await client.del(sessionKey(accessJti));
  if (refreshJti) await client.del(refreshKey(refreshJti));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  const jtis = await client.smembers(userSessionsKey(userId));
  if (jtis.length > 0) {
    await client.del(jtis.map((jti) => sessionKey(jti)));
  }
  await client.del(userSessionsKey(userId));
}
