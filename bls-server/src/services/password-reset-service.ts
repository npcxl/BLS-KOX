/**
 * PasswordResetService（阶段四）
 *
 * 一次性令牌（忘记密码 / 邮箱验证 / 邀请注册）：
 *   - 数据库只存 SHA-256，明文只在生成时返回一次
 *   - 单次使用：消费时用 `UPDATE ... WHERE used = 0 AND expire_time > NOW()` 保证原子，
 *     并发下只有一个请求能成功
 *   - 有效期：按用途设置 TTL
 *   - 消费成功后由调用方吊销该用户全部 Session
 */
import { randomBytes, createHash } from 'crypto';
import { execute, queryOne } from '../core/database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { logger } from '../core/logger';

export type ResetTokenPurpose = 'reset_password' | 'verify_email' | 'invite';

/** 默认有效期（分钟） */
const DEFAULT_TTL_MINUTES: Record<ResetTokenPurpose, number> = {
  reset_password: 30,
  verify_email: 24 * 60,
  invite: 72 * 60,
};

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface IssueTokenParams {
  tenantId: string;
  userId: string;
  purpose?: ResetTokenPurpose;
  ttlMinutes?: number;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface ConsumedToken {
  tenantId: string;
  userId: string;
}

export class PasswordResetService {
  /** 生成一次性令牌，返回明文（仅此一次） */
  async issue(params: IssueTokenParams): Promise<string> {
    const purpose: ResetTokenPurpose = params.purpose ?? 'reset_password';
    const ttlMinutes = params.ttlMinutes ?? DEFAULT_TTL_MINUTES[purpose];
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(raw);
    const expireTime = new Date(Date.now() + ttlMinutes * 60_000);

    await execute(
      `INSERT INTO sys_password_reset_token
         (token_id, tenant_id, user_id, token_hash, purpose, used, expire_time, client_ip, user_agent)
       VALUES
         (:tokenId, :tenantId, :userId, :tokenHash, :purpose, 0, :expireTime, :clientIp, :userAgent)`,
      {
        tokenId: generateSnowflakeId(),
        tenantId: params.tenantId,
        userId: params.userId,
        tokenHash,
        purpose,
        expireTime,
        clientIp: params.clientIp ?? null,
        userAgent: params.userAgent ?? null,
      },
    );

    logger.info('[password-reset] token issued', {
      tenantId: params.tenantId, userId: params.userId, purpose, ttlMinutes,
    });
    return raw;
  }

  /**
   * 原子消费令牌；失败（不存在 / 已使用 / 已过期 / 用途不符）返回 null。
   */
  async consume(rawToken: string, purpose: ResetTokenPurpose = 'reset_password'): Promise<ConsumedToken | null> {
    const token = String(rawToken ?? '').trim();
    if (!token) return null;
    const tokenHash = hashResetToken(token);

    const result = await execute(
      `UPDATE sys_password_reset_token
         SET used = 1, used_time = NOW()
       WHERE token_hash = :tokenHash AND purpose = :purpose AND used = 0 AND expire_time > NOW()`,
      { tokenHash, purpose },
    );
    if (Number(result?.affectedRows ?? 0) === 0) return null;

    const row = await queryOne<{ tenantId: string; userId: string }>(
      `SELECT tenant_id AS tenantId, user_id AS userId
       FROM sys_password_reset_token WHERE token_hash = :tokenHash LIMIT 1`,
      { tokenHash },
    );
    return row ? { tenantId: String(row.tenantId), userId: String(row.userId) } : null;
  }

  /** 使用户的全部未消费令牌失效（改密成功后调用，防止旧链接复用） */
  async invalidateForUser(userId: string, purpose?: ResetTokenPurpose): Promise<void> {
    if (!userId) return;
    const sql = purpose
      ? `UPDATE sys_password_reset_token SET used = 1, used_time = NOW() WHERE user_id = :userId AND purpose = :purpose AND used = 0`
      : `UPDATE sys_password_reset_token SET used = 1, used_time = NOW() WHERE user_id = :userId AND used = 0`;
    await execute(sql, purpose ? { userId, purpose } : { userId });
  }
}

export const passwordResetService = new PasswordResetService();
