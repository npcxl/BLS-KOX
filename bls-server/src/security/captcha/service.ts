/**
 * 登录人机验证服务（ALTCHA）
 *
 * 流程：
 *   GET  /api/auth/captcha/config     → 公开配置 + 本轮应使用的 ALTCHA 组件形态（invisible / visible）
 *   GET  /api/auth/captcha/challenge  → 官方 ALTCHA challenge（widget 直接消费，原样返回）
 *   POST /api/auth/captcha/verify     → 服务端校验 ALTCHA payload → 签发一次性 captchaToken
 *   POST /api/auth/login              → 先消费 captchaToken，再校验用户名 / 密码
 *
 * 方案约束（用户要求）：
 *   - 禁止自研滑块、图片裁切、轨迹识别、验证码算法 —— 全部交给官方 `altcha/lib`；
 *   - challenge 与 payload 必须在**服务端**校验（HMAC 签名 + PoW 重算），不信任前端回调；
 *   - 不采集鼠标轨迹、不做浏览器指纹识别（只用 IP / UA 头 / 安全事件中心聚合风险）；
 *   - captchaToken 只存 hash、一次性消费、绑定域名 / username / IP / UA；
 *   - Redis 不可用 → 生产环境 fail closed（503 CAPTCHA_SERVICE_UNAVAILABLE）。
 */
import { randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { getDynamicConfig, type DynamicConfig } from '../../config/dynamic-config';
import {
  CaptchaExpiredError,
  CaptchaInvalidError,
  CaptchaReplayedError,
  CaptchaRequiredError,
  CaptchaUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors';
import { logger } from '../../core/logger';
import { RiskLevel, SecurityEventType, writeSecurityLog, type SecurityLogInput } from '../../core/security-audit';
import { queryOne } from '../../core/database';
import { findTenantByDomain, findTenantById } from '../../services/tenant-lifecycle';
import { PLATFORM_TENANT_ID } from '../../shared/constants/tenant';
import { CAPTCHA_KEY, CaptchaStore, captchaStore } from './store';
import { isCaptchaActive, isProviderUsable, loadCaptchaConfig, publicConfig, type CaptchaRuntimeConfig } from './config';
import { captchaTokenHash, safeEqual, sha256Hex } from './crypto-utils';
import { createDefaultRiskProvider, evaluateCaptchaPolicy, uaLooksAutomated, type IpRisk, type RiskProvider } from './policy';
import { classifyAltchaFailure, createAltchaChallenge, decodeAltchaPayload, verifyAltchaPayload } from './altcha';
import {
  CAPTCHA_CHALLENGE_URL,
  CAPTCHA_FIELD_NAME,
  FAILURE_WINDOW_SECONDS,
  type CaptchaFailureReason,
  type CaptchaPublicConfig,
  type CaptchaStage,
  type CaptchaTokenRecord,
  type CaptchaVerifyResult,
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
  /** ALTCHA HMAC 密钥 */
  hmacKey?: string;
  /** provider=tianai 时的独立服务地址 */
  tianaiBaseUrl?: string;
  /** Proof-of-Work 难度（PBKDF2 迭代次数），默认取 env.captcha.cost */
  cost?: number;
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

export interface CaptchaBindings {
  tenantId: string;
  domainHash: string;
  usernameHash: string;
  ipHash: string;
  uaHash: string;
}

/** 审计只允许这几个字段 */
interface CaptchaAuditInput {
  eventType: SecurityEventType;
  riskLevel?: RiskLevel;
  stage?: CaptchaStage;
  provider?: string;
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

const AUDIT_TITLES: Record<string, string> = {
  CAPTCHA_POW_PASSED: 'ALTCHA 静默验证通过',
  CAPTCHA_POW_FAILED: 'ALTCHA 静默验证失败',
  CAPTCHA_VISIBLE_REQUIRED: '要求可见人机验证',
  CAPTCHA_VISIBLE_PASSED: 'ALTCHA 可见验证通过',
  CAPTCHA_VISIBLE_FAILED: 'ALTCHA 可见验证失败',
  CAPTCHA_TOKEN_INVALID: '人机验证凭证无效',
  CAPTCHA_TOKEN_REPLAYED: '人机验证凭证重放',
  CAPTCHA_SERVICE_UNAVAILABLE: '人机验证服务不可用',
};

function defaultAudit(input: CaptchaAuditInput): Promise<void> {
  return writeSecurityLog({
    eventType: input.eventType,
    riskLevel: input.riskLevel,
    title: AUDIT_TITLES[input.eventType] ?? input.eventType,
    // 只保存允许的字段：阶段 / provider / 失败原因 / tenantId / usernameHash / IP hash / requestId
    detail: {
      stage: input.stage ?? null,
      provider: input.provider ?? null,
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

/** 平台超级管理员：is_admin=1 */
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

/** ALTCHA challenge 一次性重试次数 */
const CHALLENGE_CLAIM_ATTEMPTS = 3;

// ==================== 服务 ====================

export class CaptchaService {
  private store: CaptchaStore;
  private getConfigFn: GetConfigFn;
  private risk: RiskProvider;
  private now: () => number;
  private audit: (input: SecurityLogInput) => Promise<void>;
  private resolveTenant: (domainName: string) => Promise<string | null>;
  private isPrivilegedAccount: (tenantId: string, username: string) => Promise<boolean>;
  private hmacKey: string;
  private tianaiBaseUrl: string;
  private cost: number;

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
    this.hmacKey = deps.hmacKey ?? env.captcha.hmacKey;
    this.tianaiBaseUrl = deps.tianaiBaseUrl ?? env.captcha.tianaiUrl;
    this.cost = deps.cost ?? env.captcha.cost;
    this.devBypass = deps.devBypass ?? env.captcha.devBypass;
  }

  /** 动态配置 + 注入的密钥 / 难度 → 运行时配置 */
  private async loadCfg(tenantId: string): Promise<CaptchaRuntimeConfig> {
    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    return { ...cfg, hmacKey: this.hmacKey, tianaiBaseUrl: this.tianaiBaseUrl, cost: this.cost };
  }

  // ---------- 内部工具 ----------

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

  /** 采集策略输入（并行，任一失败都降级为安全默认值） */
  private async policyInputs(b: CaptchaBindings, cfg: CaptchaRuntimeConfig, meta: CaptchaRequestMeta) {
    const [accountFailures, ipAccountCount, ipRisk, rateLimitPressure, privileged] = await Promise.all([
      this.store.getAccountFailures(b.tenantId, b.usernameHash).catch(() => 0),
      this.store.getIpAccountCount(b.ipHash).catch(() => 0),
      this.risk.getIpRisk(meta.ip).catch((): IpRisk => ({ score: 0, level: RiskLevel.LOW })),
      this.store.getRateLimitPressure(meta.ip).catch(() => 0),
      this.isPrivilegedAccount(b.tenantId, meta.username).catch(() => false),
    ]);
    return evaluateCaptchaPolicy({
      mode: cfg.mode,
      forceAfterFailures: cfg.forceAfterFailures,
      accountFailures,
      ipAccountCount,
      ipRiskScore: ipRisk.score,
      ipRiskLevel: ipRisk.level,
      rateLimitPressure,
      privilegedAccount: privileged,
      deviceAnomalous: uaLooksAutomated(meta.userAgent),
    });
  }

  // ---------- 公开配置 ----------

  /**
   * 公开配置 + 本轮应使用的 ALTCHA 组件形态。
   * `display=visible` 时说明命中策略（连续登录失败 / 高风险 / 超管 / mode=always），
   * 前端据此把 widget 从 `display="invisible"` 切成 `display="standard"`。
   */
  async getPublicConfig(meta: CaptchaRequestMeta): Promise<CaptchaPublicConfig> {
    const base: CaptchaPublicConfig = {
      enabled: false,
      mode: 'off',
      provider: 'altcha',
      display: 'invisible',
      challengeUrl: CAPTCHA_CHALLENGE_URL,
      fieldName: CAPTCHA_FIELD_NAME,
    };
    if (this.devBypass) return base;

    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) return base;

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) return base;

    const b = this.bindings(meta, tenantId);
    const decision = await this.policyInputs(b, cfg, meta);

    return {
      ...publicConfig(cfg),
      display: decision.display,
      ...(decision.reason ? { reason: decision.reason } : {}),
      challengeUrl: CAPTCHA_CHALLENGE_URL,
      fieldName: CAPTCHA_FIELD_NAME,
    };
  }

  // ---------- challenge ----------

  /**
   * 生成一次性 ALTCHA challenge（官方结构原样返回，供 widget `challenge` 属性直接消费）。
   * 返回对象**不带** `{code,message,data}` 外层封装 —— 与官方 widget 的约定一致。
   */
  async createChallenge(meta: CaptchaRequestMeta): Promise<Record<string, unknown>> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) throw new ValidationError('登录人机验证未开启');
    if (!isProviderUsable({ ...cfg, tianaiBaseUrl: this.tianaiBaseUrl })) {
      throw new CaptchaUnavailableError('人机验证服务未配置');
    }

    const b = this.bindings(meta, tenantId);
    try {
      await this.store.recordIpAccount(b.ipHash, b.usernameHash, FAILURE_WINDOW_SECONDS);
    } catch { /* 风险信号失败不阻断主流程 */ }

    const decision = await this.policyInputs(b, cfg, meta);

    if (cfg.provider === 'tianai') {
      return this.tianaiChallenge(decision.display);
    }

    // ALTCHA：display 与绑定信息写入被 HMAC 签名的 parameters.data，客户端无法篡改
    for (let attempt = 0; attempt < CHALLENGE_CLAIM_ATTEMPTS; attempt++) {
      const challenge = await createAltchaChallenge({
        hmacKey: this.hmacKey,
        ttlSeconds: cfg.challengeTtlSeconds,
        cost: cfg.cost,
        data: { tenantId, usernameHash: meta.username ? b.usernameHash : '', display: decision.display },
      });
      const nonce = String(challenge.parameters?.nonce ?? '');
      if (!nonce) continue;
      const claimed = await this.store.claimChallengeNonce(nonce, cfg.challengeTtlSeconds);
      if (claimed) return challenge as unknown as Record<string, unknown>;
    }
    throw new CaptchaUnavailableError('生成人机验证挑战失败，请稍后重试');
  }

  // ---------- verify ----------

  /**
   * 服务端校验 ALTCHA payload 并签发一次性 captchaToken。
   * 校验顺序：payload 结构 → challenge 一次性 → 官方 PoW/签名 → 策略（是否需要可见交互）→ 签发。
   */
  async verifyPayload(meta: CaptchaRequestMeta & { payload?: unknown; stage?: CaptchaStage }): Promise<CaptchaVerifyResult> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) throw new ValidationError('登录人机验证未开启');
    if (!isProviderUsable({ ...cfg, tianaiBaseUrl: this.tianaiBaseUrl })) {
      throw new CaptchaUnavailableError('人机验证服务未配置');
    }

    const b = this.bindings(meta, tenantId);
    const stage: CaptchaStage = meta.stage === 'visible' ? 'visible' : 'invisible';

    const deny = async (reason: CaptchaFailureReason, eventType: SecurityEventType, extra?: { requireVisible?: boolean }): Promise<CaptchaVerifyResult> => {
      await this.safeAudit({
        eventType,
        stage,
        provider: cfg.provider,
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
      return { passed: false, reason, ...(extra?.requireVisible ? { requireVisible: true } : {}) };
    };

    if (cfg.provider === 'tianai') {
      const ok = await this.tianaiVerify(meta.payload);
      if (!ok) return deny('SOLUTION_INVALID', SecurityEventType.CAPTCHA_POW_FAILED);
      const issued = await this.issueToken(cfg, b, stage, tenantId);
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_POW_PASSED, stage, provider: cfg.provider,
        tenantId, usernameHash: b.usernameHash, ipHash: b.ipHash, clientIp: meta.ip,
        userAgent: meta.userAgent, requestId: meta.requestId, route: meta.route, method: meta.method,
      });
      return { passed: true, captchaToken: issued.captchaToken, expiresAt: issued.expiresAt };
    }

    // ---- ALTCHA ----
    if (meta.payload === undefined || meta.payload === null || meta.payload === '') {
      return deny('PAYLOAD_MISSING', SecurityEventType.CAPTCHA_POW_FAILED);
    }
    const payload = decodeAltchaPayload(meta.payload);
    if (!payload) return deny('PAYLOAD_MALFORMED', SecurityEventType.CAPTCHA_POW_FAILED);

    // 绑定校验（challenge 由本服务签发，data 在 HMAC 签名内，客户端无法伪造）
    const data = (payload.challenge.parameters.data ?? {}) as Record<string, unknown>;
    const boundTenant = String(data.tenantId ?? '');
    const boundUsernameHash = String(data.usernameHash ?? '');
    if (!safeEqual(boundTenant, tenantId)) {
      return deny('BINDING_MISMATCH', SecurityEventType.CAPTCHA_POW_FAILED);
    }
    if (boundUsernameHash && !safeEqual(boundUsernameHash, b.usernameHash)) {
      return deny('BINDING_MISMATCH', SecurityEventType.CAPTCHA_POW_FAILED);
    }

    // challenge 一次性（官方要求：每个 challenge 只能使用一次）
    const nonce = String(payload.challenge.parameters.nonce ?? '');
    if (!nonce) return deny('PAYLOAD_MALFORMED', SecurityEventType.CAPTCHA_POW_FAILED);

    // 策略复核：challenge 领取时可能还没带上 username，这里以**当前请求**重新评估。
    // 策略要求可见交互时，invisible 提交一律拒绝（消耗 challenge 之前就拦下，避免白烧一次挑战）。
    const decision = await this.policyInputs(b, cfg, meta);
    const challengeDisplay = String(data.display ?? 'invisible');
    if (stage === 'invisible' && (decision.display === 'visible' || challengeDisplay === 'visible')) {
      return deny('VISIBLE_REQUIRED', SecurityEventType.CAPTCHA_VISIBLE_REQUIRED, { requireVisible: true });
    }

    const consumed = await this.store.consumeChallengeNonce(nonce);
    if (!consumed) return deny('CHALLENGE_EXPIRED', SecurityEventType.CAPTCHA_POW_FAILED);

    // 官方库校验：过期 → 签名 → PoW
    const outcome = await verifyAltchaPayload({ payload, hmacKey: this.hmacKey });
    if (!outcome.ok) {
      const reason: CaptchaFailureReason = outcome.error === 'ALGORITHM_UNSUPPORTED' ? 'ALGORITHM_UNSUPPORTED' : 'PAYLOAD_MALFORMED';
      return deny(reason, SecurityEventType.CAPTCHA_POW_FAILED);
    }
    const failure = classifyAltchaFailure(outcome.result);
    if (failure) return deny(failure, SecurityEventType.CAPTCHA_POW_FAILED);

    const issued = await this.issueToken(cfg, b, stage, tenantId);
    await this.safeAudit({
      eventType: stage === 'visible' ? SecurityEventType.CAPTCHA_VISIBLE_PASSED : SecurityEventType.CAPTCHA_POW_PASSED,
      stage,
      provider: cfg.provider,
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
    b: CaptchaBindings,
    stage: CaptchaStage,
    tenantId: string,
  ): Promise<{ captchaToken: string; expiresAt: number }> {
    const now = this.now();
    const expiresAt = now + cfg.tokenTtlSeconds * 1000;
    // 纯随机 Token（32 字节），Redis 只保存 sha256
    const token = randomBytes(32).toString('base64url');
    const record: CaptchaTokenRecord = {
      provider: cfg.provider,
      tenantId,
      domainHash: b.domainHash,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      uaHash: b.uaHash,
      stage,
      issuedAt: now,
      expiresAt,
    };
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

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) return { required: false };
    if (!isProviderUsable({ ...cfg, tianaiBaseUrl: this.tianaiBaseUrl })) {
      throw new CaptchaUnavailableError('人机验证服务未配置');
    }

    const b = this.bindings(meta, tenantId);
    const token = (meta.captchaToken ?? '').trim();
    if (!token) throw new CaptchaRequiredError();

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
      || !safeEqual(rec.uaHash, b.uaHash);
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

  // ---------- 登录失败计数 ----------

  async recordLoginFailure(meta: CaptchaRequestMeta): Promise<void> {
    try {
      const tenantId = await this.resolveTenantSafe(meta.domainName);
      if (!tenantId) return;
      const cfg = await this.loadCfg(tenantId);
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
      const cfg = await this.loadCfg(tenantId);
      if (!this.active(cfg)) return;
      const b = this.bindings(meta, tenantId);
      await this.store.resetAccountFailures(tenantId, b.usernameHash);
    } catch (err) {
      logger.warn('[captcha] reset login failures skipped', { error: String(err) });
    }
  }

  // ---------- provider: tianai（可选，独立服务代理） ----------

  /** 代理 Tianai CAPTCHA 的 challenge 获取（Koa 不参与算法实现）。 */
  private async tianaiChallenge(display: CaptchaStage): Promise<Record<string, unknown>> {
    const url = `${this.tianaiBaseUrl.replace(/\/+$/, '')}/gen?type=blockPuzzle&display=${display}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      logger.error('[captcha] tianai challenge failed', { error: String(err) });
      throw new CaptchaUnavailableError();
    }
  }

  /** 代理 Tianai CAPTCHA 的校验（Koa 只做转发 + 签发内部 captchaToken）。 */
  private async tianaiVerify(payload: unknown): Promise<boolean> {
    if (!payload || typeof payload !== 'object') return false;
    const url = `${this.tianaiBaseUrl.replace(/\/+$/, '')}/check`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return false;
      const data: any = await res.json();
      return data?.valid === true || data?.data === true;
    } catch (err) {
      logger.error('[captcha] tianai verify failed', { error: String(err) });
      throw new CaptchaUnavailableError();
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
