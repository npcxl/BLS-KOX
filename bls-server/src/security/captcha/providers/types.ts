/**
 * Captcha Provider 抽象
 *
 * 所有 provider（ALTCHA / TIANAI）只暴露两个方法：
 *   - `generate()`：产出**前端渲染所需的原始数据**（保留上游 SDK 原始字段，不改名、不裁剪）
 *   - `verify()`  ：校验前端提交的数据
 *
 * 关键约定：
 *   1. **技术故障与"用户验证失败"必须区分**：上游不可达 / 超时 / 5xx → `TECHNICAL_ERROR`，
 *      绝不返回 `passed:false`（那会被误判成机器人行为，进而错误地锁定正常用户）。
 *   2. Koa 不实现任何验证码算法：ALTCHA 走官方 `altcha/lib`，TIANAI 走独立 Java 服务。
 *   3. 浏览器永远不直接访问 TIANAI：Koa 通过 Docker 内网地址代理（默认 http://tianai-captcha:8083）。
 */

/** 场景（当前仅登录；预留其它场景复用同一套 ticket 机制） */
export type CaptchaScene = 'LOGIN';

/** Provider 标识（对外/对外配置统一大写） */
export type CaptchaProviderName = 'ALTCHA' | 'TIANAI';
export const CAPTCHA_PROVIDER_NAMES: readonly CaptchaProviderName[] = ['ALTCHA', 'TIANAI'];

/** 统一的校验结论：passed=用户过了 / failed=用户没过 / technical_error=我们自己出问题 */
export type CaptchaVerifyStatus = 'passed' | 'failed' | 'technical_error';

/** 技术故障原因（只写审计与日志，不下发内部细节） */
export type CaptchaTechnicalReason =
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_BAD_RESPONSE'
  | 'UPSTREAM_NOT_CONFIGURED'
  | 'ALGORITHM_UNSUPPORTED'
  | 'INTERNAL_ERROR';

/** generate() 的输入 */
export interface CaptchaGenerateInput {
  scene: CaptchaScene;
  /** 账号（用于绑定与策略判定，服务端做 hash） */
  username?: string;
  /** 仅测试/内部使用：指定二级图形验证类型 */
  secondaryType?: string;
  /** challenge 有效期（秒） */
  ttlSeconds?: number;
  /**
   * ALTCHA 专用：写入 HMAC 签名内的业务字段（租户 / 账号 hash / 场景 / 阶段等）。
   * 客户端无法篡改，验签通过后才可信任。
   */
  signedData?: Record<string, string | number | boolean | null>;
}

/** verify() 的输入（前端只提交答案，不提交阶段/身份） */
export interface CaptchaVerifyInput {
  scene: CaptchaScene;
  username?: string;
  /** ALTCHA：官方 widget 产出的 payload */
  payload?: unknown;
  /** TIANAI：Koa 签发的一次性会话 id（由 service 在 Redis 中解析为上游 id） */
  sessionId?: string;
  /** TIANAI：上游 challenge id（由 service 从会话记录中取出后传入；ALTCHA 忽略） */
  upstreamId?: string;
  /** TIANAI：前端答案，**保留 Tianai Web SDK 原始字段结构**（如 {x,y} / {points}） */
  data?: Record<string, unknown>;
}

/** generate() 的输出：完全保留上游 SDK 原始字段 */
export interface CaptchaChallengeResult {
  provider: CaptchaProviderName;
  /** 前端渲染用（TIANAI 的 `data` 原样透传；ALTCHA 为官方 challenge 结构） */
  challenge: Record<string, unknown>;
  /** TIANAI：Koa 生成的本地一次性会话 id（浏览器只能拿到它） */
  sessionId?: string;
  /** 过期时间（毫秒时间戳） */
  expiresAt: number;
  /** 传给前端组件的字段名（ALTCHA widget 用） */
  fieldName?: string;
}

export interface CaptchaVerifyResult {
  status: CaptchaVerifyStatus;
  provider: CaptchaProviderName;
  /** status=failed 时的原因枚举（用于前端提示与审计） */
  reason?: string;
  /** status=technical_error 时的技术原因（写审计/日志，不下发细节） */
  technicalReason?: CaptchaTechnicalReason;
  /** ALTCHA：验签通过后的 parameters.data（服务端唯一可信的阶段/绑定来源） */
  signedData?: Record<string, unknown>;
  /**
   * ALTCHA：验签通过后的 challenge nonce。
   * **必须由 provider 从「解码后的 payload」里取**：前端提交的 `payload` 是 base64 字符串，
   * 调用方直接读 `payload.challenge` 会永远是 undefined（会把"验证通过"误判成 PAYLOAD_MALFORMED）。
   * 服务端用它做 challenge 一次性消费（防重放）。
   */
  challengeNonce?: string;
}

export interface CaptchaProviderAdapter {
  readonly name: CaptchaProviderName;
  /** 该 provider 当前是否可用（未配置/未部署 → false，调用方据此决定降级或 fail closed） */
  isAvailable(): boolean;
  generate(input: CaptchaGenerateInput): Promise<CaptchaChallengeResult>;
  verify(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult>;
}

/** 统一的技术故障错误：**不等于**用户验证失败 */
export const TECHNICAL_ERROR = 'TECHNICAL_ERROR' as const;
