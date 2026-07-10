/**
 * 防重放攻击服务
 *
 * 执行顺序：
 *   Timestamp → 格式校验 → 签名校验 → Nonce去重 → 幂等检查
 *   先验签再写 Nonce，防止错误签名消耗 Nonce。
 */

import { AppError } from '../core/errors';
import { getRedisClient } from '../shared/utils/redis';
import { SecurityErrorCode } from '../shared/constants/security-error-code';
import { buildCanonicalPayload, hmacSign, secureCompare } from '../shared/utils/signature';
import { type ReplayRule, matchRule, defaultReplayRules } from '../config/replay-protection';

export class SecurityError extends AppError {
  constructor(public securityCode: SecurityErrorCode, message: string, httpStatus = 401) {
    super(message, httpStatus, securityCode);
  }
}

export interface ReplayCheckParams {
  path: string;
  method: string;
  timestamp?: string | null;
  nonce?: string | null;
  signature?: string | null;
  idempotencyKey?: string | null;
  tenantId?: string;
  userId?: string;
  clientIp?: string;
  body?: unknown;
  signSecret?: string;
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
    if (Math.abs(Date.now() - ts) > windowSeconds * 1000) throw new SecurityError(SecurityErrorCode.TIMESTAMP_EXPIRED, `请求时间戳已过期（窗口 ${windowSeconds}s）`);
    return ts;
  }

  // ========== Signature ==========

  validateSignature(params: ReplayCheckParams): void {
    const { signature, signSecret } = params;
    if (!signature) throw new SecurityError(SecurityErrorCode.SIGNATURE_MISSING, '缺少 X-Signature 请求头');
    if (!signSecret) throw new SecurityError(SecurityErrorCode.SIGNATURE_INVALID, '服务端未配置签名密钥');
    const payload = buildCanonicalPayload({
      method: params.method, path: params.path,
      timestamp: params.timestamp ?? '', nonce: params.nonce ?? '',
      tenantId: params.tenantId ?? '000000', userId: params.userId ?? 'anonymous',
      body: params.body,
    });
    if (!secureCompare(signature.toLowerCase(), hmacSign(signSecret, payload))) {
      throw new SecurityError(SecurityErrorCode.SIGNATURE_INVALID, '签名校验失败');
    }
  }

  // ========== Nonce ==========

  private nonceKey(nonce: string, tenantId?: string, userId?: string, clientIp?: string): string {
    if (tenantId && userId) return `replay:${tenantId}:${userId}:${nonce}`;
    return `replay:anonymous:${clientIp ?? 'unknown'}:${nonce}`;
  }

  private validateNonceFormat(nonce?: string | null): void {
    if (!nonce || nonce.length < 16 || nonce.length > 128) {
      throw new SecurityError(SecurityErrorCode.NONCE_MISSING, '缺少或无效的 X-Nonce（需要 16~128 字节）');
    }
  }

  private async validateNonceDedup(params: ReplayCheckParams, ttlSeconds: number): Promise<void> {
    const { nonce, tenantId, userId, clientIp } = params;
    const key = this.nonceKey(nonce!, tenantId, userId, clientIp);
    const client = getRedisClient();
    if (!client) {
      const rule = this.findRule(params.path, params.method);
      if (rule?.mode === 'signature') throw new SecurityError(SecurityErrorCode.REPLAY_DETECTED, 'Redis 不可用，签名接口拒绝服务');
      return;
    }
    if (await client.set(key, '1', 'EX', ttlSeconds, 'NX') !== 'OK') {
      throw new SecurityError(SecurityErrorCode.REPLAY_DETECTED, '检测到重复请求');
    }
  }

  // ========== Idempotent ==========

  async checkIdempotent(params: ReplayCheckParams, ttlSeconds: number):
    Promise<{ status: 'new' | 'processing' | 'completed'; cachedResponse?: string; cachedStatus?: number }> {
    const { idempotencyKey, tenantId, userId } = params;
    if (!idempotencyKey) throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_KEY_MISSING, '缺少 Idempotency-Key 请求头');

    const tid = tenantId ?? '000000';
    const uid = userId ?? 'anonymous';
    const key = `idempotency:${tid}:${uid}:${idempotencyKey}`;
    const client = getRedisClient();
    if (!client) return { status: 'new' };

    // 原子抢占：SET NX
    const lockResult = await client.set(key, 'processing', 'EX', ttlSeconds, 'NX');
    if (lockResult === 'OK') return { status: 'new' };

    const current = await client.get(key);
    if (current === 'processing') throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_PROCESSING, '相同请求正在处理中，请稍后重试', 409);
    if (current) {
      try { const c = JSON.parse(current); return { status: 'completed', cachedResponse: JSON.stringify(c.body), cachedStatus: c.status }; }
      catch { return { status: 'completed', cachedResponse: current }; }
    }
    throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_CONFLICT, '幂等冲突，请重试', 409);
  }

  async saveIdempotentResult(idempotencyKey: string, tenantId: string | undefined, userId: string | undefined,
    response: string, httpStatus: number, ttlSeconds: number): Promise<void> {
    const tid = tenantId ?? '000000';
    const uid = userId ?? 'anonymous';
    const key = `idempotency:${tid}:${uid}:${idempotencyKey}`;
    const client = getRedisClient();
    if (client) await client.set(key, JSON.stringify({ status: httpStatus, body: typeof response === 'string' ? JSON.parse(response) : response }), 'EX', ttlSeconds);
  }

  async releaseIdempotentLock(idempotencyKey: string, tenantId: string | undefined, userId: string | undefined): Promise<void> {
    const tid = tenantId ?? '000000';
    const uid = userId ?? 'anonymous';
    const client = getRedisClient();
    if (client) await client.del(`idempotency:${tid}:${uid}:${idempotencyKey}`);
  }

  // ========== 综合校验 ==========

  async check(params: ReplayCheckParams): Promise<{ idempotentResult?: { status: string; cachedResponse?: string; cachedStatus?: number } }> {
    const rule = this.findRule(params.path, params.method);
    if (!rule || rule.mode === 'off') return {};

    const window = rule.windowSeconds ?? 120;
    const ttl = Math.max(rule.nonceTtlSeconds ?? 0, window * 2 + 30);

    // Phase 1: Timestamp
    this.validateTimestamp(params.timestamp, window);

    // Phase 2: 格式校验（nonce 字段存在性）
    if (rule.mode === 'nonce' || rule.mode === 'signature') {
      this.validateNonceFormat(params.nonce);
    }

    // Phase 3: 签名校验（先验签，防止错误签名消耗 Nonce）
    if (rule.mode === 'signature') {
      this.validateSignature(params);
    }

    // Phase 4: Nonce 去重（验签通过后才写 Redis）
    if (rule.mode === 'nonce' || rule.mode === 'signature') {
      await this.validateNonceDedup(params, ttl);
    }

    // Phase 5: 幂等检查
    if (rule.idempotent) {
      const r = await this.checkIdempotent(params, rule.idempotentTtlSeconds ?? 3600);
      return { idempotentResult: r };
    }

    return {};
  }
}
