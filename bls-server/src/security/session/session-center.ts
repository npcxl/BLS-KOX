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

  private key(tid: string, uid: string, sid: string): string {
    return `${this.prefix}:${tid}:${uid}:${sid}`;
  }

  /** 创建 Session */
  async create(session: UserSession, ttlSeconds = 7 * 24 * 60 * 60): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      const k = this.key(session.tenantId, session.userId, session.sessionId);
      await client.set(k, JSON.stringify(session), 'EX', ttlSeconds);
    } catch (error) {
      logger.error('Session create failed', { error: String(error) });
    }
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
    } catch (error) {
      logger.error('Session revoke failed', { error: String(error) });
    }
  }

  /** 吊销用户所有 Session（修改密码/禁用时调用） */
  async revokeAll(tid: string, uid: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      const pattern = `${this.prefix}:${tid}:${uid}:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(...keys);
    } catch (error) {
      logger.error('Session revokeAll failed', { error: String(error) });
    }
  }

  /** 获取用户所有 Session */
  async list(tid: string, uid: string): Promise<UserSession[]> {
    const client = getRedisClient();
    if (!client) return [];
    try {
      const pattern = `${this.prefix}:${tid}:${uid}:*`;
      const keys = await client.keys(pattern);
      if (keys.length === 0) return [];
      const sessions = await client.mget(...keys);
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
      // 如果当前 refreshToken hash 匹配任一活跃 session，则为合法刷新
      return sessions.some((s) => s.refreshTokenHash === rtHash && s.status === 'active');
    } catch {
      return false;
    }
  }
}

export const sessionCenter = new SessionCenter();
