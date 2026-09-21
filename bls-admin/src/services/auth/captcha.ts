/**
 * 登录人机验证接口（ALTCHA，公共，无需认证）
 *
 * 与后端 `bls-server/src/api/auth/captcha/index.ts` 一一对应。
 * - `challenge` 由官方 ALTCHA widget 直接通过 `challenge` 属性拉取（官方结构，无外层封装），
 *   因此这里**不**提供 challenge 的 request 封装。
 * - 其余调用统一 `skipErrorMessage`，错误提示由登录页控制。
 */
import { request } from '@umijs/max';

export type CaptchaMode = 'off' | 'adaptive' | 'always';
export type CaptchaProvider = 'altcha' | 'tianai';
/** ALTCHA 组件形态：invisible=静默，visible=需人工交互 */
export type CaptchaDisplay = 'invisible' | 'visible';

export interface CaptchaConfig {
  enabled: boolean;
  mode: CaptchaMode;
  provider: CaptchaProvider;
  display: CaptchaDisplay;
  /** display=visible 时命中策略的原因（用于文案） */
  reason?: string;
  /** ALTCHA widget 使用的 challenge 地址 */
  challengeUrl: string;
  /** ALTCHA widget 隐藏域字段名 */
  fieldName: string;
}

export interface CaptchaVerifyResult {
  passed: boolean;
  captchaToken?: string;
  expiresAt?: number;
  /** 服务端要求切换为可见组件后重新验证 */
  requireVisible?: boolean;
  reason?: string;
  message?: string;
}

const OPTIONS = { skipErrorMessage: true } as const;

/** 读取公开配置与组件形态（可带 username 以获得更准确的策略判定） */
export async function getCaptchaConfig(
  params?: { username?: string },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<CaptchaConfig>>('/api/auth/captcha/config', {
    method: 'GET',
    params,
    ...OPTIONS,
    ...(options || {}),
  });
}

/** 把 ALTCHA payload 提交给服务端校验 → 换取一次性 captchaToken */
export async function verifyCaptcha(
  data: { payload: string; username?: string; stage?: CaptchaDisplay },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<CaptchaVerifyResult>>('/api/auth/captcha/verify', {
    method: 'POST',
    data,
    ...OPTIONS,
    ...(options || {}),
  });
}

/** 失败原因 → 中文提示 */
export const CAPTCHA_REASON_TEXT: Record<string, string> = {
  PAYLOAD_MISSING: '请先完成人机验证',
  PAYLOAD_MALFORMED: '人机验证数据无效，请重试',
  ALGORITHM_UNSUPPORTED: '人机验证算法不受支持，请联系管理员',
  CHALLENGE_EXPIRED: '验证已过期，请重新验证',
  SIGNATURE_INVALID: '人机验证签名校验失败，请重新验证',
  SOLUTION_INVALID: '人机验证未通过，请重试',
  BINDING_MISMATCH: '验证环境发生变化，请重新验证',
  PROVIDER_UNAVAILABLE: '人机验证服务暂不可用，请稍后重试',
  VISIBLE_REQUIRED: '请完成下方安全验证',
  ACCOUNT_FAILURES: '请完成下方安全验证',
  IP_ACCOUNT_FANOUT: '请完成下方安全验证',
  IP_RISK_HIGH: '请完成下方安全验证',
  RATE_LIMIT_PRESSURE: '请求过于频繁，请完成下方安全验证',
  PRIVILEGED_ACCOUNT: '请完成下方安全验证',
  DEVICE_ANOMALY: '请完成下方安全验证',
  MODE_ALWAYS: '请完成下方安全验证',
};
