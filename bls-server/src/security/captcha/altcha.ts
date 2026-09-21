/**
 * ALTCHA 官方库封装（https://github.com/altcha-org/altcha）
 *
 * **不自行实现任何验证码算法**：challenge 生成、Proof-of-Work 校验、challenge 签名与
 * 过期判断全部交给官方 `altcha/lib`：
 *
 *   createChallenge({ algorithm, cost, deriveKey, hmacSignatureSecret, expiresAt, data })
 *   verifySolution({ challenge, solution, deriveKey, hmacSignatureSecret })
 *
 * payload 形态（官方 widget 通过 `btoa(JSON.stringify(...))` 生成）：
 *
 *   { challenge: { parameters, signature }, solution: { counter, derivedKey, time? } }
 *
 * 实现说明：`altcha` 是 ESM-only 包（`"type": "module"`）而本后端是 CommonJS，
 * 因此通过**动态 import()** 加载官方库（TS Node16 推荐做法），并缓存 Promise。
 * 为避免 CJS 文件 import ESM 类型报 TS1541/TS1542，这里按官方 d.ts **原样声明**所需的数据结构。
 */
export interface AltchaChallengeParameters {
  algorithm: string;
  nonce: string;
  salt: string;
  cost: number;
  keyLength: number;
  keyPrefix: string;
  keySignature?: string;
  memoryCost?: number;
  parallelism?: number;
  /** 秒级时间戳（写入 HMAC 签名内，客户端无法篡改） */
  expiresAt?: number;
  data?: Record<string, string | number | boolean | null>;
}

export interface AltchaChallenge {
  parameters: AltchaChallengeParameters;
  signature?: string;
  codeChallenge?: unknown;
}

export interface AltchaSolution {
  counter: number;
  derivedKey: string;
  time?: number;
}

export interface AltchaPayload {
  challenge: AltchaChallenge;
  solution: AltchaSolution;
}

/** 官方 `VerifySolutionResult` */
export interface AltchaVerifyResult {
  expired: boolean;
  invalidSignature: boolean | null;
  invalidSolution: boolean | null;
  time: number;
  verified: boolean;
}

/** 默认算法：v3 widget 内置且无需额外 worker 的 PBKDF2/SHA-256 */
export const ALTCHA_DEFAULT_ALGORITHM = 'PBKDF2/SHA-256';

/** 允许的算法（widget 默认内置；Argon2 / Scrypt 需要额外 worker，默认不启用） */
export const ALTCHA_BUNDLED_ALGORITHMS = [
  'PBKDF2/SHA-256',
  'PBKDF2/SHA-384',
  'PBKDF2/SHA-512',
  'SHA-256',
  'SHA-384',
  'SHA-512',
] as const;

/** payload 长度上限（防止超长 body 打爆内存 / 日志） */
export const ALTCHA_PAYLOAD_MAX_CHARS = 16 * 1024;
const ALTCHA_PAYLOAD_MAX_BYTES = 8 * 1024;

/** 官方库实例（懒加载） */
type AltchaLib = {
  createChallenge: (options: Record<string, unknown>) => Promise<AltchaChallenge>;
  verifySolution: (options: Record<string, unknown>) => Promise<AltchaVerifyResult>;
  /** 官方求解器（生产环境由浏览器 widget 调用；服务端仅测试用） */
  solveChallenge: (options: Record<string, unknown>) => Promise<AltchaSolution | null>;
  pbkdf2: { deriveKey: (...args: any[]) => any };
  sha: { deriveKey: (...args: any[]) => any };
};

let libPromise: Promise<AltchaLib> | null = null;

export function loadAltchaLib(): Promise<AltchaLib> {
  if (!libPromise) libPromise = import('altcha/lib') as unknown as Promise<AltchaLib>;
  return libPromise;
}

/** 算法 → deriveKey（必须与 challenge.parameters.algorithm 匹配，否则校验必然失败） */
export async function deriveKeyFor(algorithm: string): Promise<((...args: any[]) => any) | null> {
  const lib = await loadAltchaLib();
  switch (algorithm) {
    case 'PBKDF2/SHA-256':
    case 'PBKDF2/SHA-384':
    case 'PBKDF2/SHA-512':
      return lib.pbkdf2.deriveKey;
    case 'SHA-256':
    case 'SHA-384':
    case 'SHA-512':
      return lib.sha.deriveKey;
    default:
      // ARGON2ID / SCRYPT 需要额外 worker，默认不支持（避免前端无法求解）
      return null;
  }
}

export type AltchaVerifyOutcome =
  | { ok: true; result: AltchaVerifyResult }
  | { ok: false; error: 'PAYLOAD_MALFORMED' | 'ALGORITHM_UNSUPPORTED' | 'VERIFY_ERROR'; detail?: string };

export interface CreateAltchaOptions {
  /** ALTCHA HMAC 密钥（服务端签名 / 验签 challenge） */
  hmacKey: string;
  /** challenge 有效期（秒） */
  ttlSeconds: number;
  /** PBKDF2 迭代次数 / PoW 难度 */
  cost: number;
  /** 附加到 challenge.parameters.data 的业务字段（进入 HMAC 签名，客户端无法篡改） */
  data?: Record<string, string | number | boolean | null>;
  algorithm?: string;
}

/**
 * 生成一次性 ALTCHA challenge。
 * `expiresAt` 写入被 HMAC 签名的 parameters，因此客户端无法篡改有效期。
 */
export async function createAltchaChallenge(options: CreateAltchaOptions): Promise<AltchaChallenge> {
  const algorithm = options.algorithm ?? ALTCHA_DEFAULT_ALGORITHM;
  const deriveKey = await deriveKeyFor(algorithm);
  if (!deriveKey) throw new Error(`ALTCHA algorithm not supported: ${algorithm}`);

  const { createChallenge } = await loadAltchaLib();
  return createChallenge({
    algorithm,
    cost: options.cost,
    deriveKey,
    hmacSignatureSecret: options.hmacKey,
    expiresAt: new Date(Date.now() + options.ttlSeconds * 1000),
    ...(options.data ? { data: options.data } : {}),
  });
}

/**
 * 解码官方 widget 提交的 payload（base64(JSON)）。
 * 只接受结构完全符合官方 `Payload` 的输入，其余一律判为 malformed。
 */
export function decodeAltchaPayload(raw: unknown): AltchaPayload | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > ALTCHA_PAYLOAD_MAX_CHARS) return null;

  let json: string;
  try {
    json = Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return null;
  }
  if (Buffer.byteLength(json, 'utf8') > ALTCHA_PAYLOAD_MAX_BYTES) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const challenge = parsed.challenge;
  const solution = parsed.solution;
  if (!challenge || typeof challenge !== 'object') return null;
  if (!challenge.parameters || typeof challenge.parameters !== 'object') return null;
  if (typeof challenge.parameters.algorithm !== 'string') return null;
  if (typeof challenge.parameters.nonce !== 'string' || !challenge.parameters.nonce) return null;
  if (typeof challenge.signature !== 'string' || !challenge.signature) return null;
  if (!solution || typeof solution !== 'object') return null;
  if (!Number.isInteger(solution.counter) || typeof solution.derivedKey !== 'string') return null;

  return {
    challenge: { parameters: challenge.parameters, signature: challenge.signature },
    solution: { counter: solution.counter, derivedKey: solution.derivedKey },
  };
}

/**
 * 服务端校验 ALTCHA payload —— 纯密码学校验，不调用任何外部 API。
 * 官方库依次检查：过期 → challenge 签名（防篡改）→ PoW 结果。
 */
export async function verifyAltchaPayload(options: {
  payload: AltchaPayload;
  hmacKey: string;
}): Promise<AltchaVerifyOutcome> {
  const algorithm = String(options.payload.challenge.parameters.algorithm);
  const deriveKey = await deriveKeyFor(algorithm);
  if (!deriveKey) return { ok: false, error: 'ALGORITHM_UNSUPPORTED', detail: algorithm };

  try {
    const { verifySolution } = await loadAltchaLib();
    const result = await verifySolution({
      challenge: options.payload.challenge,
      solution: options.payload.solution,
      deriveKey,
      hmacSignatureSecret: options.hmacKey,
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: 'VERIFY_ERROR', detail: String(err) };
  }
}

/** 官方结果 → 统一失败原因 */
export function classifyAltchaFailure(
  result: AltchaVerifyResult,
): 'CHALLENGE_EXPIRED' | 'SIGNATURE_INVALID' | 'SOLUTION_INVALID' | null {
  if (result.verified) return null;
  if (result.expired) return 'CHALLENGE_EXPIRED';
  if (result.invalidSignature) return 'SIGNATURE_INVALID';
  return 'SOLUTION_INVALID';
}
