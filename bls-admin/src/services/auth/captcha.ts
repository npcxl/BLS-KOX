/**
 * 登录人机验证接口（公共，无需认证）
 *
 * 与后端 `bls-server/src/api/auth/captcha/index.ts` 一一对应。
 * 全部请求 skipErrorMessage：错误提示由登录页/验证码弹窗自己控制，避免重复 toast。
 */
import { request } from '@umijs/max';

export type CaptchaMode = 'off' | 'adaptive' | 'always';
export type CaptchaSecondaryType = 'slider' | 'rotate';

/** 公共配置：后端只下发前端需要的字段（不含阈值与内部规则） */
export interface CaptchaPublicConfig {
  enabled: boolean;
  mode: CaptchaMode;
  secondaryTypes: CaptchaSecondaryType[];
}

export interface CaptchaSecondaryPayload {
  canvasWidth: number;
  canvasHeight: number;
  pieceSize?: number;
  pieceY?: number;
  backgroundImageUrl?: string;
  pieceImageUrl?: string;
  imageUrl?: string;
  tolerance?: number;
  keyboardHint?: string;
  keyboardStep?: number;
  hint?: string;
}

export interface CaptchaChallenge {
  challengeId: string;
  stage: 'silent' | 'secondary';
  expiresAt: number;
  nonce: string;
  secondaryType?: CaptchaSecondaryType;
  payload?: CaptchaSecondaryPayload | null;
}

export interface CaptchaChallengeResult {
  enabled: boolean;
  challengeId?: string;
  stage?: 'silent' | 'secondary';
  expiresAt?: number;
  nonce?: string;
  secondaryType?: CaptchaSecondaryType;
  payload?: CaptchaSecondaryPayload | null;
}

export interface SilentVerifyResult {
  passed: boolean;
  captchaToken?: string;
  expiresAt?: number;
  nextStage?: 'secondary';
  secondaryChallenge?: CaptchaChallenge;
}

export interface SecondaryVerifyResult {
  passed: boolean;
  captchaToken?: string;
  expiresAt?: number;
  retryable?: boolean;
  remainingAttempts?: number;
  reason?: string;
}

/** 行为统计（只上传统计值，不上传轨迹 / 按键内容） */
export interface InteractionSummary {
  dwellMs: number;
  mouse?: Record<string, number>;
  touch?: Record<string, number>;
  keyboard?: Record<string, number>;
  focus?: Record<string, number>;
  automation?: Record<string, unknown>;
}

const OPTIONS = { skipErrorMessage: true } as const;

export async function getCaptchaConfig(options?: Record<string, any>) {
  return request<API.ResponseResult<CaptchaPublicConfig>>('/api/auth/captcha/config', {
    method: 'GET',
    ...OPTIONS,
    ...(options || {}),
  });
}

export async function createCaptchaChallenge(
  data: { username?: string; stage?: 'secondary' },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<CaptchaChallengeResult>>('/api/auth/captcha/challenge', {
    method: 'POST',
    data,
    ...OPTIONS,
    ...(options || {}),
  });
}

export async function verifyCaptchaSilent(
  data: {
    challengeId: string;
    nonce: string;
    username?: string;
    startedAt?: number;
    finishedAt?: number;
    interactionSummary?: InteractionSummary;
    proof?: unknown;
  },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<SilentVerifyResult>>('/api/auth/captcha/silent/verify', {
    method: 'POST',
    data,
    ...OPTIONS,
    ...(options || {}),
  });
}

export async function verifyCaptchaSecondary(
  data: {
    challengeId: string;
    username?: string;
    answer: { x?: number; angle?: number };
    nonce?: string;
  },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<SecondaryVerifyResult>>('/api/auth/captcha/secondary/verify', {
    method: 'POST',
    data,
    ...OPTIONS,
    ...(options || {}),
  });
}
