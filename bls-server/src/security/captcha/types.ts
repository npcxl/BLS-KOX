/**
 * 登录人机验证（captcha）— 类型定义
 *
 * 方案：集成 ALTCHA（https://github.com/altcha-org/altcha）自托管开源库。
 * **不自研**滑块、图片裁切、轨迹识别或验证码算法；ALTCHA 只提供 Proof-of-Work。
 *
 * 两级语义（由服务端策略决定）：
 *   - invisible：ALTCHA widget `display="invisible"` + `auto="onload"`，后台完成 PoW，用户无感；
 *   - visible  ：策略要求人工交互时切换为 ALTCHA 可见组件（`display="standard"`）。
 *
 * 两层验证成功后，服务端签发项目内部的一次性 `captchaToken`，由 `POST /api/auth/login` 消费。
 */
import type { CaptchaMode, CaptchaProvider } from '../../config/dynamic-config';

export type { CaptchaMode, CaptchaProvider };

/** 前端应展示的 ALTCHA 组件形态 */
export type CaptchaStage = 'invisible' | 'visible';

/** 验证失败原因枚举（写入安全审计，绝不包含 payload / 密钥） */
export type CaptchaFailureReason =
  | 'PAYLOAD_MISSING'
  | 'PAYLOAD_MALFORMED'
  | 'ALGORITHM_UNSUPPORTED'
  | 'CHALLENGE_EXPIRED'
  | 'SIGNATURE_INVALID'
  | 'SOLUTION_INVALID'
  /** challenge 中签名绑定的租户 / username 与当前请求不一致 */
  | 'BINDING_MISMATCH'
  | 'PROVIDER_UNAVAILABLE'
  /** 策略要求可见交互（连续登录失败 / 高风险 / 超管账号 / mode=always） */
  | 'VISIBLE_REQUIRED'
  /** 强制策略命中的内部原因 */
  | 'ACCOUNT_FAILURES'
  | 'IP_ACCOUNT_FANOUT'
  | 'IP_RISK_HIGH'
  | 'RATE_LIMIT_PRESSURE'
  | 'PRIVILEGED_ACCOUNT'
  | 'DEVICE_ANOMALY'
  | 'MODE_ALWAYS';

/** captchaToken 在 Redis 中的记录（Redis key 里只出现 token 的 sha256） */
export interface CaptchaTokenRecord {
  provider: CaptchaProvider;
  /** 绑定当前租户 */
  tenantId: string;
  /** 绑定当前域名 hash */
  domainHash: string;
  /** 绑定登录 username 的 hash */
  usernameHash: string;
  /** 绑定 IP hash */
  ipHash: string;
  /** 绑定 User-Agent hash */
  uaHash: string;
  /** 签发时的组件形态（审计用） */
  stage: CaptchaStage;
  issuedAt: number;
  expiresAt: number;
}

/** `/captcha/config` 的下发结构 */
export interface CaptchaPublicConfig {
  enabled: boolean;
  mode: CaptchaMode;
  provider: CaptchaProvider;
  /** 本轮应展示的 ALTCHA 组件形态 */
  display: CaptchaStage;
  /** display=visible 时为命中原因（用于前端文案，不含内部阈值） */
  reason?: CaptchaFailureReason;
  /** widget 应使用的 challenge 地址 */
  challengeUrl: string;
  /** widget 隐藏域字段名 */
  fieldName: string;
}

/** `/captcha/verify` 的返回结构 */
export interface CaptchaVerifyResult {
  passed: boolean;
  /** 一次性 captchaToken（仅 passed=true 时返回） */
  captchaToken?: string;
  expiresAt?: number;
  /** 策略要求可见交互：前端需切换为可见 ALTCHA 组件后重新验证 */
  requireVisible?: boolean;
  /** 失败原因（枚举） */
  reason?: CaptchaFailureReason;
  /** 剩余可见交互前需要的重试提示（前端文案） */
  message?: string;
}

/** 强制可见交互的判定输入 */
export interface CaptchaPolicyInput {
  mode: CaptchaMode;
  forceAfterFailures: number;
  accountFailures: number;
  ipAccountCount: number;
  ipRiskScore: number;
  ipRiskLevel: string;
  rateLimitPressure: number;
  privilegedAccount: boolean;
  deviceAnomalous: boolean;
}

export interface CaptchaPolicyDecision {
  display: CaptchaStage;
  reason?: CaptchaFailureReason;
}

/** 连续失败计数窗口（秒） */
export const FAILURE_WINDOW_SECONDS = 900;

/** 同一 IP 在窗口内尝试过的不同账号数达到该值 → 要求可见交互 */
export const IP_ACCOUNT_FANOUT_THRESHOLD = 3;

/** Rate Limit 压力阈值（同一 IP 在登录限流窗口内的计数） */
export const RATE_LIMIT_PRESSURE_THRESHOLD = 10;

/** IP 风险评分阈值（Security Event Center 规则引擎） */
export const IP_RISK_SCORE_THRESHOLD = 70;

/** config / verify 接口暴露的字段名（与 widget `name` 属性一致） */
export const CAPTCHA_FIELD_NAME = 'altchaPayload';
export const CAPTCHA_CHALLENGE_URL = '/api/auth/captcha/challenge';
export const CAPTCHA_VERIFY_URL = '/api/auth/captcha/verify';
export const CAPTCHA_CONFIG_URL = '/api/auth/captcha/config';
