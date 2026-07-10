/**
 * 防重放攻击服务 v2
 *
 * 执行顺序：
 *   Timestamp → Nonce格式校验 → 签名校验 → Nonce去重 → 幂等检查
 *
 * 幂等状态机：
 *   SET processing:{lockToken} NX EX ttl → GET 当前状态
 *   fingerprint 相同 → 重试 / 返回缓存
 *   fingerprint 不同 → 409 CONFLICT
 *
 * 锁释放：Lua compare-and-delete，确保只能释放自己的锁
 */

import { createHash, randomUUID } from 'crypto';
import { AppError } from '../core/errors';
import { getRedisClient } from '../shared/utils/redis';
import { SecurityErrorCode } from '../shared/constants/security-error-code';
import { buildCanonicalPayload, hmacSign, secureCompare } from '../shared/utils/signature';
import { stableStringify } from '../shared/utils/stableStringify';
import { type ReplayRule, matchRule, defaultReplayRules } from '../config/replay-protection';
import { logger } from '../core/logger';

export class SecurityError extends AppError {
  constructor(public securityCode: SecurityErrorCode, message: string, httpStatus = 401) {
    super(message, httpStatus, securityCode);
  }
}

export interface ReplayCheckParams {
  path: string; method: string;
  timestamp?: string | null; nonce?: string | null;
  signature?: string | null; idempotencyKey?: string | null;
  tenantId?: string; userId?: string; clientIp?: string;
  body?: unknown; signSecret?: string;
}

/** 幂等缓存记录（Redis 中存储结构） */
export interface IdempotencyRecord {
  state: 'processing' | 'completed';
  fingerprint: string;
  lockToken?: string;
  status?: number;
  body?: unknown;
}

export class ReplayProtectionService {
  private rules: ReplayRule[];

  constructor(rules?: ReplayRule[]) {
    this.rules = rules ?? defaultReplayRules;
  }

  findRule(path: string, method: string): ReplayRule | null {
    return matchRule(path, method, this.rules);
  }

  // ========== Timestamp ==========

  validateTimestamp(timestamp: string | null | undefined, windowSeconds: number): number {
    if (!timestamp) throw new SecurityError(SecurityErrorCode.TIMESTAMP_MISSING, '缺少 X-Timestamp 请求头');
    const ts = Number(timestamp);
    if (isNaN(ts) || ts <= 0) throw new SecurityError(SecurityErrorCode.TIMESTAMP_INVALID, 'X-Timestamp 格式无效');
    if (Math.abs(Date.now() - ts) > windowSeconds * 1000)
      throw new SecurityError(SecurityErrorCode.TIMESTAMP_EXPIRED, `时间戳过期（窗口${windowSeconds}s）`);
    return ts;
  }

  // ========== Signature ==========

  validateSignature(params: ReplayCheckParams): void {
    const { signature, signSecret } = params;
    if (!signature) throw new SecurityError(SecurityErrorCode.SIGNATURE_MISSING, '缺少 X-Signature');
    if (!signSecret) throw new SecurityError(SecurityErrorCode.SIGNATURE_INVALID, '未配置签名密钥');
    const payload = buildCanonicalPayload({
      method: params.method, path: params.path,
      timestamp: params.timestamp ?? '', nonce: params.nonce ?? '',
      tenantId: params.tenantId ?? '000000', userId: params.userId ?? 'anonymous',
      body: params.body,
    });
    if (!secureCompare(signature.toLowerCase(), hmacSign(signSecret, payload)))
      throw new SecurityError(SecurityErrorCode.SIGNATURE_INVALID, '签名校验失败');
  }

  // ========== Nonce ==========

  private nonceKey(nonce: string, tenantId?: string, userId?: string, clientIp?: string): string {
    if (tenantId && userId) return `replay:${tenantId}:${userId}:${nonce}`;
    return `replay:anonymous:${clientIp ?? 'unknown'}:${nonce}`;
  }

  private validateNonceFormat(nonce?: string | null): void {
    if (!nonce || nonce.length < 16 || nonce.length > 128)
      throw new SecurityError(SecurityErrorCode.NONCE_MISSING, '缺少或无效的 X-Nonce（16~128字节）');
  }

  private async validateNonceDedup(params: ReplayCheckParams, ttlSeconds: number): Promise<void> {
    const { nonce, tenantId, userId, clientIp } = params;
    const key = this.nonceKey(nonce!, tenantId, userId, clientIp);
    const client = getRedisClient();
    if (!client) {
      if (this.findRule(params.path, params.method)?.mode === 'signature')
        throw new SecurityError(SecurityErrorCode.REPLAY_DETECTED, 'Redis不可用，签名接口拒绝服务');
      return;
    }
    if (await client.set(key, '1', 'EX', ttlSeconds, 'NX') !== 'OK')
      throw new SecurityError(SecurityErrorCode.REPLAY_DETECTED, '检测到重复请求');
  }

  // ========== Fingerprint ==========

  buildFingerprint(params: ReplayCheckParams): string {
    return createHash('sha256').update([
      params.method.toUpperCase(),
      params.path,
      stableStringify(params.body),
    ].join('\n'), 'utf8').digest('hex');
  }

  // ========== Idempotent ==========

  private idemKey(tenantId?: string, userId?: string, key?: string): string {
    return `idempotency:${tenantId ?? '000000'}:${userId ?? 'anonymous'}:${key}`;
  }

  async checkIdempotent(params: ReplayCheckParams, ttlSeconds: number):
    Promise<{ status: 'new' | 'processing' | 'completed' | 'conflict'; cachedRecord?: IdempotencyRecord; lockToken?: string }> {
    const { idempotencyKey, tenantId, userId } = params;
    if (!idempotencyKey) throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_KEY_MISSING, '缺少 Idempotency-Key');

    const fingerprint = this.buildFingerprint(params);
    const key = this.idemKey(tenantId, userId, idempotencyKey);
    const lockToken = randomUUID();
    const processingValue = JSON.stringify({ state: 'processing', fingerprint, lockToken } as IdempotencyRecord);

    const client = getRedisClient();
    if (!client) return { status: 'new', lockToken };

    // 原子抢占 SET NX EX
    const locked = await client.set(key, processingValue, 'EX', ttlSeconds, 'NX');
    if (locked === 'OK') return { status: 'new', lockToken };

    // 未抢到，读取当前状态
    const raw = await client.get(key);
    if (!raw) throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_CONFLICT, '幂等冲突，请重试', 409);

    let record: IdempotencyRecord;
    try { record = JSON.parse(raw); } catch { throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_CONFLICT, '幂等数据异常', 409); }

    // 同一请求重试
    if (record.fingerprint === fingerprint) {
      if (record.state === 'processing') throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_PROCESSING, '请求处理中，请稍后重试', 409);
      return { status: 'completed', cachedRecord: record };
    }

    // 不同请求 → 冲突
    throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_CONFLICT, '相同 Idempotency-Key 对应不同请求内容', 409);
  }

  async saveIdempotentResult(
    idempotencyKey: string, tenantId: string | undefined, userId: string | undefined,
    fingerprint: string, httpStatus: number, body: unknown, ttlSeconds: number,
  ): Promise<void> {
    const key = this.idemKey(tenantId, userId, idempotencyKey);
    const record: IdempotencyRecord = { state: 'completed', fingerprint, status: httpStatus, body };
    const client = getRedisClient();
    if (client) {
      try {
        await client.set(key, JSON.stringify(record), 'EX', ttlSeconds);
      } catch (error) {
        logger.error('幂等缓存写失败', { event: 'idempotency_cache_write_failed', error: String(error) });
      }
    }
  }

  /** Lua compare-and-delete：只有 value 匹配才删除 */
  async releaseIdempotentLock(
    idempotencyKey: string, tenantId: string | undefined, userId: string | undefined,
    lockToken: string,
  ): Promise<void> {
    const key = this.idemKey(tenantId, userId, idempotencyKey);
    const client = getRedisClient();
    if (!client) return;

    // 读取当前值 → 校验 lockToken → 匹配才删除
    const raw = await client.get(key);
    if (!raw) return;
    try {
      const record: IdempotencyRecord = JSON.parse(raw);
      if (record.lockToken === lockToken && record.state === 'processing') {
        await client.del(key);
      }
    } catch {
      await client.del(key); // 异常数据直接清理
    }
  }

  // ========== 综合校验 ==========

  async check(params: ReplayCheckParams): Promise<{
    idempotentResult?: { status: string; cachedRecord?: IdempotencyRecord; lockToken?: string };
  }> {
    const rule = this.findRule(params.path, params.method);
    if (!rule || rule.mode === 'off') return {};

    const window = rule.windowSeconds ?? 120;
    const ttl = Math.max(rule.nonceTtlSeconds ?? 0, window * 2 + 30);

    this.validateTimestamp(params.timestamp, window);

    if (rule.mode === 'nonce' || rule.mode === 'signature') {
      this.validateNonceFormat(params.nonce);
    }
    if (rule.mode === 'signature') {
      this.validateSignature(params);
    }
    if (rule.mode === 'nonce' || rule.mode === 'signature') {
      await this.validateNonceDedup(params, ttl);
    }
    if (rule.idempotent) {
      const r = await this.checkIdempotent(params, rule.idempotentTtlSeconds ?? 3600);
      return { idempotentResult: r };
    }
    return {};
  }
}
