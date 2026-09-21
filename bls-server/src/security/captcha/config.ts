/**
 * 人机验证运行时配置
 *
 * 全部来自 Dynamic Config（sys_config + Redis 60s 缓存），
 * 系统参数写入后由 config 模块的 onWrite → invalidateConfigCache 立即失效。
 */
import { getDynamicConfig, toPublicCaptchaConfig, type DynamicConfig, type CaptchaMode, type CaptchaSecondaryType } from '../../config/dynamic-config';

export interface CaptchaRuntimeConfig {
  enabled: boolean;
  mode: CaptchaMode;
  silentThreshold: number;
  forceAfterFailures: number;
  challengeTtlSeconds: number;
  tokenTtlSeconds: number;
  secondaryTypes: CaptchaSecondaryType[];
  maxAttempts: number;
  provider: string;
}

/** DynamicConfig → 人机验证运行时配置 */
export function toRuntimeConfig(cfg: DynamicConfig): CaptchaRuntimeConfig {
  return {
    enabled: cfg.captchaEnabled,
    mode: cfg.captchaMode,
    silentThreshold: cfg.captchaSilentThreshold,
    forceAfterFailures: cfg.captchaForceAfterFailures,
    challengeTtlSeconds: cfg.captchaChallengeTtlSeconds,
    tokenTtlSeconds: cfg.captchaTokenTtlSeconds,
    secondaryTypes: cfg.captchaSecondaryTypes.length ? [...cfg.captchaSecondaryTypes] : ['slider', 'rotate'],
    maxAttempts: cfg.captchaMaxAttempts,
    provider: cfg.captchaProvider,
  };
}

/** 是否真正生效：enabled=true 且 mode !== 'off' */
export function isCaptchaActive(cfg: CaptchaRuntimeConfig): boolean {
  return cfg.enabled && cfg.mode !== 'off';
}

export type GetConfigFn = (tenantId: string) => Promise<DynamicConfig>;

export async function loadCaptchaConfig(tenantId: string, getConfigFn: GetConfigFn = getDynamicConfig): Promise<CaptchaRuntimeConfig> {
  const cfg = await getConfigFn(tenantId);
  return toRuntimeConfig(cfg);
}

/**
 * 公共配置投影：只返回前端需要的信息。
 * 阈值（silentThreshold）、forceAfterFailures、TTL、maxAttempts 等内部规则一律不下发。
 */
export function publicConfig(cfg: CaptchaRuntimeConfig): { enabled: boolean; mode: CaptchaMode; secondaryTypes: CaptchaSecondaryType[] } {
  return { enabled: isCaptchaActive(cfg), mode: cfg.mode, secondaryTypes: [...cfg.secondaryTypes] };
}

export { toPublicCaptchaConfig };
