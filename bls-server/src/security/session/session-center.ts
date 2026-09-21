/**
 * Session Center 设计（Phase 4 基础，不替换现有认证）
 *
 * Redis Key 规范：
 *   session:{tenantId}:{userId}:{sessionId}
 *
 * 目标能力：
 *   - 查看当前用户所有活跃设备
 *   - 踢出单个设备
 *   - 修改密码后所有设备失效
 *   - 用户禁用后 Session 立即失效
 *   - Refresh Token Reuse Detection
 */

import { getRedisClient } from '../../shared/utils/redis';
import { logger } from '../../core/logger';

export interface UserSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  accessJti?: string;
  refreshJti?: string;
  deviceId?: string;
  ip: string;
  userAgent: string;
  loginTime: number;
  lastActiveTime: number;
  status: 'active' | 'revoked';
  refreshTokenHash: string;
}

export class SessionCenter {
  private prefix = 'session';
  private indexPrefix = 'session-index';
  private tenantIndexPrefix = 'session-tenant-index';

  private key(tid: string, uid: string, sid: string): string {
    return `${this.prefix}:${tid}:${uid}:${sid}`;
  }

  private indexKey(tid: string, uid: string): string {
    return `${this.indexPrefix}:${tid}:${uid}`;
  }

  /** 租户 → 用户索引：用于“停用租户时一次性吊销全部会话” */
  private tenantIndexKey(tid: string): string {
    return `${this.tenantIndexPrefix}:${tid}`;
  }

  /** 创建 Session */
  async create(session: UserSession, ttlSeconds = 7 * 24 * 60 * 60): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      const k = this.key(session.tenantId, session.userId, session.sessionId);
      await client.set(k, JSON.stringify(session), 'EX', ttlSeconds);
      // 维护 Session Index（替代 KEYS 命令）
      await client.sadd(this.indexKey(session.tenantId, session.userId), session.sessionId);
      await client.expire(this.indexKey(session.tenantId, session.userId), ttlSeconds);
      // 维护租户级索引（阶段一：租户停用 → revokeAllForTenant）
      await client.sadd(this.tenantIndexKey(session.tenantId), session.userId);
      await client.expire(this.tenantIndexKey(session.tenantId), ttlSeconds);
    } catch (error) {
      logger.error('Session create failed', { error: String(error) });
    }
  }

  /** 获取单个 Session */
  async get(tid: string, uid: string, sid: string): Promise<UserSession | null> {
    const client = getRedisClient();
    if (!client) return null;
    try {
      const raw = await client.get(this.key(tid, uid, sid));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** 校验 Session 是否有效 */
  async validate(tid: string, uid: string, sid: string): Promise<boolean> {
    const session = await this.get(tid, uid, sid);
    return session !== null && session.status === 'active';
  }

  /** 刷新最后活跃时间 */
  async touch(tid: string, uid: string, sid: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      const k = this.key(tid, uid, sid);
      const raw = await client.get(k);
      if (raw) {
        const session: UserSession = JSON.parse(raw);
        session.lastActiveTime = Date.now();
        await client.set(k, JSON.stringify(session), 'KEEPTTL');
      }
    } catch (error) {
      logger.error('Session touch failed', { error: String(error) });
    }
  }

  /** 吊销单个 Session */
  async revoke(tid: string, uid: string, sid: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      await client.del(this.key(tid, uid, sid));
      await client.srem(this.indexKey(tid, uid), sid);
    } catch (error) {
      logger.error('Session revoke failed', { error: String(error) });
    }
  }

  /** 吊销用户所有 Session（使用 Session Index，不使用 KEYS） */
  async revokeAll(tid: string, uid: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      const idxKey = this.indexKey(tid, uid);
      const members = await client.smembers(idxKey);
      if (members.length > 0) {
        const sessionKeys = members.map((sid: string) => this.key(tid, uid, sid));
        await client.del(...sessionKeys);
        await client.del(idxKey);
      }
      await client.srem(this.tenantIndexKey(tid), uid).catch(() => {});

      // 同步清理 legacy session keys（auth:session:* / auth:refresh:* / auth:user-sessions:*）
      const legacyKey = `auth:user-sessions:${uid}`;
      const jtis = await client.smembers(legacyKey);
      if (jtis.length > 0) {
        await client.del(...jtis.map((j: string) => `auth:session:${j}`));
        await client.del(...jtis.map((j: string) => `auth:refresh:${j}`));
      }
      await client.del(legacyKey);
    } catch (error) {
      logger.error('Session revokeAll failed', { error: String(error) });
    }
  }

  /**
   * 吊销一个租户下**所有用户**的会话。
   * 用于租户停用 / 过期 / offboarding —— 必须立即让该租户全部 access/refresh token 失效。
   *
   * @returns 被吊销会话的用户数
   */
  async revokeAllForTenant(tid: string): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;
    try {
      const idxKey = this.tenantIndexKey(tid);
      const users = await client.smembers(idxKey);
      for (const uid of users) {
        await this.revokeAll(tid, uid);
      }
      await client.del(idxKey);
      return users.length;
    } catch (error) {
      logger.error('Session revokeAllForTenant failed', { tenantId: tid, error: String(error) });
      return 0;
    }
  }

  /** 获取用户所有 Session（使用 Session Index） */
  async list(tid: string, uid: string): Promise<UserSession[]> {
    const client = getRedisClient();
    if (!client) return [];
    try {
      const idxKey = this.indexKey(tid, uid);
      const members = await client.smembers(idxKey);
      if (members.length === 0) return [];
      const sessionKeys = members.map((sid: string) => this.key(tid, uid, sid));
      const sessions = await client.mget(...sessionKeys);
      return sessions.filter(Boolean).map((s) => JSON.parse(s as string));
    } catch {
      return [];
    }
  }

  /** Refresh Token 复用检测 */
  async detectReuse(rtHash: string, tid: string, uid: string): Promise<boolean> {
    const client = getRedisClient();
    if (!client) return false;
    try {
      const sessions = await this.list(tid, uid);
      return sessions.some((s) => s.refreshTokenHash === rtHash && s.status === 'active');
    } catch {
      return false;
    }
  }
}

export const sessionCenter = new SessionCenter();
