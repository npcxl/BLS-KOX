/**
 * 人机验证运行时配置
 *
 * 全部来自 Dynamic Config（sys_config + Redis 60s 缓存）；系统参数写入后由 config 模块的
 * onWrite → invalidateConfigCache 立即失效。
 *
 * 安全相关密钥 / PoW 难度 / Tianai 地址来自环境变量（不落库、不下发前端）。
 */
import { env } from '../../config/env';
import { getDynamicConfig, type DynamicConfig, type CaptchaMode, type CaptchaProvider } from '../../config/dynamic-config';

export interface CaptchaRuntimeConfig {
  enabled: boolean;
  mode: CaptchaMode;
  provider: CaptchaProvider;
  /** captchaToken TTL（秒），默认 120 */
  tokenTtlSeconds: number;
  /** ALTCHA challenge 有效期（秒） */
  challengeTtlSeconds: number;
  /** 连续登录失败达到该值后不再完全静默 */
  forceAfterFailures: number;
  /** ALTCHA PoW 难度（PBKDF2 迭代次数） */
  cost: number;
  /** ALTCHA HMAC 密钥 */
  hmacKey: string;
  /** provider=tianai 时的独立服务地址 */
  tianaiBaseUrl: string;
}

/** DynamicConfig + env → 运行时配置 */
export function toRuntimeConfig(cfg: DynamicConfig): CaptchaRuntimeConfig {
  return {
    enabled: cfg.captchaEnabled,
    mode: cfg.captchaMode,
    provider: cfg.captchaProvider,
    tokenTtlSeconds: cfg.captchaTokenTtlSeconds,
    challengeTtlSeconds: cfg.captchaChallengeTtlSeconds,
    forceAfterFailures: cfg.captchaForceAfterFailures,
    cost: env.captcha.cost,
    hmacKey: env.captcha.hmacKey,
    tianaiBaseUrl: env.captcha.tianaiUrl,
  };
}

/** 是否真正生效：enabled=true 且 mode !== 'off' */
export function isCaptchaActive(cfg: CaptchaRuntimeConfig): boolean {
  return cfg.enabled && cfg.mode !== 'off';
}

/** provider 是否可用（tianai 需要配置独立服务地址，否则 fail closed） */
export function isProviderUsable(cfg: CaptchaRuntimeConfig): boolean {
  if (cfg.provider === 'tianai') return !!cfg.tianaiBaseUrl;
  return true;
}

export type GetConfigFn = (tenantId: string) => Promise<DynamicConfig>;

export async function loadCaptchaConfig(tenantId: string, getConfigFn: GetConfigFn = getDynamicConfig): Promise<CaptchaRuntimeConfig> {
  const cfg = await getConfigFn(tenantId);
  return toRuntimeConfig(cfg);
}

/**
 * 公共配置投影：只下发前端驱动 ALTCHA widget 所需的信息。
 * 阈值（forceAfterFailures / cost）、HMAC 密钥、内部风险规则一律不下发。
 */
export function publicConfig(cfg: CaptchaRuntimeConfig): {
  enabled: boolean;
  mode: CaptchaMode;
  provider: CaptchaProvider;
} {
  return {
    enabled: isCaptchaActive(cfg),
    mode: cfg.mode,
    provider: cfg.provider,
  };
}
