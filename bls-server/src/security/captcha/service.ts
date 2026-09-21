/**
 * 登录人机验证服务（两级）
 *
 * 流程：
 *   POST /api/auth/captcha/challenge          → 创建 challenge（silent 或 secondary）
 *   POST /api/auth/captcha/silent/verify      → 静默评分；通过签发 captchaToken，否则下发二级验证
 *   POST /api/auth/captcha/secondary/verify   → 二级验证；通过签发 captchaToken
 *   POST /api/auth/login (captchaToken)       → 一次性消费 captchaToken，通过后才检查用户名 / 密码
 *
 * 安全约束：
 *   - challengeId / nonce 使用 crypto.randomBytes；Token 比较使用 timingSafeEqual
 *   - 答案只写 Redis；captchaToken 只存 hash；一次消费（SET NX EX）；绑定 challenge / 租户域名 /
 *     username hash / IP hash / UA hash
 *   - 审计只记录 challengeId、验证类型、风险分数、失败原因枚举、tenantId、usernameHash、IP hash、requestId
 *   - Redis 不可用时 fail closed（503 CAPTCHA_SERVICE_UNAVAILABLE）
 */
import { env } from '../../config/env';
import { getDynamicConfig, type DynamicConfig } from '../../config/dynamic-config';
import {
  CaptchaExpiredError,
  CaptchaInvalidError,
  CaptchaReplayedError,
  CaptchaRequiredError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors';
import { logger } from '../../core/logger';
import { SecurityEventType, RiskLevel, writeSecurityLog, type SecurityLogInput } from '../../core/security-audit';
import { queryOne } from '../../core/database';
import { findTenantByDomain, findTenantById } from '../../services/tenant-lifecycle';
import { PLATFORM_TENANT_ID } from '../../shared/constants/tenant';
import { CAPTCHA_KEY, CaptchaStore, captchaStore } from './store';
import { isCaptchaActive, loadCaptchaConfig, publicConfig, type CaptchaRuntimeConfig } from './config';
import {
  angleDelta,
  captchaTokenHash,
  parseCaptchaToken,
  pickOne,
  randomId,
  safeEqual,
  sha256Hex,
  signCaptchaToken,
} from './crypto-utils';
import { createDefaultRiskProvider, evaluateForceSecondary, type IpRisk, type RiskProvider } from './policy';
import { generateRotateImage, generateSliderImages } from './image';
import { sanitizeInteractionSummary, scoreSilent, uaLooksAutomated, verifyPow } from './silent';
import {
  FAILURE_WINDOW_SECONDS,
  ROTATE_TOLERANCE_DEG,
  SLIDER_TOLERANCE_PX,
  type CaptchaSecondaryType,
  type CaptchaStage,
  type CaptchaTokenPayload,
  type CaptchaTokenRecord,
  type ChallengeRecord,
  type ChallengeResponse,
  type InteractionSummary,
  type SecondaryReason,
  type SecondaryVerifyResult,
  type SilentReason,
  type SilentVerifyResult,
} from './types';

// ==================== 依赖注入 ====================

export type GetConfigFn = (tenantId: string) => Promise<DynamicConfig>;

export interface CaptchaServiceDeps {
  store?: CaptchaStore;
  getConfig?: GetConfigFn;
  risk?: RiskProvider;
  now?: () => number;
  /** 安全审计写入（可注入以便测试断言） */
  audit?: (input: SecurityLogInput) => Promise<void>;
  /** 开发环境显式绕过（生产环境启动时会被阻止） */
  devBypass?: boolean;
  /** 域名 → 租户 */
  resolveTenant?: (domainName: string) => Promise<string | null>;
  /** 是否平台超管账号 */
  isPrivilegedAccount?: (tenantId: string, username: string) => Promise<boolean>;
  /** captchaToken 签名密钥 */
  secret?: string;
}

export interface CaptchaBindings {
  tenantId: string;
  domainHash: string;
  usernameHash: string;
  ipHash: string;
  uaHash: string;
}

export interface CaptchaRequestMeta {
  domainName: string;
  username: string;
  ip: string;
  userAgent?: string | null;
  requestId?: string | null;
  route?: string | null;
  method?: string | null;
}

/** 审计只允许这几个字段 */
interface CaptchaAuditInput {
  eventType: SecurityEventType;
  riskLevel?: RiskLevel;
  challengeId?: string;
  stage?: CaptchaStage;
  secondaryType?: CaptchaSecondaryType;
  score?: number;
  reason?: string;
  tenantId: string;
  usernameHash?: string;
  ipHash?: string;
  clientIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  route?: string | null;
  method?: string | null;
}

const CAPTCHA_AUDIT_TITLES: Record<string, string> = {
  CAPTCHA_SILENT_PASSED: '静默人机验证通过',
  CAPTCHA_SILENT_FAILED: '静默人机验证未通过',
  CAPTCHA_SECONDARY_REQUIRED: '强制进入二次人机验证',
  CAPTCHA_SECONDARY_PASSED: '二次人机验证通过',
  CAPTCHA_SECONDARY_FAILED: '二次人机验证失败',
  CAPTCHA_TOKEN_INVALID: '人机验证凭证无效',
  CAPTCHA_TOKEN_REPLAYED: '人机验证凭证重放',
  CAPTCHA_SERVICE_UNAVAILABLE: '人机验证服务不可用',
};

function defaultAudit(input: CaptchaAuditInput): Promise<void> {
  return writeSecurityLog({
    eventType: input.eventType,
    riskLevel: input.riskLevel,
    title: CAPTCHA_AUDIT_TITLES[input.eventType] ?? input.eventType,
    // 只保存允许的字段：challengeId / 验证类型 / 风险分数 / 失败原因 / tenantId / usernameHash / IP hash / requestId
    detail: {
      challengeId: input.challengeId ?? null,
      stage: input.stage ?? null,
      secondaryType: input.secondaryType ?? null,
      riskScore: input.score ?? null,
      failureReason: input.reason ?? null,
      tenantId: input.tenantId,
      usernameHash: input.usernameHash ?? null,
      ipHash: input.ipHash ?? null,
      requestId: input.requestId ?? null,
    },
    actor: {
      tenantId: input.tenantId,
      clientIp: input.clientIp ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
    },
    route: input.route ?? null,
    method: input.method ?? null,
    source: 'captcha',
  });
}

/** 默认：域名 → 租户（与登录一致，localhost 回退平台租户） */
async function defaultResolveTenant(domainName: string): Promise<string | null> {
  const tenant = await findTenantByDomain(domainName);
  if (tenant) return tenant.tenantId;
  if (domainName === 'localhost' || domainName === '127.0.0.1' || domainName === '::1') {
    const platform = await findTenantById(PLATFORM_TENANT_ID);
    return platform?.tenantId ?? null;
  }
  return null;
}

/** 平台超级管理员：is_admin=1（含平台租户内置超管） */
async function defaultIsPrivilegedAccount(tenantId: string, username: string): Promise<boolean> {
  if (!username) return false;
  try {
    const row = await queryOne<any>(
      `SELECT is_admin AS isAdmin FROM sys_user
       WHERE tenant_id = :tid AND username = :un AND deleted = 0 LIMIT 1`,
      { tid: tenantId, un: username },
    );
    if (!row) return false;
    return Number(row.isAdmin ?? 0) === 1;
  } catch (err) {
    logger.warn('[captcha] privileged account lookup failed', { error: String(err) });
    return false;
  }
}

// ==================== 服务 ====================

export class CaptchaService {
  private store: CaptchaStore;
  private getConfigFn: GetConfigFn;
  private risk: RiskProvider;
  private now: () => number;
  private audit: (input: SecurityLogInput) => Promise<void>;
  private resolveTenant: (domainName: string) => Promise<string | null>;
  private isPrivilegedAccount: (tenantId: string, username: string) => Promise<boolean>;
  private secret: string;

  /** 开发环境显式绕过（CAPTCHA_DEV_BYPASS=true，生产环境启动会被阻止） */
  readonly devBypass: boolean;

  constructor(deps: CaptchaServiceDeps = {}) {
    this.store = deps.store ?? captchaStore;
    this.getConfigFn = deps.getConfig ?? getDynamicConfig;
    this.risk = deps.risk ?? createDefaultRiskProvider();
    this.now = deps.now ?? (() => Date.now());
    this.audit = deps.audit ?? ((input) => defaultAudit(input as unknown as CaptchaAuditInput));
    this.resolveTenant = deps.resolveTenant ?? defaultResolveTenant;
    this.isPrivilegedAccount = deps.isPrivilegedAccount ?? defaultIsPrivilegedAccount;
    this.secret = deps.secret ?? env.captcha.secret;
    this.devBypass = deps.devBypass ?? env.captcha.devBypass;
  }

  // ---------- 公共配置 ----------

  async getPublicConfig(domainName: string): Promise<{ enabled: boolean; mode: string; secondaryTypes: CaptchaSecondaryType[] }> {
    if (this.devBypass) return { enabled: false, mode: 'off', secondaryTypes: [] };
    const tenantId = await this.resolveTenantSafe(domainName);
    if (!tenantId) return { enabled: false, mode: 'off', secondaryTypes: [] };
    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    return publicConfig(cfg);
  }

  private async resolveTenantSafe(domainName: string): Promise<string | null> {
    try {
      return (await this.resolveTenant(domainName)) ?? null;
    } catch (err) {
      logger.warn('[captcha] tenant resolve failed', { error: String(err) });
      return null;
    }
  }

  private active(cfg: CaptchaRuntimeConfig): boolean {
    return !this.devBypass && isCaptchaActive(cfg);
  }

  private bindings(meta: CaptchaRequestMeta, tenantId: string): CaptchaBindings {
    return {
      tenantId,
      domainHash: sha256Hex(meta.domainName.toLowerCase()),
      usernameHash: sha256Hex((meta.username ?? '').trim().toLowerCase()),
      ipHash: sha256Hex(meta.ip ?? 'unknown'),
      uaHash: sha256Hex(meta.userAgent ?? ''),
    };
  }

  // ---------- challenge ----------

  async createChallenge(
    meta: CaptchaRequestMeta,
    preferredStage?: CaptchaStage,
  ): Promise<{ enabled: boolean; challenge: ChallengeResponse | null }> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');

    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    if (!this.active(cfg)) return { enabled: false, challenge: null };

    const b = this.bindings(meta, tenantId);
    try {
      await this.store.recordIpAccount(b.ipHash, b.usernameHash, FAILURE_WINDOW_SECONDS);
    } catch { /* 风险信号失败不阻断主流程 */ }

    const forceSecondary = preferredStage === 'secondary' || cfg.mode === 'always';
    const challenge = forceSecondary
      ? await this.buildSecondaryChallenge(cfg, b, true)
      : await this.buildSilentChallenge(cfg, b);
    return { enabled: true, challenge };
  }

  private expiresAt(cfg: CaptchaRuntimeConfig): number {
    return this.now() + cfg.challengeTtlSeconds * 1000;
  }

  private async buildSilentChallenge(cfg: CaptchaRuntimeConfig, b: CaptchaBindings): Promise<ChallengeResponse> {
    const challengeId = randomId(18);
    const nonce = randomId(24);

    // nonce 首次占用失败（重放 / 碰撞）→ 直接进入第二层
    const claimed = await this.store.claimNonce(nonce, cfg.challengeTtlSeconds);
    if (!claimed) return this.buildSecondaryChallenge(cfg, b, true);

    const now = this.now();
    const record: ChallengeRecord = {
      challengeId,
      tenantId: b.tenantId,
      domainHash: b.domainHash,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      uaHash: b.uaHash,
      stage: 'silent',
      nonce,
      forced: false,
      createdAt: now,
      expiresAt: this.expiresAt(cfg),
    };
    await this.store.saveChallenge(record, cfg.challengeTtlSeconds);
    return { challengeId, stage: 'silent', expiresAt: record.expiresAt, nonce, payload: null };
  }

  private async buildSecondaryChallenge(cfg: CaptchaRuntimeConfig, b: CaptchaBindings, forced: boolean): Promise<ChallengeResponse> {
    const challengeId = randomId(18);
    const nonce = randomId(24);
    const secondaryType = pickOne(cfg.secondaryTypes.length ? cfg.secondaryTypes : (['slider'] as CaptchaSecondaryType[]));
    const now = this.now();
    const expiresAt = this.expiresAt(cfg);

    let payload: ChallengeResponse['payload'];
    let answer: ChallengeRecord['answer'];
    const imageIds: string[] = [];

    if (secondaryType === 'rotate') {
      const img = generateRotateImage();
      const imageId = randomId(12);
      await this.store.saveImage(imageId, img.svg, cfg.challengeTtlSeconds);
      imageIds.push(imageId);
      answer = { angle: img.angle };
      payload = {
        canvasWidth: img.canvasSize,
        canvasHeight: img.canvasSize,
        imageUrl: `/api/auth/captcha/image/${imageId}`,
        tolerance: ROTATE_TOLERANCE_DEG,
        keyboardStep: 5,
        keyboardHint: '可用左右方向键旋转图片，Enter 提交',
        hint: '旋转图片使其回正',
      };
    } else {
      const img = generateSliderImages();
      const bgId = randomId(12);
      const pieceId = randomId(12);
      await this.store.saveImage(bgId, img.backgroundSvg, cfg.challengeTtlSeconds);
      await this.store.saveImage(pieceId, img.pieceSvg, cfg.challengeTtlSeconds);
      imageIds.push(bgId, pieceId);
      answer = { x: img.pieceX };
      payload = {
        canvasWidth: img.canvasWidth,
        canvasHeight: img.canvasHeight,
        pieceSize: img.pieceSize,
        pieceY: img.pieceY,
        backgroundImageUrl: `/api/auth/captcha/image/${bgId}`,
        pieceImageUrl: `/api/auth/captcha/image/${pieceId}`,
        tolerance: SLIDER_TOLERANCE_PX,
        keyboardStep: 4,
        keyboardHint: '可用左右方向键移动滑块，Enter 提交',
        hint: '拖动滑块使拼图归位',
      };
    }

    const record: ChallengeRecord = {
      challengeId,
      tenantId: b.tenantId,
      domainHash: b.domainHash,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      uaHash: b.uaHash,
      stage: 'secondary',
      secondaryType,
      answer,
      nonce,
      forced,
      createdAt: now,
      expiresAt,
      imageIds,
    };
    await this.store.saveChallenge(record, cfg.challengeTtlSeconds);
    return { challengeId, stage: 'secondary', expiresAt, nonce, secondaryType, payload };
  }

  // ---------- 图片（no-store 接口使用） ----------

  async getImage(imageId: string): Promise<string | null> {
    if (!imageId || imageId.length > 128) return null;
    return this.store.getImage(imageId);
  }

  // ---------- 第一层：静默验证 ----------

  async verifySilent(
    meta: CaptchaRequestMeta & {
      challengeId: string;
      nonce: string;
      interactionSummary?: unknown;
      proof?: unknown;
      startedAt?: number;
      finishedAt?: number;
    },
  ): Promise<SilentVerifyResult> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');
    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    if (!this.active(cfg)) throw new ValidationError('登录人机验证未开启');

    const b = this.bindings(meta, tenantId);
    const now = this.now();
    const record = await this.store.getChallenge(meta.challengeId);

    const toSecondary = async (
      eventType: SecurityEventType,
      reason: SilentReason,
      score: number,
      stage: CaptchaStage = 'silent',
      secondaryType?: CaptchaSecondaryType,
    ): Promise<SilentVerifyResult> => {
      await this.safeAudit({
        eventType,
        challengeId: meta.challengeId,
        stage,
        secondaryType,
        score,
        reason,
        tenantId,
        usernameHash: b.usernameHash,
        ipHash: b.ipHash,
        clientIp: meta.ip,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
        route: meta.route,
        method: meta.method,
      });
      const secondaryChallenge = await this.buildSecondaryChallenge(cfg, b, true);
      return { passed: false, nextStage: 'secondary', secondaryChallenge };
    };

    // challenge 缺失 / 过期 / 阶段不符 → 一律进入第二层（不存在绕过路径）
    if (!record) return toSecondary(SecurityEventType.CAPTCHA_SECONDARY_REQUIRED, 'CHALLENGE_NOT_FOUND', 0);
    if (record.stage !== 'silent') {
      return toSecondary(SecurityEventType.CAPTCHA_SECONDARY_REQUIRED, 'CHALLENGE_STAGE_MISMATCH', 0, record.stage, record.secondaryType);
    }
    if (record.expiresAt <= now) {
      await this.store.deleteChallenge(record.challengeId).catch(() => { /* ignore */ });
      return toSecondary(SecurityEventType.CAPTCHA_SECONDARY_REQUIRED, 'CHALLENGE_EXPIRED', 0);
    }

    // 绑定校验：challenge 必须与当前请求同租户 / 同域名 / 同账号 / 同设备
    const bindingMismatch =
      !safeEqual(record.tenantId, b.tenantId)
      || !safeEqual(record.domainHash, b.domainHash)
      || !safeEqual(record.usernameHash, b.usernameHash)
      || !safeEqual(record.ipHash, b.ipHash)
      || !safeEqual(record.uaHash, b.uaHash);

    // nonce 重放
    const nonceReplayed = !safeEqual(record.nonce, String(meta.nonce ?? ''));

    const summary: InteractionSummary = sanitizeInteractionSummary(meta.interactionSummary);
    const serverDwellMs = Math.max(0, now - record.createdAt);
    const clientDwell =
      typeof meta.finishedAt === 'number' && typeof meta.startedAt === 'number'
        ? Math.max(0, meta.finishedAt - meta.startedAt)
        : undefined;
    const dwellMs = clientDwell !== undefined ? Math.min(clientDwell, serverDwellMs + 5000) : serverDwellMs;

    const pow = meta.proof === undefined ? { provided: false, valid: false } : verifyPow(record.challengeId, meta.proof);

    // 风险信号（并行采集，任一失败都降级为安全默认值）
    const [accountFailures, ipAccountCount, ipRisk, rateLimitPressure, privileged] = await Promise.all([
      this.store.getAccountFailures(record.tenantId, b.usernameHash).catch(() => 0),
      this.store.getIpAccountCount(b.ipHash).catch(() => 0),
      this.risk.getIpRisk(meta.ip).catch((): IpRisk => ({ score: 0, level: RiskLevel.LOW })),
      this.store.getRateLimitPressure(meta.ip).catch(() => 0),
      this.isPrivilegedAccount(record.tenantId, meta.username).catch(() => false),
    ]);

    const scoreResult = scoreSilent({
      summary: { ...summary, dwellMs },
      serverDwellMs,
      userAgent: meta.userAgent,
      threshold: cfg.silentThreshold,
      pow,
    });

    const force = evaluateForceSecondary({
      mode: cfg.mode,
      forceAfterFailures: cfg.forceAfterFailures,
      accountFailures,
      ipAccountCount,
      ipRisk,
      rateLimitPressure,
      nonceReplayed,
      uaAnomalous: bindingMismatch || uaLooksAutomated(meta.userAgent),
      privilegedAccount: privileged,
    });

    if (force.forced || !scoreResult.passed) {
      const reason: SilentReason = force.forced
        ? (force.reasons[0] ?? 'RISK_FORCED')
        : (scoreResult.reasons[0] ?? 'LOW_SCORE');
      const eventType = force.forced
        ? SecurityEventType.CAPTCHA_SECONDARY_REQUIRED
        : SecurityEventType.CAPTCHA_SILENT_FAILED;
      return toSecondary(eventType, reason, scoreResult.score);
    }

    const issued = await this.issueToken(cfg, record.challengeId, b, 'silent', record.tenantId);
    await this.safeAudit({
      eventType: SecurityEventType.CAPTCHA_SILENT_PASSED,
      challengeId: record.challengeId,
      stage: 'silent',
      score: scoreResult.score,
      tenantId,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      clientIp: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
      route: meta.route,
      method: meta.method,
    });
    return { passed: true, captchaToken: issued.captchaToken, expiresAt: issued.expiresAt };
  }

  // ---------- 第二层：可视化验证 ----------

  async verifySecondary(
    meta: CaptchaRequestMeta & {
      challengeId: string;
      answer?: { x?: number; angle?: number };
      nonce?: string;
    },
  ): Promise<SecondaryVerifyResult> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');
    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    if (!this.active(cfg)) throw new ValidationError('登录人机验证未开启');

    const b = this.bindings(meta, tenantId);

    const deny = async (
      reason: SecondaryReason,
      retryable: boolean,
      remainingAttempts: number,
      stage: CaptchaStage = 'secondary',
      secondaryType?: CaptchaSecondaryType,
    ): Promise<SecondaryVerifyResult> => {
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_SECONDARY_FAILED,
        challengeId: meta.challengeId,
        stage,
        secondaryType,
        reason,
        tenantId,
        usernameHash: b.usernameHash,
        ipHash: b.ipHash,
        clientIp: meta.ip,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
        route: meta.route,
        method: meta.method,
      });
      return { passed: false, retryable, remainingAttempts, reason };
    };

    const record = await this.store.getChallenge(meta.challengeId);
    const now = this.now();
    if (!record) return deny('CHALLENGE_NOT_FOUND', false, 0);
    if (record.stage !== 'secondary') return deny('CHALLENGE_STAGE_MISMATCH', false, 0, record.stage);
    if (record.expiresAt <= now) {
      await this.store.deleteChallenge(record.challengeId).catch(() => { /* ignore */ });
      return deny('CHALLENGE_EXPIRED', false, 0, 'secondary', record.secondaryType);
    }

    const bindingMismatch =
      !safeEqual(record.tenantId, b.tenantId)
      || !safeEqual(record.domainHash, b.domainHash)
      || !safeEqual(record.usernameHash, b.usernameHash)
      || !safeEqual(record.ipHash, b.ipHash)
      || !safeEqual(record.uaHash, b.uaHash);
    if (bindingMismatch) return deny('TOKEN_BINDING_MISMATCH', false, 0, record.stage, record.secondaryType);

    // 尝试次数：超过上限立即失效
    const attempts = await this.store.bumpAttempts(record.challengeId, cfg.challengeTtlSeconds);
    if (attempts > cfg.maxAttempts) {
      await this.store.deleteChallenge(record.challengeId).catch(() => { /* ignore */ });
      return deny('MAX_ATTEMPTS', false, 0, record.stage, record.secondaryType);
    }
    const remainingAttempts = Math.max(0, cfg.maxAttempts - attempts);

    if (!record.answer) return deny('MISSING_ANSWER', remainingAttempts > 0, remainingAttempts, record.stage, record.secondaryType);

    const answer = meta.answer ?? {};
    let correct = false;
    if (record.secondaryType === 'rotate') {
      const angle = Number(answer.angle);
      if (!Number.isFinite(angle)) return deny('MISSING_ANSWER', remainingAttempts > 0, remainingAttempts, record.stage, record.secondaryType);
      const expected = Number(record.answer.angle ?? 0);
      correct = angleDelta(expected + angle, 0) <= ROTATE_TOLERANCE_DEG;
    } else {
      const x = Number(answer.x);
      if (!Number.isFinite(x)) return deny('MISSING_ANSWER', remainingAttempts > 0, remainingAttempts, record.stage, record.secondaryType);
      const expected = Number(record.answer.x ?? -1);
      correct = Math.abs(x - expected) <= SLIDER_TOLERANCE_PX;
    }

    if (!correct) return deny('ANSWER_MISMATCH', remainingAttempts > 0, remainingAttempts, record.stage, record.secondaryType);

    await this.store.deleteChallenge(record.challengeId).catch(() => { /* ignore */ });
    const issued = await this.issueToken(cfg, record.challengeId, b, 'secondary', record.tenantId);
    await this.safeAudit({
      eventType: SecurityEventType.CAPTCHA_SECONDARY_PASSED,
      challengeId: record.challengeId,
      stage: 'secondary',
      secondaryType: record.secondaryType,
      tenantId,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      clientIp: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
      route: meta.route,
      method: meta.method,
    });
    return { passed: true, captchaToken: issued.captchaToken, expiresAt: issued.expiresAt };
  }

  // ---------- 签发 / 消费 captchaToken ----------

  private async issueToken(
    cfg: CaptchaRuntimeConfig,
    challengeId: string,
    b: CaptchaBindings,
    stage: CaptchaStage,
    tenantId: string,
  ): Promise<{ captchaToken: string; expiresAt: number }> {
    const now = this.now();
    const expiresAt = now + cfg.tokenTtlSeconds * 1000;
    const payload: CaptchaTokenPayload = { v: 1, c: challengeId, t: tenantId, e: Math.floor(expiresAt / 1000) };
    const token = signCaptchaToken(payload, this.secret);
    const record: CaptchaTokenRecord = {
      challengeId,
      tenantId,
      domainHash: b.domainHash,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      uaHash: b.uaHash,
      stage,
      issuedAt: now,
      expiresAt,
    };
    // 只保存 Token hash
    await this.store.saveToken(captchaTokenHash(token), record, cfg.tokenTtlSeconds);
    return { captchaToken: token, expiresAt };
  }

  /**
   * 登录接口消费 captchaToken。
   * 通过后才允许继续检查用户名 / 密码；所有失败路径都会抛出明确的业务错误码。
   */
  async consumeLoginToken(meta: CaptchaRequestMeta & { captchaToken?: string }): Promise<{ required: boolean; stage?: CaptchaStage }> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');
    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    if (!this.active(cfg)) return { required: false };

    const b = this.bindings(meta, tenantId);
    const token = (meta.captchaToken ?? '').trim();
    if (!token) throw new CaptchaRequiredError();

    const parsed = parseCaptchaToken(token, this.secret);
    if (!parsed.ok) {
      await this.tokenAudit(SecurityEventType.CAPTCHA_TOKEN_INVALID, 'SIGNATURE_INVALID', tenantId, b, meta);
      throw new CaptchaInvalidError();
    }

    const consumed = await this.store.consumeToken(captchaTokenHash(token), cfg.tokenTtlSeconds + 300);
    if (consumed.status === 'replayed') {
      await this.tokenAudit(SecurityEventType.CAPTCHA_TOKEN_REPLAYED, 'ALREADY_CONSUMED', tenantId, b, meta);
      throw new CaptchaReplayedError();
    }
    if (consumed.status === 'expired' || !consumed.record) {
      await this.tokenAudit(SecurityEventType.CAPTCHA_TOKEN_INVALID, 'EXPIRED', tenantId, b, meta);
      throw new CaptchaExpiredError();
    }

    const rec = consumed.record;
    const mismatch =
      !safeEqual(rec.tenantId, tenantId)
      || !safeEqual(rec.domainHash, b.domainHash)
      || !safeEqual(rec.usernameHash, b.usernameHash)
      || !safeEqual(rec.ipHash, b.ipHash)
      || !safeEqual(rec.uaHash, b.uaHash)
      || !safeEqual(rec.challengeId, parsed.payload.c);
    if (mismatch) {
      await this.tokenAudit(SecurityEventType.CAPTCHA_TOKEN_INVALID, 'BINDING_MISMATCH', tenantId, b, meta);
      throw new CaptchaInvalidError();
    }

    return { required: true, stage: rec.stage };
  }

  private tokenAudit(
    eventType: SecurityEventType,
    reason: string,
    tenantId: string,
    b: CaptchaBindings,
    meta: CaptchaRequestMeta,
  ): Promise<void> {
    return this.safeAudit({
      eventType,
      reason,
      tenantId,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      clientIp: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
      route: meta.route,
      method: meta.method,
    });
  }

  // ---------- 登录失败计数（用于 forceAfterFailures） ----------

  async recordLoginFailure(meta: CaptchaRequestMeta): Promise<void> {
    try {
      const tenantId = await this.resolveTenantSafe(meta.domainName);
      if (!tenantId) return;
      const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
      if (!this.active(cfg)) return;
      const b = this.bindings(meta, tenantId);
      await this.store.recordAccountFailure(tenantId, b.usernameHash, FAILURE_WINDOW_SECONDS);
      await this.store.recordIpFailure(b.ipHash, FAILURE_WINDOW_SECONDS);
    } catch (err) {
      logger.warn('[captcha] record login failure skipped', { error: String(err) });
    }
  }

  /** 登录成功 → 清零「连续登录失败」计数 */
  async resetLoginFailures(meta: CaptchaRequestMeta): Promise<void> {
    try {
      const tenantId = await this.resolveTenantSafe(meta.domainName);
      if (!tenantId) return;
      const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
      if (!this.active(cfg)) return;
      const b = this.bindings(meta, tenantId);
      await this.store.resetAccountFailures(tenantId, b.usernameHash);
    } catch (err) {
      logger.warn('[captcha] reset login failures skipped', { error: String(err) });
    }
  }

  // ---------- 内部工具 ----------

  private async safeAudit(input: CaptchaAuditInput): Promise<void> {
    try {
      await this.audit(input as unknown as SecurityLogInput);
    } catch (err) {
      logger.warn('[captcha] audit write failed', { error: String(err) });
    }
  }

  /** Redis key 命名空间（供文档 / 排障使用） */
  static readonly key = CAPTCHA_KEY;
}

export const captchaService = new CaptchaService();
