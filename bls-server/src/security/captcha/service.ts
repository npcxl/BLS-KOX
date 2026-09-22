/**
 * 登录人机验证服务（Provider 抽象 + 统一 Ticket）
 *
 *   GET  /api/captcha/config      公开配置（Koa 端点 + 提供方 + 是否启用 TIANAI）
 *   POST /api/captcha/generate    统一生成入口（Koa 内部代理 ALTCHA / TIANAI）
 *   POST /api/captcha/verify      统一校验入口 → 通过则由 Koa 签发一次性 captchaTicket
 *   POST /api/auth/login          只认 captchaTicket（GETDEL 原子消费，一次性）
 *
 * 设计不变量：
 *   1. **登录接口不依赖任何 provider 的验证结果** —— 只认 Koa 签发的 ticket；
 *   2. **技术故障 ≠ 用户验证失败**：上游不可达/超时/异常 → TECHNICAL_ERROR / requireFallback，
 *      绝不返回 failed（否则会误封正常用户）；
 *   3. 阶段与提供方由服务端决定：ALTCHA 的签名数据是唯一可信来源，客户端传的 stage/provider 只
 *      用于表达"想请求哪个 provider"；
 *   4. 风控命中（连续失败 / IP 多账号 / IP 高风险 / 限流压力 / 超管 / UA 异常）→ 要求 TIANAI；
 *      `captcha_tianai_enabled=false` 时仍记录内部原因，但不升级（第一层 PoW 依旧强制）；
 *   5. `captcha_tianai_enabled=true` 时**必须真的跑得起来**：TIANAI_BASE_URL 缺失、健康检查失败、
 *      上游超时都 fail closed（50302），**绝不**静默降级成「只做 ALTCHA 就放行」；
 *   6. 第二层**不能由客户端主动索要**：`/generate?provider=TIANAI` 必须先原子消费服务端在
 *      风控升级时签发的一次性 escalation grant，避免公开接口被用来刷昂贵的图片资源；
 *   7. Redis 不可用 → fail closed（TECHNICAL_ERROR）。
 */
import { env } from '../../config/env';
import { getDynamicConfig, type DynamicConfig } from '../../config/dynamic-config';
import {
  CaptchaExpiredError,
  CaptchaInvalidError,
  CaptchaReplayedError,
  CaptchaRequiredError,
  CaptchaTechnicalError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors';
import { logger } from '../../core/logger';
import { RiskLevel, SecurityEventType, writeSecurityLog, type SecurityLogInput } from '../../core/security-audit';
import { queryOne } from '../../core/database';
import { findTenantByDomain, findTenantById } from '../../services/tenant-lifecycle';
import { PLATFORM_TENANT_ID } from '../../shared/constants/tenant';
import { CAPTCHA_KEY, CaptchaStore, captchaStore } from './store';
import {
  isCaptchaActive,
  isTianaiConfigured,
  isTianaiRequested,
  loadCaptchaConfig,
  type CaptchaRuntimeConfig,
} from './config';
import { safeEqual, sha256Hex } from './crypto-utils';
import { createDefaultRiskProvider, evaluateCaptchaPolicy, uaLooksAutomated, type IpRisk, type RiskProvider } from './policy';
import { AltchaProvider, challengeNonceOf } from './providers/altcha-provider';
import { TianaiProvider, newTianaiSessionId, type TianaiTechnicalError } from './providers/tianai-provider';
import type { CaptchaProviderAdapter, CaptchaProviderName, CaptchaScene } from './providers/types';
import { captchaTicketService, type CaptchaTicketService } from './ticket-service';
import { randomBytes } from 'node:crypto';
import {
  CAPTCHA_FIELD_NAME,
  CAPTCHA_GENERATE_URL,
  CAPTCHA_VERIFY_URL,
  ESCALATION_GRANT_MAX_TTL_SECONDS,
  FAILURE_WINDOW_SECONDS,
  SECONDARY_REQUIRED_MESSAGE,
  type CaptchaEscalationGrantRecord,
  type CaptchaFailureReason,
  type CaptchaGenerateResult,
  type CaptchaPublicConfig,
  type CaptchaSecondarySessionRecord,
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
  /** ALTCHA adapter */
  altchaProvider?: CaptchaProviderAdapter;
  /** TIANAI adapter */
  tianaiProvider?: CaptchaProviderAdapter & { healthCheck?: () => Promise<boolean> };
  /** ticket 服务（默认共享实例） */
  ticketService?: CaptchaTicketService;
  hmacKey?: string;
  tianaiBaseUrl?: string;
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
  usernameHash: string;
  ipHash: string;
  uaHash: string;
}

/** 审计只允许这几个字段 */
interface CaptchaAuditInput {
  eventType: SecurityEventType;
  riskLevel?: RiskLevel;
  provider?: string;
  secondaryType?: string;
  scene?: string;
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
  CAPTCHA_POW_PASSED: '第一层（ALTCHA）验证通过',
  CAPTCHA_POW_FAILED: '第一层（ALTCHA）验证失败',
  CAPTCHA_SECONDARY_REQUIRED: '要求第二层（TIANAI）验证（本次未签发凭证）',
  CAPTCHA_RISK_NOTED: '风控命中但未启用第二层（仅记录，本次结果不受影响）',
  CAPTCHA_SECONDARY_PASSED: '第二层（TIANAI）验证通过',
  CAPTCHA_SECONDARY_FAILED: '第二层（TIANAI）验证失败',
  CAPTCHA_TOKEN_INVALID: 'captchaTicket 无效',
  CAPTCHA_TOKEN_REPLAYED: 'captchaTicket 重放',
  CAPTCHA_SERVICE_UNAVAILABLE: '人机验证服务不可用/技术故障',
};

function defaultAudit(input: CaptchaAuditInput): Promise<void> {
  return writeSecurityLog({
    eventType: input.eventType,
    riskLevel: input.riskLevel,
    title: AUDIT_TITLES[input.eventType] ?? input.eventType,
    detail: {
      provider: input.provider ?? null,
      scene: input.scene ?? null,
      secondaryType: input.secondaryType ?? null,
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

/** ALTCHA challenge 一次性登记重试次数 */
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
  private altcha: CaptchaProviderAdapter;
  private tianai: CaptchaProviderAdapter & { healthCheck?: () => Promise<boolean> };
  private tickets: CaptchaTicketService;
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
    this.tianaiBaseUrl = (deps.tianaiBaseUrl ?? env.captcha.tianaiUrl ?? '').trim();
    this.cost = deps.cost ?? env.captcha.cost;
    this.devBypass = deps.devBypass ?? env.captcha.devBypass;
    this.tickets = deps.ticketService ?? captchaTicketService;
    this.altcha = deps.altchaProvider
      ?? new AltchaProvider({ hmacKey: this.hmacKey, cost: this.cost, defaultTtlSeconds: 180 });
    this.tianai = deps.tianaiProvider
      ?? new TianaiProvider({ baseUrl: this.tianaiBaseUrl, paths: env.captcha.tianaiPaths });
  }

  // ---------- 内部工具 ----------

  private async loadCfg(tenantId: string): Promise<CaptchaRuntimeConfig> {
    const cfg = await loadCaptchaConfig(tenantId, this.getConfigFn);
    return { ...cfg, hmacKey: this.hmacKey, tianaiBaseUrl: this.tianaiBaseUrl, cost: this.cost };
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
    const username = (meta.username ?? '').trim();
    return {
      tenantId,
      usernameHash: username ? sha256Hex(username.toLowerCase()) : '',
      ipHash: sha256Hex(meta.ip ?? 'unknown'),
      uaHash: sha256Hex(meta.userAgent ?? ''),
    };
  }

  /** 采集策略输入（并行，任一失败降级为安全默认值） */
  private async policyInput(cfg: CaptchaRuntimeConfig, b: CaptchaBindings, meta: CaptchaRequestMeta) {
    const [accountFailures, ipAccountCount, ipRisk, rateLimitPressure, privileged] = await Promise.all([
      b.usernameHash ? this.store.getAccountFailures(b.tenantId, b.usernameHash).catch(() => 0) : Promise.resolve(0),
      this.store.getIpAccountCount(b.ipHash).catch(() => 0),
      this.risk.getIpRisk(meta.ip).catch((): IpRisk => ({ score: 0, level: RiskLevel.LOW })),
      this.store.getRateLimitPressure(meta.ip).catch(() => 0),
      this.isPrivilegedAccount(b.tenantId, meta.username).catch(() => false),
    ]);
    return evaluateCaptchaPolicy({
      // 只看运维是否要求第二层：地址缺失/上游不可用**不**在这里降级，而是在真正需要时 fail closed
      forceSecondary: isTianaiRequested(cfg),
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

  private async safeAudit(input: CaptchaAuditInput): Promise<void> {
    try {
      await this.audit(input as unknown as SecurityLogInput);
    } catch (err) {
      logger.warn('[captcha] audit write failed', { error: String(err) });
    }
  }

  private auditBase(meta: CaptchaRequestMeta, tenantId: string, b: CaptchaBindings) {
    return {
      tenantId,
      usernameHash: b.usernameHash || undefined,
      ipHash: b.ipHash,
      clientIp: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
      route: meta.route,
      method: meta.method,
    };
  }

  private providerOf(cfg: CaptchaRuntimeConfig, requested?: CaptchaProviderName): CaptchaProviderName {
    return requested ?? cfg.primaryProvider;
  }

  private adapterOf(provider: CaptchaProviderName): CaptchaProviderAdapter {
    return provider === 'ALTCHA' ? this.altcha : this.tianai;
  }

  // ---------- 第二层升级凭证（escalation grant） ----------

  /**
   * 签发一次性升级凭证。
   * **只有服务端风控判定需要第二层时才会调用**；凭证在 Redis 中只保存 sha256。
   */
  private async issueEscalationGrant(
    cfg: CaptchaRuntimeConfig,
    scene: CaptchaScene,
    tenantId: string,
    b: CaptchaBindings,
  ): Promise<{ escalationGrant: string; escalationExpiresAt: number }> {
    const grant = randomBytes(32).toString('base64url');
    const ttlSeconds = Math.max(
      30,
      Math.min(cfg.challengeTtlSeconds, ESCALATION_GRANT_MAX_TTL_SECONDS),
    );
    const issuedAt = this.now();
    const record: CaptchaEscalationGrantRecord = {
      scene,
      tenantId,
      usernameHash: b.usernameHash,
      ipHash: b.ipHash,
      uaHash: b.uaHash,
      issuedAt,
      expiresAt: issuedAt + ttlSeconds * 1000,
    };
    await this.store.saveEscalationGrant(sha256Hex(grant), record, ttlSeconds);
    return { escalationGrant: grant, escalationExpiresAt: record.expiresAt };
  }

  /**
   * 原子消费并校验升级凭证。
   * 返回 null 表示「不允许进入第二层」（缺失 / 已消费 / 已过期 / 绑定不一致）。
   */
  private async takeEscalationGrant(
    grant: string,
    scene: CaptchaScene,
    tenantId: string,
    b: CaptchaBindings,
  ): Promise<CaptchaEscalationGrantRecord | null> {
    const value = (grant ?? '').trim();
    if (!value) return null;
    const record = await this.store.consumeEscalationGrant(sha256Hex(value));
    if (!record) return null;
    if (record.expiresAt <= this.now()) return null;
    if (!safeEqual(record.tenantId, tenantId)) return null;
    if (!safeEqual(record.scene, scene)) return null;
    if (record.usernameHash && !safeEqual(record.usernameHash, b.usernameHash)) return null;
    if (!safeEqual(record.ipHash, b.ipHash)) return null;
    if (!safeEqual(record.uaHash, b.uaHash)) return null;
    return record;
  }

  /**
   * 第二层不可用时的统一处理：写审计 + fail closed。
   * 返回（而不是抛出）错误对象，调用方统一写成 `throw await this.secondaryUnavailable(...)`，
   * **绝不**返回「通过」或降级放行。
   */
  private async secondaryUnavailable(
    cfg: CaptchaRuntimeConfig,
    scene: CaptchaScene,
    meta: CaptchaRequestMeta,
    tenantId: string,
    b: CaptchaBindings,
    reason: CaptchaFailureReason,
  ): Promise<CaptchaTechnicalError> {
    await this.safeAudit({
      eventType: SecurityEventType.CAPTCHA_SERVICE_UNAVAILABLE,
      riskLevel: RiskLevel.HIGH,
      provider: cfg.fallbackProvider,
      scene,
      secondaryType: cfg.secondaryType,
      reason,
      ...this.auditBase(meta, tenantId, b),
    });
    return new CaptchaTechnicalError('图形验证码服务不可用，已拒绝本次登录');
  }

  // ---------- 公开配置 ----------

  async getPublicConfig(meta: CaptchaRequestMeta): Promise<CaptchaPublicConfig> {
    const base: CaptchaPublicConfig = {
      enabled: false,
      primaryProvider: 'ALTCHA',
      fallbackProvider: 'TIANAI',
      tianaiEnabled: false,
      generateUrl: CAPTCHA_GENERATE_URL,
      verifyUrl: CAPTCHA_VERIFY_URL,
      fieldName: CAPTCHA_FIELD_NAME,
    };
    if (this.devBypass) return base;

    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) return base;

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) return base;

    return {
      enabled: cfg.enabled,
      primaryProvider: cfg.primaryProvider,
      fallbackProvider: cfg.fallbackProvider,
      tianaiEnabled: cfg.tianaiEnabled,
      generateUrl: CAPTCHA_GENERATE_URL,
      verifyUrl: CAPTCHA_VERIFY_URL,
      fieldName: CAPTCHA_FIELD_NAME,
    };
  }

  // ---------- 统一生成入口 ----------

  /**
   * 生成验证码。
   * - ALTCHA：本地生成官方 challenge，签名内写入 {scene, tenantId, usernameHash, provider}；
   * - TIANAI：**必须先消费服务端签发的 escalation grant**，然后调用 Java 服务生成，
   *   Koa 额外签发一次性 sessionId 并绑定当前请求。
   */
  async generate(
    meta: CaptchaRequestMeta & {
      scene?: CaptchaScene;
      provider?: CaptchaProviderName;
      escalationGrant?: string;
    },
  ): Promise<CaptchaGenerateResult> {
    const scene: CaptchaScene = meta.scene ?? 'LOGIN';
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) throw new ValidationError('登录人机验证未开启');

    const b = this.bindings(meta, tenantId);
    const provider = this.providerOf(cfg, meta.provider);

    // IP 多账号统计：仅使用真实 usernameHash（空值由 store 忽略）
    try {
      await this.store.recordIpAccount(b.ipHash, b.usernameHash, FAILURE_WINDOW_SECONDS);
    } catch { /* 风险信号失败不阻断主流程 */ }

    if (provider === 'TIANAI') {
      // ① 第二层不能被客户端主动索要：先原子消费服务端签发的升级凭证
      const grant = await this.takeEscalationGrant(
        meta.escalationGrant ?? '',
        scene,
        tenantId,
        b,
      );
      if (!grant) {
        await this.safeAudit({
          eventType: SecurityEventType.CAPTCHA_SECONDARY_FAILED,
          riskLevel: RiskLevel.MEDIUM,
          provider,
          scene,
          secondaryType: cfg.secondaryType,
          reason: 'ESCALATION_REQUIRED',
          ...this.auditBase(meta, tenantId, b),
        });
        throw new CaptchaInvalidError('未获得第二层验证授权，请重新完成人机验证');
      }

      // ② 运维要求第二层但服务跑不起来 → fail closed（绝不静默降级为仅 ALTCHA）
      if (!isTianaiConfigured(cfg)) {
        throw await this.secondaryUnavailable(cfg, scene, meta, tenantId, b, 'PROVIDER_UNAVAILABLE');
      }

      const dto = await this.tianai.generate({
        scene,
        username: meta.username,
        secondaryType: cfg.secondaryType,
        ttlSeconds: cfg.challengeTtlSeconds,
      }).catch(async (err) => {
        logger.error('[captcha] tianai generate failed', { error: String(err) });
        throw await this.secondaryUnavailable(cfg, scene, meta, tenantId, b, 'PROVIDER_UNAVAILABLE');
      });

      const upstreamId = String((dto.challenge as any)?.id ?? (dto.challenge as any)?.challengeId ?? '');
      const sessionId = dto.sessionId ?? newTianaiSessionId();
      const record: CaptchaSecondarySessionRecord = {
        sessionId,
        type: cfg.secondaryType,
        upstreamId,
        scene,
        tenantId,
        usernameHash: b.usernameHash,
        ipHash: b.ipHash,
        uaHash: b.uaHash,
        issuedAt: this.now(),
        expiresAt: dto.expiresAt,
      };
      await this.store.saveSecondarySession(record, cfg.challengeTtlSeconds);

      return {
        provider: 'TIANAI',
        challenge: dto.challenge,      // 上游原始字段原样透传
        sessionId,                     // 浏览器只能拿到本地会话 id
        expiresAt: dto.expiresAt,
      };
    }

    // ALTCHA
    for (let attempt = 0; attempt < CHALLENGE_CLAIM_ATTEMPTS; attempt++) {
      const dto = await this.altcha.generate({
        scene,
        username: meta.username,
        ttlSeconds: cfg.challengeTtlSeconds,
        signedData: { scene, tenantId, usernameHash: b.usernameHash, provider: 'ALTCHA' },
      });
      const nonce = challengeNonceOf(dto.challenge);
      if (!nonce) continue;
      const claimed = await this.store.claimChallengeNonce(nonce, cfg.challengeTtlSeconds);
      if (claimed) {
        return {
          provider: 'ALTCHA',
          challenge: dto.challenge,
          expiresAt: dto.expiresAt,
          fieldName: dto.fieldName ?? CAPTCHA_FIELD_NAME,
        };
      }
    }
    throw new CaptchaTechnicalError('生成人机验证挑战失败，请稍后重试');
  }

  // ---------- 统一校验入口 ----------

  /**
   * 校验验证码。通过后由 Koa 签发一次性 captchaTicket。
   *
   * 返回语义：
   *   passed           → 已签发 ticket（登录接口认它）
   *   failed           → 用户没通过（可重试）；`requireFallback=true` 表示需要继续做第二层
   *   technical_error  → 我们自己出问题（上游不可用/超时/Redis 挂）→ 抛 CaptchaTechnicalError
   */
  async verify(
    meta: CaptchaRequestMeta & {
      scene?: CaptchaScene;
      provider?: CaptchaProviderName;
      payload?: unknown;
      sessionId?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<CaptchaVerifyResult> {
    const scene: CaptchaScene = meta.scene ?? 'LOGIN';
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) throw new ValidationError('登录人机验证未开启');

    const b = this.bindings(meta, tenantId);
    // 提供方：显式指定优先；否则按提交内容推断（payload→ALTCHA，sessionId→TIANAI）
    const provider = this.providerOf(
      cfg,
      meta.provider ?? (meta.sessionId ? cfg.fallbackProvider : cfg.primaryProvider),
    );

    const issueTicket = async (p: CaptchaProviderName) => {
      const issued = await this.tickets.issue({
        scene,
        provider: p,
        ttlSeconds: cfg.ticketTtlSeconds,
        tenantId,
        usernameHash: b.usernameHash || undefined,
        ipHash: b.ipHash,
        uaHash: b.uaHash,
      });
      return { captchaTicket: issued.captchaTicket, expiresAt: issued.expiresAt };
    };

    // ==================== TIANAI ====================
    if (provider === 'TIANAI') {
      // 本部署根本没有第二层：客户端不应请求它（旧版本客户端 / 伪造请求）
      if (!isTianaiRequested(cfg)) {
        return { status: 'failed', provider, reason: 'PROVIDER_UNAVAILABLE' };
      }
      // 运维要求第二层但服务跑不起来 → fail closed（绝不降级为「只做 ALTCHA 就放行」）
      if (!isTianaiConfigured(cfg)) {
        throw await this.secondaryUnavailable(cfg, scene, meta, tenantId, b, 'PROVIDER_UNAVAILABLE');
      }

      const sessionId = String(meta.sessionId ?? '').trim();
      if (!sessionId) return { status: 'failed', provider, reason: 'PAYLOAD_MISSING' };

      // 本地一次性会话（GETDEL）：并发提交只有一个能拿到
      const session = await this.store.consumeSecondarySession(sessionId);
      if (!session) {
        await this.safeAudit({
          eventType: SecurityEventType.CAPTCHA_SECONDARY_FAILED,
          provider, scene, reason: 'CHALLENGE_EXPIRED',
          ...this.auditBase(meta, tenantId, b),
        });
        return { status: 'failed', provider, reason: 'CHALLENGE_EXPIRED' };
      }

      const mismatch =
        !safeEqual(session.tenantId, tenantId)
        || !safeEqual(session.scene, scene)
        || (!!session.usernameHash && !safeEqual(session.usernameHash, b.usernameHash))
        || !safeEqual(session.ipHash, b.ipHash)
        || !safeEqual(session.uaHash, b.uaHash);
      if (mismatch) {
        return { status: 'failed', provider, reason: 'BINDING_MISMATCH' };
      }
      if (session.expiresAt <= this.now()) {
        return { status: 'failed', provider, reason: 'CHALLENGE_EXPIRED' };
      }

      const outcome = await this.tianai.verify({
        scene,
        username: meta.username,
        sessionId,
        upstreamId: session.upstreamId,
        data: meta.data,
      });

      if (outcome.status === 'technical_error') {
        // 上游技术故障：fail closed，但**不是**用户失败。
        // 会话已被抢占有两个原因：① 上游 `matching()` 用 getAndRemoveCache，请求一旦发出
        // challenge 即作废；② 我们的会话必须保持一次性（防重放）。
        // 因此这里直接补发一个新的升级凭证，让前端**自动**换一张 challenge，
        // 不需要用户先失败一次再手动刷新。
        await this.safeAudit({
          eventType: SecurityEventType.CAPTCHA_SERVICE_UNAVAILABLE,
          riskLevel: RiskLevel.MEDIUM,
          provider, scene, reason: outcome.technicalReason ?? 'INTERNAL_ERROR',
          ...this.auditBase(meta, tenantId, b),
        });
        try {
          const renewed = await this.issueEscalationGrant(cfg, scene, tenantId, b);
          return {
            status: 'technical_error',
            provider: 'TIANAI',
            reason: outcome.technicalReason ?? 'INTERNAL_ERROR',
            requireFallback: true,
            nextProvider: 'TIANAI',
            ...renewed,
          };
        } catch {
          throw new CaptchaTechnicalError();
        }
      }
      if (outcome.status === 'failed') {
        await this.safeAudit({
          eventType: SecurityEventType.CAPTCHA_SECONDARY_FAILED,
          provider, scene, secondaryType: cfg.secondaryType, reason: outcome.reason ?? 'SOLUTION_INVALID',
          ...this.auditBase(meta, tenantId, b),
        });
        return { status: 'failed', provider, reason: outcome.reason ?? 'SOLUTION_INVALID' };
      }

      const issued = await issueTicket('TIANAI');
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_SECONDARY_PASSED,
        provider, scene, secondaryType: cfg.secondaryType,
        ...this.auditBase(meta, tenantId, b),
      });
      return { status: 'passed', provider, ...issued };
    }

    // ==================== ALTCHA（第一层） ====================
    const outcome = await this.altcha.verify({
      scene,
      username: meta.username,
      payload: meta.payload,
    });

    if (outcome.status === 'technical_error') {
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_SERVICE_UNAVAILABLE,
        riskLevel: RiskLevel.MEDIUM,
        provider: 'ALTCHA', scene, reason: outcome.technicalReason ?? 'INTERNAL_ERROR',
        ...this.auditBase(meta, tenantId, b),
      });
      // 规范：ALTCHA 技术故障**不判为机器人**（也不放行）。
      // 运维启用了第二层 → 转入 TIANAI（服务跑不起来就 fail closed）。
      if (isTianaiRequested(cfg)) {
        if (!isTianaiConfigured(cfg)) {
          throw await this.secondaryUnavailable(cfg, scene, meta, tenantId, b, 'PROVIDER_UNAVAILABLE');
        }
        try {
          const renewed = await this.issueEscalationGrant(cfg, scene, tenantId, b);
          return {
            status: 'technical_error',
            provider: 'ALTCHA',
            reason: outcome.technicalReason ?? 'INTERNAL_ERROR',
            requireFallback: true,
            nextProvider: cfg.fallbackProvider,
            ...renewed,
          };
        } catch {
          throw new CaptchaTechnicalError();
        }
      }
      throw new CaptchaTechnicalError();
    }

    if (outcome.status === 'failed') {
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_POW_FAILED,
        provider: 'ALTCHA', scene, reason: outcome.reason ?? 'SOLUTION_INVALID',
        ...this.auditBase(meta, tenantId, b),
      });
      return { status: 'failed', provider: 'ALTCHA', reason: outcome.reason ?? 'SOLUTION_INVALID' };
    }

    // 验签通过后，签名内的数据才可信（唯一可信的阶段/绑定来源）
    const signed = outcome.signedData ?? {};
    const boundTenant = String(signed.tenantId ?? '');
    const boundUsernameHash = String(signed.usernameHash ?? '');
    const boundScene = String(signed.scene ?? '');
    if (!safeEqual(boundTenant, tenantId)) {
      return { status: 'failed', provider: 'ALTCHA', reason: 'BINDING_MISMATCH' };
    }
    if (boundScene && !safeEqual(boundScene, scene)) {
      return { status: 'failed', provider: 'ALTCHA', reason: 'STAGE_MISMATCH' };
    }
    if (boundUsernameHash && !safeEqual(boundUsernameHash, b.usernameHash)) {
      return { status: 'failed', provider: 'ALTCHA', reason: 'BINDING_MISMATCH' };
    }

    // challenge 一次性：nonce 只能从**解码后的** payload 取（provider 已给出）。
    // ⚠ 不要写成 challengeNonceOf(meta.payload.challenge)：meta.payload 是 base64 字符串，
    //   取 `.challenge` 永远是 undefined，会把「验证通过」误判成 PAYLOAD_MALFORMED。
    const nonce = String(outcome.challengeNonce ?? '');
    if (!nonce) return { status: 'failed', provider: 'ALTCHA', reason: 'PAYLOAD_MALFORMED' };
    const consumed = await this.store.consumeChallengeNonce(nonce);
    if (!consumed) {
      return { status: 'failed', provider: 'ALTCHA', reason: 'CHALLENGE_EXPIRED' };
    }

    // 风控复核（用当前请求的账号重新评估）
    const decision = await this.policyInput(cfg, b, meta);
    if (decision.requireSecondary) {
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_SECONDARY_REQUIRED,
        provider: cfg.fallbackProvider,
        scene,
        secondaryType: cfg.secondaryType,
        reason: decision.reason,
        ...this.auditBase(meta, tenantId, b),
      });
      // 风控要求第二层 → 必须真的能完成第二层，否则 fail closed（不许降级放行）
      if (!isTianaiConfigured(cfg)) {
        throw await this.secondaryUnavailable(cfg, scene, meta, tenantId, b, 'PROVIDER_UNAVAILABLE');
      }
      let renewed: { escalationGrant: string; escalationExpiresAt: number };
      try {
        renewed = await this.issueEscalationGrant(cfg, scene, tenantId, b);
      } catch {
        throw new CaptchaTechnicalError();
      }
      return {
        status: 'failed',
        provider: 'ALTCHA',
        reason: 'SECONDARY_REQUIRED',
        requireFallback: true,
        nextProvider: cfg.fallbackProvider,
        ...renewed,
      };
    }
    if (decision.reason) {
      // 未启用 TIANAI（或本次无需升级）但风控命中：内部原因只写审计，不阻断登录。
      // ⚠ 必须用 CAPTCHA_RISK_NOTED 而不是 CAPTCHA_SECONDARY_REQUIRED：
      //   后者意味着"真的要求第二层、本次不发票证"，两者混用会让审计日志出现
      //   同一请求既"要求第二层"又"第一层通过"的自相矛盾记录。
      await this.safeAudit({
        eventType: SecurityEventType.CAPTCHA_RISK_NOTED,
        riskLevel: RiskLevel.LOW,
        provider: cfg.fallbackProvider,
        scene,
        secondaryType: cfg.secondaryType,
        reason: decision.reason,
        ...this.auditBase(meta, tenantId, b),
      });
    }

    const issued = await issueTicket('ALTCHA');
    await this.safeAudit({
      eventType: SecurityEventType.CAPTCHA_POW_PASSED,
      provider: 'ALTCHA', scene,
      ...this.auditBase(meta, tenantId, b),
    });
    return { status: 'passed', provider: 'ALTCHA', ...issued };
  }

  // ---------- 登录：消费 ticket ----------

  /**
   * 登录接口唯一依赖的校验：GETDEL 原子消费 captchaTicket。
   * 校验：存在 / verified=true / scene=LOGIN / 未过期（TTL 由 Redis 保证）/ 绑定一致。
   */
  async consumeLoginTicket(
    meta: CaptchaRequestMeta & { captchaTicket?: string },
  ): Promise<{ required: boolean; provider?: CaptchaProviderName }> {
    const tenantId = await this.resolveTenantSafe(meta.domainName);
    if (!tenantId) throw new UnauthorizedError('当前域名未绑定租户');

    const cfg = await this.loadCfg(tenantId);
    if (!this.active(cfg)) return { required: false };

    const b = this.bindings(meta, tenantId);
    const ticket = (meta.captchaTicket ?? '').trim();
    if (!ticket) throw new CaptchaRequiredError();

    const result = await this.tickets.consume({
      ticket,
      scene: 'LOGIN',
      tenantId,
      usernameHash: b.usernameHash || undefined,
      ipHash: b.ipHash,
      uaHash: b.uaHash,
    });

    if (!result.ok) {
      const reason = result.reason;
      if (reason === 'REPLAYED') {
        await this.ticketAudit(SecurityEventType.CAPTCHA_TOKEN_REPLAYED, 'REPLAYED', tenantId, b, meta);
        throw new CaptchaReplayedError();
      }
      if (reason === 'NOT_FOUND') {
        await this.ticketAudit(SecurityEventType.CAPTCHA_TOKEN_INVALID, 'EXPIRED_OR_UNKNOWN', tenantId, b, meta);
        throw new CaptchaExpiredError();
      }
      if (reason === 'NOT_VERIFIED' || reason === 'SCENE_MISMATCH') {
        await this.ticketAudit(SecurityEventType.CAPTCHA_TOKEN_INVALID, reason, tenantId, b, meta);
        // 场景不对不是"过期"，按无效处理
        throw new CaptchaInvalidError();
      }
      await this.ticketAudit(SecurityEventType.CAPTCHA_TOKEN_INVALID, reason, tenantId, b, meta);
      throw new CaptchaInvalidError();
    }

    return { required: true, provider: result.payload.provider };
  }

  private ticketAudit(
    eventType: SecurityEventType,
    reason: string,
    tenantId: string,
    b: CaptchaBindings,
    meta: CaptchaRequestMeta,
  ): Promise<void> {
    return this.safeAudit({
      eventType,
      reason,
      ...this.auditBase(meta, tenantId, b),
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
      if (!b.usernameHash) return;
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
      if (!b.usernameHash) return;
      await this.store.resetAccountFailures(tenantId, b.usernameHash);
    } catch (err) {
      logger.warn('[captcha] reset login failures skipped', { error: String(err) });
    }
  }

  /**
   * 排障辅助：TIANAI 健康检查（供系统参数保存前预检复用）。
   * 未配置内网地址时直接 false —— 与 `TianaiProvider.healthCheck()` 的语义保持一致，
   * 避免注入替身（或未来更换 adapter）时出现「未配置却报健康」的假阳性。
   */
  async tianaiHealthy(): Promise<boolean> {
    if (!this.tianaiBaseUrl) return false;
    if (typeof this.tianai.healthCheck === 'function') return this.tianai.healthCheck();
    return false;
  }

  /** Redis key 命名空间（供文档 / 排障使用） */
  static readonly key = CAPTCHA_KEY;
}

export const captchaService = new CaptchaService();
