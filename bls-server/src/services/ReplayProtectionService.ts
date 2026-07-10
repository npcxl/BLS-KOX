/**
 * 防重放攻击服务
 *
 * 职责：
 * 1. 规则匹配
 * 2. Timestamp 校验
 * 3. Nonce 去重（Redis SET NX EX）
 * 4. HMAC 签名校验
 * 5. 幂等 Key 管理
 */

import { AppError } from '../core/errors';
import { getRedisClient } from '../shared/utils/redis';
import { SecurityErrorCode } from '../shared/constants/security-error-code';
import {
  buildCanonicalPayload,
  hmacSign,
  secureCompare,
} from '../shared/utils/signature';
import {
  type ReplayMode,
  type ReplayRule,
  matchRule,
  defaultReplayRules,
} from '../config/replay-protection';

/** 自定义错误：统一返回 { code, message } 格式 */
export class SecurityError extends AppError {
  constructor(public securityCode: SecurityErrorCode, message: string, httpStatus = 401) {
    super(message, httpStatus, securityCode);
  }
}

/** Context 参数 */
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
  /** 签名密钥，优先级：租户配置 > 环境变量 */
  signSecret?: string;
}

export class ReplayProtectionService {
  private rules: ReplayRule[];

  constructor(rules?: ReplayRule[]) {
    this.rules = rules ?? defaultReplayRules;
  }

  // ========== 规则匹配 ==========

  findRule(path: string, method: string): ReplayRule | null {
    return matchRule(path, method, this.rules);
  }

  // ========== Timestamp 校验 ==========

  validateTimestamp(timestamp: string | null | undefined, windowSeconds: number): number {
    if (!timestamp) {
      throw new SecurityError(SecurityErrorCode.TIMESTAMP_MISSING, '缺少 X-Timestamp 请求头');
    }
    const ts = Number(timestamp);
    if (isNaN(ts) || ts <= 0) {
      throw new SecurityError(SecurityErrorCode.TIMESTAMP_INVALID, 'X-Timestamp 格式无效');
    }
    const now = Date.now();
    const drift = Math.abs(now - ts);
    const windowMs = windowSeconds * 1000;
    if (drift > windowMs) {
      throw new SecurityError(SecurityErrorCode.TIMESTAMP_EXPIRED, `请求时间戳已过期（窗口 ${windowSeconds}s）`);
    }
    return ts;
  }

  // ========== Nonce 去重 ==========

  async validateNonce(params: ReplayCheckParams, ttlSeconds: number): Promise<void> {
    const { nonce, tenantId, userId, clientIp } = params;
    if (!nonce || nonce.length < 16 || nonce.length > 128) {
      throw new SecurityError(SecurityErrorCode.NONCE_MISSING, '缺少或无效的 X-Nonce（需要 16~128 字节）');
    }

    const key = this.nonceKey(nonce, tenantId, userId, clientIp);
    const client = getRedisClient();

    if (!client) {
      // Redis 不可用时，对 signature 模式 fail-closed
      const rule = this.findRule(params.path, params.method);
      if (rule?.mode === 'signature') {
        throw new SecurityError(SecurityErrorCode.REPLAY_DETECTED, 'Redis 不可用，签名接口拒绝服务');
      }
      // 其他模式 skip（可配置，这里默认宽松）
      return;
    }

    // 原子操作 SET key 1 NX EX ttl
    const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
    if (result !== 'OK') {
      throw new SecurityError(SecurityErrorCode.REPLAY_DETECTED, '检测到重复请求');
    }
  }

  /** Nonce Redis Key */
  private nonceKey(nonce: string, tenantId?: string, userId?: string, clientIp?: string): string {
    if (tenantId && userId) {
      return `replay:${tenantId}:${userId}:${nonce}`;
    }
    // 匿名请求（如登录接口）
    const ip = clientIp ?? 'unknown';
    return `replay:anonymous:${ip}:${nonce}`;
  }

  // ========== 签名校验 ==========

  validateSignature(params: ReplayCheckParams): void {
    const { signature, signSecret } = params;
    if (!signature) {
      throw new SecurityError(SecurityErrorCode.SIGNATURE_MISSING, '缺少 X-Signature 请求头');
    }
    if (!signSecret) {
      throw new SecurityError(SecurityErrorCode.SIGNATURE_INVALID, '服务端未配置签名密钥');
    }

    const payload = buildCanonicalPayload({
      method: params.method,
      path: params.path,
      timestamp: params.timestamp ?? '',
      nonce: params.nonce ?? '',
      tenantId: params.tenantId ?? '000000',
      userId: params.userId ?? 'anonymous',
      body: params.body,
    });

    const expectedSig = hmacSign(signSecret, payload);
    if (!secureCompare(signature.toLowerCase(), expectedSig)) {
      throw new SecurityError(SecurityErrorCode.SIGNATURE_INVALID, '签名校验失败');
    }
  }

  // ========== 幂等 ==========

  async checkIdempotent(
    params: ReplayCheckParams,
    ttlSeconds: number,
  ): Promise<{ status: 'new' | 'processing' | 'completed'; cachedResponse?: string }> {
    const { idempotencyKey, tenantId, userId } = params;
    if (!idempotencyKey) {
      throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_KEY_MISSING, '缺少 Idempotency-Key 请求头');
    }

    const tid = tenantId ?? '000000';
    const uid = userId ?? 'anonymous';
    const key = `idempotency:${tid}:${uid}:${idempotencyKey}`;

    const client = getRedisClient();
    if (!client) {
      // Redis 不可用时跳过幂等（不阻塞请求）
      return { status: 'new' };
    }

    const current = await client.get(key);
    if (!current) {
      // 首次请求，占位 processing
      await client.set(key, 'processing', 'EX', ttlSeconds, 'NX');
      return { status: 'new' };
    }

    if (current === 'processing') {
      throw new SecurityError(SecurityErrorCode.IDEMPOTENCY_PROCESSING, '相同请求正在处理中，请稍后重试', 409);
    }

    // completed → 返回缓存结果
    return { status: 'completed', cachedResponse: current };
  }

  async saveIdempotentResult(
    idempotencyKey: string,
    tenantId: string | undefined,
    userId: string | undefined,
    response: string,
    ttlSeconds: number,
  ): Promise<void> {
    const tid = tenantId ?? '000000';
    const uid = userId ?? 'anonymous';
    const key = `idempotency:${tid}:${uid}:${idempotencyKey}`;

    const client = getRedisClient();
    if (client) {
      await client.set(key, response, 'EX', ttlSeconds);
    }
  }

  // ========== 综合校验入口 ==========

  async check(params: ReplayCheckParams): Promise<{ idempotentResult?: { status: 'new' | 'completed'; cachedResponse?: string } }> {
    const rule = this.findRule(params.path, params.method);
    if (!rule || rule.mode === 'off') return {};

    const mode: ReplayMode = rule.mode;
    const window = rule.windowSeconds ?? 120;
    const ttl = rule.nonceTtlSeconds ?? 180;

    // Level 1: timestamp
    if (mode === 'timestamp' || mode === 'nonce' || mode === 'signature') {
      this.validateTimestamp(params.timestamp, window);
    }

    // Level 2: nonce
    if (mode === 'nonce' || mode === 'signature') {
      await this.validateNonce(params, ttl);
    }

    // Level 3: signature
    if (mode === 'signature') {
      this.validateSignature(params);
    }

    // 幂等检查
    if (rule.idempotent) {
      const r = await this.checkIdempotent(params, rule.idempotentTtlSeconds ?? 3600);
      return { idempotentResult: r };
    }

    return {};
  }
}
