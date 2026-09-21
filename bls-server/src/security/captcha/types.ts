/**
 * 登录人机验证 —— 类型定义（Provider 抽象 + 统一 Ticket）
 *
 * 架构（Koa 是唯一入口，浏览器永不直连 TIANAI Java 服务）：
 *
 *   浏览器 ── POST /api/captcha/generate ──► Koa ──┬─ ALTCHA（官方 lib，本地 PoW）
 *   浏览器 ── POST /api/captcha/verify   ──► Koa ──┴─ TIANAI（Docker 内网 http://tianai-captcha:8083）
 *                                        └─ 校验通过 → 签发一次性 captchaTicket
 *   浏览器 ── POST /api/auth/login + captchaTicket ──► Koa（GETDEL 原子消费）
 *
 * 关键约束：
 *   1. 登录接口**不依赖任何 provider 的验证结果**，只认 Koa 签发的一次性 ticket；
 *   2. 技术故障（上游不可达/超时/异常）必须与「用户验证失败」区分开 → TECHNICAL_ERROR；
 *   3. 阶段/提供方全部由服务端决定，客户端提交的 stage/provider 只作为"请求哪个 provider"的意图。
 */
import type { CaptchaSecondaryProvider, CaptchaSecondaryType } from '../../config/dynamic-config';
import type { CaptchaProviderName, CaptchaScene, CaptchaVerifyStatus } from './providers/types';

export type { CaptchaSecondaryType, CaptchaSecondaryProvider };
export type { CaptchaProviderName, CaptchaScene, CaptchaVerifyStatus };

/** 验证失败原因枚举（写入安全审计，绝不包含 payload / 密钥 / 图片） */
export type CaptchaFailureReason =
  | 'PAYLOAD_MISSING'
  | 'PAYLOAD_MALFORMED'
  | 'ALGORITHM_UNSUPPORTED'
  | 'CHALLENGE_EXPIRED'
  | 'SIGNATURE_INVALID'
  | 'SOLUTION_INVALID'
  | 'BINDING_MISMATCH'
  | 'STAGE_MISMATCH'
  | 'PROVIDER_UNAVAILABLE'
  | 'SECONDARY_REQUIRED'
  /** 内部风控原因（只写审计，不下发前端） */
  | 'ACCOUNT_FAILURES'
  | 'IP_ACCOUNT_FANOUT'
  | 'IP_RISK_HIGH'
  | 'RATE_LIMIT_PRESSURE'
  | 'PRIVILEGED_ACCOUNT'
  | 'DEVICE_ANOMALY'
  | 'MODE_ALWAYS';

/** 内部风控原因（不允许出现在公开接口响应里） */
export const INTERNAL_POLICY_REASONS: readonly CaptchaFailureReason[] = [
  'ACCOUNT_FAILURES',
  'IP_ACCOUNT_FANOUT',
  'IP_RISK_HIGH',
  'RATE_LIMIT_PRESSURE',
  'PRIVILEGED_ACCOUNT',
  'DEVICE_ANOMALY',
  'MODE_ALWAYS',
];

/** TIANAI 本地会话在 Redis 中的记录（一次性消费） */
export interface CaptchaSecondarySessionRecord {
  sessionId: string;
  type: CaptchaSecondaryType;
  /** 上游（Java 服务）challenge id */
  upstreamId: string;
  scene: CaptchaScene;
  tenantId: string;
  usernameHash: string;
  ipHash: string;
  uaHash: string;
  issuedAt: number;
  expiresAt: number;
}

/** `/api/captcha/config` 下发结构（只含前端渲染/调用所需信息） */
export interface CaptchaPublicConfig {
  enabled: boolean;
  /** 第一层（默认 ALTCHA 静默） */
  primaryProvider: CaptchaProviderName;
  /** 第二层（默认 TIANAI） */
  fallbackProvider: CaptchaProviderName;
  /** 本部署是否启用 TIANAI（false 时风控命中也不会要求图形验证） */
  tianaiEnabled: boolean;
  /** 统一入口（浏览器只与 Koa 通信） */
  generateUrl: string;
  verifyUrl: string;
  /** ALTCHA widget 的隐藏域字段名 */
  fieldName: string;
}

/** `/api/captcha/generate` 响应 */
export interface CaptchaGenerateResult {
  provider: CaptchaProviderName;
  /** ALTCHA：官方 challenge 结构；TIANAI：Java 服务原始渲染字段 */
  challenge: Record<string, unknown>;
  /** TIANAI：Koa 签发的一次性会话 id（浏览器只拿得到它，拿不到上游 id） */
  sessionId?: string;
  expiresAt: number;
  fieldName?: string;
}

/** `/api/captcha/verify` 响应 */
export interface CaptchaVerifyResult {
  status: CaptchaVerifyStatus;
  provider: CaptchaProviderName;
  /** status=passed 时返回：登录接口唯一认的凭证 */
  captchaTicket?: string;
  expiresAt?: number;
  /** status=failed 时的原因（通用枚举，不含内部风控细节） */
  reason?: string;
  /**
   * ALTCHA 通过但风控命中 → 需要继续完成 TIANAI：
   * 前端据此渲染二级组件并再次调用 /verify（provider=TIANAI）。
   */
  requireFallback?: boolean;
  nextProvider?: CaptchaProviderName;
}

/** 强制进入第二层的判定输入 */
export interface CaptchaPolicyInput {
  /** 强制策略开关（Tianai 启用时才生效） */
  forceSecondary: boolean;
  forceAfterFailures: number;
  accountFailures: number;
  ipAccountCount: number;
  ipRiskScore: number;
  ipRiskLevel: string;
  rateLimitPressure: number;
  privilegedAccount: boolean;
  deviceAnomalous: boolean;
}

/** 策略判定结果：决定是否需要第二层 */
export interface CaptchaPolicyDecision {
  requireSecondary: boolean;
  /** 内部驱动原因，仅写安全审计 */
  reason?: CaptchaFailureReason;
}

/** 连续失败计数窗口（秒） */
export const FAILURE_WINDOW_SECONDS = 900;

/** 同一 IP 在窗口内尝试过的不同账号数达到该值 → 要求第二层 */
export const IP_ACCOUNT_FANOUT_THRESHOLD = 3;

/** Rate Limit 压力阈值（同一 IP 在登录限流窗口内的计数） */
export const RATE_LIMIT_PRESSURE_THRESHOLD = 10;

/** IP 风险评分阈值（Security Event Center 规则引擎） */
export const IP_RISK_SCORE_THRESHOLD = 70;

/** 统一入口（浏览器只访问这两个 Koa 地址） */
export const CAPTCHA_GENERATE_URL = '/api/captcha/generate';
export const CAPTCHA_VERIFY_URL = '/api/captcha/verify';
export const CAPTCHA_FIELD_NAME = 'altchaPayload';

/** 对外的统一提示 */
export const SECONDARY_REQUIRED_MESSAGE = '需要完成额外安全验证';
