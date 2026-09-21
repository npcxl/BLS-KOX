/**
 * 人机验证运行时配置（Dynamic Config + 环境变量）
 *
 * 系统参数（sys_config）：
 *   login_captcha_enabled        是否开启登录人机验证（总开关）
 *   captcha_primary_provider     第一层提供方（ALTCHA）
 *   captcha_fallback_provider    第二层提供方（TIANAI）
 *   captcha_ticket_ttl           captchaTicket 有效期（秒，默认 120）
 *   captcha_tianai_enabled       本部署是否启用 TIANAI（未部署时置 false）
 *   另保留：challenge TTL / 风控阈值 / 二级类型
 *
 * 环境变量（密钥类，不落库、不下发前端）：
 *   ALTCHA_HMAC_KEY / ALTCHA_COST / TIANAI_BASE_URL / TIANAI_*_PATH / CAPTCHA_DEV_BYPASS
 */
import { env } from '../../config/env';
import {
  getDynamicConfig,
  toPublicCaptchaConfig,
  type CaptchaSecondaryType,
  type DynamicConfig,
} from '../../config/dynamic-config';
import type { CaptchaProviderName } from './providers/types';

export interface CaptchaRuntimeConfig {
  /** 总开关 */
  enabled: boolean;
  /** 第一层提供方 */
  primaryProvider: CaptchaProviderName;
  /** 第二层提供方 */
  fallbackProvider: CaptchaProviderName;
  /** 是否启用 TIANAI（false = 本部署没有图形验证码服务，风控命中不升级） */
  tianaiEnabled: boolean;
  /** captchaTicket TTL（秒） */
  ticketTtlSeconds: number;
  /** challenge / 二级会话有效期（秒） */
  challengeTtlSeconds: number;
  /** 连续登录失败达到该值后要求第二层 */
  forceAfterFailures: number;
  /** 第二层图形验证类型 */
  secondaryType: CaptchaSecondaryType;
  /** ALTCHA PoW 难度（PBKDF2 迭代次数） */
  cost: number;
  /** ALTCHA HMAC 密钥 */
  hmacKey: string;
  /** TIANAI Java 服务内网地址（Docker: http://tianai-captcha:8083） */
  tianaiBaseUrl: string;
}

/** DynamicConfig + env → 运行时配置 */
export function toRuntimeConfig(cfg: DynamicConfig): CaptchaRuntimeConfig {
  return {
    enabled: cfg.loginCaptchaEnabled,
    primaryProvider: cfg.captchaPrimaryProvider,
    fallbackProvider: cfg.captchaFallbackProvider,
    tianaiEnabled: cfg.captchaTianaiEnabled,
    ticketTtlSeconds: cfg.captchaTicketTtl,
    challengeTtlSeconds: cfg.captchaChallengeTtlSeconds,
    forceAfterFailures: cfg.captchaForceAfterFailures,
    secondaryType: cfg.captchaSecondaryType,
    cost: env.captcha.cost,
    hmacKey: env.captcha.hmacKey,
    tianaiBaseUrl: env.captcha.tianaiUrl,
  };
}

/** 是否真正生效 */
export function isCaptchaActive(cfg: CaptchaRuntimeConfig): boolean {
  return cfg.enabled;
}

/** TIANAI 是否真正可用：配置开启 **且** 内网地址存在 */
export function isTianaiUsable(cfg: CaptchaRuntimeConfig): boolean {
  return cfg.tianaiEnabled && !!cfg.tianaiBaseUrl;
}

export type GetConfigFn = (tenantId: string) => Promise<DynamicConfig>;

export async function loadCaptchaConfig(
  tenantId: string,
  getConfigFn: GetConfigFn = getDynamicConfig,
): Promise<CaptchaRuntimeConfig> {
  const cfg = await getConfigFn(tenantId);
  return toRuntimeConfig(cfg);
}

/**
 * 公开配置投影：只下发前端渲染/调用所需信息（端点、提供方、是否启用 TIANAI）。
 * **不含**阈值、失败计数、风控原因、密钥。
 */
export function publicConfig(cfg: CaptchaRuntimeConfig): {
  enabled: boolean;
  primaryProvider: CaptchaProviderName;
  fallbackProvider: CaptchaProviderName;
  tianaiEnabled: boolean;
} {
  return toPublicCaptchaConfig({
    loginCaptchaEnabled: cfg.enabled,
    captchaPrimaryProvider: cfg.primaryProvider,
    captchaFallbackProvider: cfg.fallbackProvider,
    captchaTianaiEnabled: cfg.tianaiEnabled,
  } as DynamicConfig);
}
