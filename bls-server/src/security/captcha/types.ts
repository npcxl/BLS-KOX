/**
 * 登录人机验证（captcha）— 类型定义
 *
 * 两级验证：
 *   1. silent    —— 静默行为验证（无感），评分达到阈值即签发 captchaToken
 *   2. secondary —— 可视化验证（slider / rotate），答案只保存在 Redis，绝不下发前端
 */
import type { CaptchaMode, CaptchaSecondaryType } from '../../config/dynamic-config';

export type { CaptchaMode, CaptchaSecondaryType };

export type CaptchaStage = 'silent' | 'secondary';

/** 二级验证答案（仅 Redis 保存） */
export interface SecondaryAnswer {
  /** slider：正确切片的 x 坐标 */
  x?: number;
  /** rotate：服务端已施加的旋转角（度） */
  angle?: number;
}

/** challenge 记录（Redis） */
export interface ChallengeRecord {
  challengeId: string;
  /** 绑定租户 */
  tenantId: string;
  /** 绑定租户域名 hash */
  domainHash: string;
  /** 绑定登录 username hash */
  usernameHash: string;
  /** 绑定 IP hash */
  ipHash: string;
  /** 绑定 User-Agent hash */
  uaHash: string;
  stage: CaptchaStage;
  secondaryType?: CaptchaSecondaryType;
  /** 二级验证正确答案（仅服务端可见） */
  answer?: SecondaryAnswer;
  /** challenge nonce（crypto.randomBytes） */
  nonce: string;
  /** 是否由强制策略（风险/失败次数/超管）强制进入二级 */
  forced: boolean;
  createdAt: number;
  expiresAt: number;
  /** 已下发的图片 id（用于失效时清理） */
  imageIds?: string[];
}

/** captchaToken 记录（Redis，仅保存 Token hash 对应记录） */
export interface CaptchaTokenRecord {
  challengeId: string;
  tenantId: string;
  domainHash: string;
  usernameHash: string;
  ipHash: string;
  uaHash: string;
  stage: CaptchaStage;
  issuedAt: number;
  expiresAt: number;
}

/** captchaToken 载荷（签名部分，不含任何隐私数据） */
export interface CaptchaTokenPayload {
  v: 1;
  /** challengeId */
  c: string;
  /** 租户 */
  t: string;
  /** 过期时间（秒） */
  e: number;
}

/** ============ 前端上报的交互统计（仅统计值，禁止轨迹 / 按键内容） ============ */
export interface PointerSummary {
  /** 事件总数 */
  count?: number;
  /** 移动事件数 */
  moves?: number;
  /** 平均速度 px/ms */
  avgSpeed?: number;
  /** 最大速度 px/ms */
  maxSpeed?: number;
  /** 平均事件间隔 ms */
  avgInterval?: number;
  /** 事件间隔标准差 ms */
  stdInterval?: number;
  /** 轨迹直线度 0-1 */
  straightness?: number;
}

export interface KeyboardSummary {
  count?: number;
  avgInterval?: number;
  stdInterval?: number;
}

export interface FocusSummary {
  blurCount?: number;
  visibilityChanges?: number;
  hiddenMs?: number;
}

export interface AutomationSummary {
  webdriver?: boolean;
  headless?: boolean;
  /** navigator.plugins.length */
  plugins?: number;
  /** navigator.languages.length */
  languages?: number;
  /** 浏览器指纹声明为自动化工具（如 "HeadlessChrome" 出现在 UA 中时由服务端补充） */
  suspicious?: boolean;
}

export interface InteractionSummary {
  /** 页面停留时间（ms），服务端会以自身观测值做上界裁剪 */
  dwellMs?: number;
  mouse?: PointerSummary;
  touch?: PointerSummary;
  keyboard?: KeyboardSummary;
  focus?: FocusSummary;
  automation?: AutomationSummary;
}

/** 静默验证失败原因枚举（写入安全审计） */
export type SilentReason =
  | 'AUTOMATION_DETECTED'
  | 'TOO_FAST'
  | 'NO_HUMAN_SIGNAL'
  | 'IRREGULAR_TIMING'
  | 'LOW_SCORE'
  | 'NONCE_REPLAY'
  | 'POW_INVALID'
  | 'RISK_FORCED'
  | 'ACCOUNT_FAILURES'
  | 'IP_ACCOUNT_FANOUT'
  | 'IP_RISK_HIGH'
  | 'DEVICE_ANOMALY'
  | 'PRIVILEGED_ACCOUNT'
  | 'RATE_LIMIT_PRESSURE'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_STAGE_MISMATCH';

/** 二级验证失败原因枚举 */
export type SecondaryReason =
  | 'ANSWER_MISMATCH'
  | 'MAX_ATTEMPTS'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_STAGE_MISMATCH'
  | 'MISSING_ANSWER'
  | 'TOKEN_BINDING_MISMATCH';

/** 静默评分结果 */
export interface SilentScoreResult {
  score: number;
  passed: boolean;
  reasons: SilentReason[];
  /** 命中的自动化标识等 */
  signals: {
    humanInteractions: number;
    modals: string[];
  };
}

/** 二级 challenge 下发给前端的载荷（不含答案） */
export interface SecondaryPayload {
  /** 图片/滑块尺寸 */
  canvasWidth: number;
  canvasHeight: number;
  /** slider：拼图块尺寸与初始 y，x 由用户拖动决定 */
  pieceSize?: number;
  pieceY?: number;
  /** slider：背景图（缺角） */
  backgroundImageUrl?: string;
  /** slider：拼图块图 */
  pieceImageUrl?: string;
  /** rotate：待回正的图片 */
  imageUrl?: string;
  /** 允许误差（px 或 度）—— 不泄露答案位置 */
  tolerance?: number;
  /** 无障碍：键盘操作说明（预留键盘可操作替代方式） */
  keyboardHint?: string;
  /** 无障碍：键盘步长 */
  keyboardStep?: number;
  /** 提示文案 */
  hint?: string;
}

/** challenge 下发结构 */
export interface ChallengeResponse {
  challengeId: string;
  stage: CaptchaStage;
  expiresAt: number;
  nonce: string;
  secondaryType?: CaptchaSecondaryType;
  payload?: SecondaryPayload | null;
}

/** 静默验证结果 */
export type SilentVerifyResult =
  | { passed: true; captchaToken: string; expiresAt: number }
  | { passed: false; nextStage: 'secondary'; secondaryChallenge: ChallengeResponse };

/** 二级验证结果 */
export type SecondaryVerifyResult =
  | { passed: true; captchaToken: string; expiresAt: number }
  | { passed: false; retryable: boolean; remainingAttempts: number; reason: SecondaryReason };

/** 二级验证类型（第一版：滑块拼图 / 图像旋转） */
export const SECONDARY_TYPE_SLIDER: CaptchaSecondaryType = 'slider';
export const SECONDARY_TYPE_ROTATE: CaptchaSecondaryType = 'rotate';

/** 默认误差范围 */
export const SLIDER_TOLERANCE_PX = 8;
export const ROTATE_TOLERANCE_DEG = 15;

/** 静默验证失败计数窗口（秒） */
export const FAILURE_WINDOW_SECONDS = 900;

/** 二级图片尺寸 */
export const SLIDER_CANVAS_WIDTH = 320;
export const SLIDER_CANVAS_HEIGHT = 160;
export const SLIDER_PIECE_SIZE = 44;
export const ROTATE_CANVAS_SIZE = 200;
