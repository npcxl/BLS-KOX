/**
 * 登录人机验证接口（统一 Ticket 架构，公共，无需认证）
 *
 * 与后端 `bls-server/src/api/captcha/index.ts` 一一对应：
 *   GET  /api/captcha/config     公开配置（启用了哪个 provider / 统一入口地址）
 *   POST /api/captcha/generate   统一生成：ALTCHA 本地 challenge / TIANAI 由 Koa 代理 Java 服务
 *   POST /api/captcha/verify     统一校验：通过后由 Koa 签发**一次性 captchaTicket**
 *
 * 登录接口（`POST /api/auth/login`）只认 `captchaTicket`，不认任何 provider 的原始结果。
 *
 * **前端只被允许提交**：`scene` / `provider`（表达"想请求哪个 provider"）/ `username` /
 * `payload`（ALTCHA 答案）/ `sessionId` + `data`（TIANAI 答案）。
 * 阶段、ticket 内容、上游 challenge id、验证结论全部由服务端决定，前端传了也会被忽略。
 */
import { request } from '@umijs/max';

/** 与后端 CaptchaProviderName 对齐（**大写**） */
export type CaptchaProviderName = 'ALTCHA' | 'TIANAI';
export type CaptchaScene = 'LOGIN';
/** 后端统一状态：passed=已签发 ticket；failed=用户没通过；technical_error=我方技术故障 */
export type CaptchaVerifyStatus = 'passed' | 'failed' | 'technical_error';
export type CaptchaSecondaryType = 'blockPuzzle' | 'clickWord';

/** 统一入口（后端 CaptchaPublicConfig.generateUrl / verifyUrl 的兜底值） */
export const CAPTCHA_CONFIG_URL = '/api/captcha/config';
export const CAPTCHA_GENERATE_URL = '/api/captcha/generate';
export const CAPTCHA_VERIFY_URL = '/api/captcha/verify';
/** ALTCHA widget 隐藏域字段名（后端 CAPTCHA_FIELD_NAME） */
export const CAPTCHA_FIELD_NAME = 'altchaPayload';

/** `GET /api/captcha/config` 下发结构 */
export interface CaptchaConfig {
  enabled: boolean;
  /** 第一层（默认 ALTCHA 静默 PoW） */
  primaryProvider: CaptchaProviderName;
  /** 第二层（默认 TIANAI 图形验证） */
  fallbackProvider: CaptchaProviderName;
  /** 本部署是否启用 TIANAI（false 时风控命中也不会要求图形验证） */
  tianaiEnabled: boolean;
  generateUrl: string;
  verifyUrl: string;
  fieldName: string;
}

/** `POST /api/captcha/generate` 响应 */
export interface CaptchaGenerateResult {
  provider: CaptchaProviderName;
  /** ALTCHA：官方 challenge 结构；TIANAI：Java 服务原始渲染字段 */
  challenge: Record<string, unknown>;
  /** TIANAI：Koa 签发的一次性会话 id（浏览器拿不到上游 challenge id） */
  sessionId?: string;
  expiresAt: number;
  fieldName?: string;
}

/** `POST /api/captcha/verify` 响应 */
export interface CaptchaVerifyResult {
  status: CaptchaVerifyStatus;
  provider: CaptchaProviderName;
  /** status=passed 时返回：登录接口唯一认的凭证 */
  captchaTicket?: string;
  expiresAt?: number;
  /** status=failed 时的通用原因（不含内部风控细节） */
  reason?: string;
  /** ALTCHA 通过但风控命中（或 ALTCHA 技术故障）→ 需要继续完成 TIANAI 第二层 */
  requireFallback?: boolean;
  nextProvider?: CaptchaProviderName;
  /**
   * 第二层升级凭证：**只有服务端风控判定需要升级时才会下发**，
   * 生成 TIANAI challenge 时必须回传（缺它 `/generate` 会返回 40011）。
   */
  escalationGrant?: string;
  escalationExpiresAt?: number;
}

/** 第二层（Tianai）challenge —— 由前端把 `/generate` 结果归一化后交给 TianaiCaptcha 组件 */
export interface SecondaryChallenge {
  sessionId: string;
  type: CaptchaSecondaryType;
  expiresAt: number;
  payload: Record<string, unknown>;
}

/**
 * captcha 业务码：40010 缺失 / 40011 无效 / 40012 过期 / 40013 重放 /
 * 50301 服务不可用（Redis 挂）/ 50302 上游技术故障（Tianai 不可达 / 超时）。
 * 两者都必须重新走验证流程，且**绝不能**当成"密码错误"，否则不会自动重放密码。
 */
export const CAPTCHA_ERROR_CODES = [40010, 40011, 40012, 40013, 50301, 50302] as const;

const OPTIONS = { skipErrorMessage: true } as const;

/** 读取公开配置 */
export async function getCaptchaConfig(
  params?: { username?: string },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<CaptchaConfig>>(CAPTCHA_CONFIG_URL, {
    method: 'GET',
    params,
    ...OPTIONS,
    ...(options || {}),
  });
}

/**
 * 统一生成入口。
 * `provider` 只是"想请求哪个 provider"的意图，服务端仍会按配置与风控决定实际行为。
 * 请求第二层（TIANAI）时必须带上服务端在风控升级时下发的 `escalationGrant`。
 */
export async function generateCaptcha(
  data: {
    scene?: CaptchaScene;
    provider?: CaptchaProviderName;
    username?: string;
    escalationGrant?: string;
  },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<CaptchaGenerateResult>>(CAPTCHA_GENERATE_URL, {
    method: 'POST',
    data: { scene: 'LOGIN', ...data },
    ...OPTIONS,
    ...(options || {}),
  });
}

/**
 * 统一校验入口：通过后返回一次性 captchaTicket。
 * ALTCHA 传 `payload`；TIANAI 传 `sessionId` + `data`
 * （`data` = Tianai 官方 `ImageCaptchaTrack` 轨迹 DTO，**不传 stage**）。
 */
export async function verifyCaptcha(
  data: {
    scene?: CaptchaScene;
    provider?: CaptchaProviderName;
    username?: string;
    payload?: unknown;
    sessionId?: string;
    data?: Record<string, unknown>;
  },
  options?: Record<string, any>,
) {
  return request<API.ResponseResult<CaptchaVerifyResult>>(CAPTCHA_VERIFY_URL, {
    method: 'POST',
    data: { scene: 'LOGIN', ...data },
    ...OPTIONS,
    ...(options || {}),
  });
}

/**
 * 从上游 Tianai challenge 推断二级类型（唯一依据是上游 `type`，不是本地配置猜测）。
 * 官方类型分类（`SimpleImageCaptchaValidator` 构造时注册）：
 *   SLIDER / CONCAT / ROTATE → 滑块类（本系统统一用 blockPuzzle 语义名）
 *   WORD_IMAGE_CLICK        → 点选文字
 */
export function secondaryTypeOf(challenge: Record<string, unknown> | null | undefined): CaptchaSecondaryType {
  const raw = String((challenge as any)?.type ?? '').toUpperCase();
  return raw.includes('WORD') || raw.includes('CLICK') ? 'clickWord' : 'blockPuzzle';
}

/** 失败原因 → 中文提示（对外只有通用原因，不含内部风控细节） */
export const CAPTCHA_REASON_TEXT: Record<string, string> = {
  PAYLOAD_MISSING: '请先完成人机验证',
  PAYLOAD_MALFORMED: '人机验证数据无效，请重试',
  ALGORITHM_UNSUPPORTED: '人机验证算法不受支持，请联系管理员',
  CHALLENGE_EXPIRED: '验证已过期，请重新验证',
  SIGNATURE_INVALID: '人机验证签名校验失败，请重新验证',
  SOLUTION_INVALID: '人机验证未通过，请重试',
  BINDING_MISMATCH: '验证环境发生变化，请重新验证',
  STAGE_MISMATCH: '验证阶段不匹配，请刷新页面后重试',
  PROVIDER_UNAVAILABLE: '人机验证服务暂不可用，请稍后重试',
  INTERNAL_ERROR: '人机验证服务暂不可用，请稍后重试',
  SECONDARY_REQUIRED: '需要完成额外安全验证',
  UPSTREAM_TIMEOUT: '人机验证服务响应超时，请稍后重试',
  UPSTREAM_UNREACHABLE: '人机验证服务暂不可用，请稍后重试',
  UPSTREAM_BAD_RESPONSE: '人机验证服务异常，请稍后重试',
};
