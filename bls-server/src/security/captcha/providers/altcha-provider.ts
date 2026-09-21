/**
 * Provider — ALTCHA（第一层，静默 Proof-of-Work）
 *
 * 实现统一的 `CaptchaProviderAdapter`（generate / verify）。
 * 算法全部来自官方 `altcha/lib`：本文件不含任何自研验证码算法。
 *
 * 与 TIANAI 的分工：
 *   - ALTCHA：静默、无感、成本低 → 默认第一层；
 *   - 命中风控或需要人工交互 → 交给 TIANAI（第二层，见 tianai-provider.ts）。
 */
import {
  classifyAltchaFailure,
  createAltchaChallenge,
  decodeAltchaPayload,
  verifyAltchaPayload,
} from '../altcha';
import {
  type CaptchaGenerateInput,
  type CaptchaChallengeResult,
  type CaptchaProviderAdapter,
  type CaptchaVerifyInput,
  type CaptchaVerifyResult,
} from './types';

export interface AltchaProviderOptions {
  /** ALTCHA HMAC 密钥（challenge 签名 / 验签） */
  hmacKey: string;
  /** Proof-of-Work 难度（PBKDF2 迭代次数） */
  cost: number;
  /** 默认 challenge 有效期（秒），可被 generate 传入的 ttlSeconds 覆盖 */
  defaultTtlSeconds?: number;
}

export class AltchaProvider implements CaptchaProviderAdapter {
  readonly name = 'ALTCHA' as const;

  constructor(private readonly options: AltchaProviderOptions) {}

  /** 自托管：只要有签名密钥即可用 */
  isAvailable(): boolean {
    return !!this.options.hmacKey;
  }

  async generate(input: CaptchaGenerateInput): Promise<CaptchaChallengeResult> {
    const ttlSeconds = input.ttlSeconds ?? this.options.defaultTtlSeconds ?? 180;
    const challenge = await createAltchaChallenge({
      hmacKey: this.options.hmacKey,
      ttlSeconds,
      cost: this.options.cost,
      ...(input.signedData ? { data: input.signedData } : {}),
    });
    return {
      provider: 'ALTCHA',
      // 官方结构原样返回（parameters / signature），前端 widget 直接消费
      challenge: challenge as unknown as Record<string, unknown>,
      expiresAt: Date.now() + ttlSeconds * 1000,
      fieldName: 'altchaPayload',
    };
  }

  /**
   * 校验 payload。
   * 区分「用户答案不对」（failed）与「算法/服务层面的问题」（technical_error）：
   *   - 结构错误 / 签名错误 / PoW 不对 / 过期 → failed（这类是用户/攻击者提交的内容问题）
   *   - 算法不受支持 → technical_error（我们与前端 widget 配置不一致）
   */
  async verify(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
    const raw = input.payload;
    if (raw === undefined || raw === null || raw === '') {
      return { status: 'failed', provider: 'ALTCHA', reason: 'PAYLOAD_MISSING' };
    }

    const payload = decodeAltchaPayload(raw);
    if (!payload) {
      return { status: 'failed', provider: 'ALTCHA', reason: 'PAYLOAD_MALFORMED' };
    }

    const outcome = await verifyAltchaPayload({ payload, hmacKey: this.options.hmacKey });
    if (!outcome.ok) {
      if (outcome.error === 'ALGORITHM_UNSUPPORTED') {
        return { status: 'technical_error', provider: 'ALTCHA', technicalReason: 'ALGORITHM_UNSUPPORTED' };
      }
      // VERIFY_ERROR = 官方库抛异常（我方运行环境问题），**不是**用户提交的数据有问题。
      // 若混成 failed/PAYLOAD_MALFORMED，会把服务端故障计入用户的验证失败。
      return { status: 'technical_error', provider: 'ALTCHA', technicalReason: 'INTERNAL_ERROR' };
    }

    const failure = classifyAltchaFailure(outcome.result);
    if (failure) return { status: 'failed', provider: 'ALTCHA', reason: failure };

    return {
      status: 'passed',
      provider: 'ALTCHA',
      // 验签通过后，签名内的业务字段才可信（阶段/租户/账号绑定都在这里）
      signedData: (payload.challenge.parameters.data ?? {}) as Record<string, unknown>,
      // nonce 必须在这里给出：调用方拿到的原始 payload 是 base64 字符串，读不到 challenge
      challengeNonce: challengeNonceOf(payload.challenge as unknown as Record<string, unknown>),
    };
  }
}

/** 从 ALTCHA challenge 中取 nonce（用于一次性登记/消费） */
export function challengeNonceOf(challenge: Record<string, unknown>): string {
  const parameters = (challenge?.parameters ?? {}) as Record<string, unknown>;
  return String(parameters.nonce ?? '');
}
