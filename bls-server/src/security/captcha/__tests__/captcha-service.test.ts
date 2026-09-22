/**
 * 登录人机验证（两级架构 + 统一 captchaTicket）—— 服务端行为与安全语义测试
 *
 * 覆盖要求：
 *   1  配置关闭 / 开启
 *   2  ALTCHA 成功 / 失败 / 过期 / 重放 / 绑定不匹配
 *   3  风控升级 Tianai（必须拿到服务端签发的一次性 escalation grant 才能生成第二层）
 *   4  Tianai 成功 / 用户失败 / 技术失败 / 超时 / session 重放
 *   5  ticket 只能消费一次（重放 / 并发）
 *   6  Redis / Java 不可用一律 fail closed
 *   7  forged provider / stage / escalation grant 不能绕过
 *   8  ticket 在 Redis 中只以 sha256 形态出现（明文永不落库）
 */
import { describe, it, expect } from 'vitest';
import { FakeRedis } from './fake-redis';
import { solveAltcha, encodePayload } from './altcha-helper';
import { createAltchaChallenge } from '../altcha';
import { CAPTCHA_KEY, CaptchaStore } from '../store';
import { CaptchaService, type CaptchaServiceDeps } from '../service';
import { CaptchaTicketService, TICKET_KEY_PREFIX, USED_KEY_PREFIX } from '../ticket-service';
import { captchaTicketHash, sha256Hex } from '../crypto-utils';
import type { DynamicConfig } from '../../../config/dynamic-config';
import type {
  CaptchaChallengeResult,
  CaptchaGenerateInput,
  CaptchaProviderAdapter,
  CaptchaVerifyInput,
  CaptchaVerifyResult,
} from '../providers/types';
import {
  CaptchaExpiredError,
  CaptchaInvalidError,
  CaptchaReplayedError,
  CaptchaRequiredError,
  CaptchaTechnicalError,
  CaptchaUnavailableError,
  ValidationError,
} from '../../../core/errors';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HMAC_KEY = 'unit-test-altcha-hmac-key-0123456789abcdef';
const TEST_COST = 200;
const START = 1_700_000_000_000;
const TENANT = 'T001';
const TIANAI_URL = 'https://tianai.test';

function makeConfig(overrides: Partial<DynamicConfig> = {}): DynamicConfig {
  return {
    multiLogin: true,
    uploadLimitMB: 20,
    demoEnabled: false,
    appName: 'BLS-KOX',
    loginCaptchaEnabled: true,
    captchaPrimaryProvider: 'ALTCHA',
    captchaFallbackProvider: 'TIANAI',
    captchaTicketTtl: 120,
    captchaTianaiEnabled: true,
    captchaChallengeTtlSeconds: 180,
    captchaForceAfterFailures: 3,
    captchaSecondaryType: 'blockPuzzle',
    ...overrides,
  };
}

/** 可控的第二层 adapter（模拟 Tianai Java 服务，不发真实网络请求） */
class FakeTianai implements CaptchaProviderAdapter {
  readonly name = 'TIANAI' as const;
  genCalls = 0;
  verifyCalls = 0;
  readonly upstreamIds: string[] = [];

  constructor(
    private readonly clock: () => number,
    private behavior: {
      available?: boolean;
      genFails?: boolean;
      verdict?: 'passed' | 'failed' | 'technical_error';
    } = {},
  ) {}

  isAvailable(): boolean {
    return this.behavior.available ?? true;
  }

  /** 健康检查：只接受 2xx + JSON（这里用布尔替身表达"可达 / 不可达"） */
  async healthCheck(): Promise<boolean> {
    return this.behavior.available ?? true;
  }

  async generate(_input: CaptchaGenerateInput): Promise<CaptchaChallengeResult> {
    this.genCalls++;
    if (this.behavior.genFails) throw new Error('upstream unreachable');
    const upstreamId = `up-${this.genCalls}`;
    this.upstreamIds.push(upstreamId);
    return {
      provider: 'TIANAI',
      // 与 bls-captcha-service 的 CaptchaBridgeController 返回字段一一对应
      challenge: {
        id: upstreamId,
        type: 'SLIDER',
        backgroundImage: 'data:image/jpeg;base64,AAAA',
        templateImage: 'data:image/png;base64,BBBB',
        backgroundImageWidth: 600,
        backgroundImageHeight: 300,
        templateImageWidth: 120,
        templateImageHeight: 300,
        data: null,
      },
      sessionId: `local-session-${this.genCalls}`,
      expiresAt: this.clock() + 180_000,
    };
  }

  async verify(_input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
    this.verifyCalls++;
    if (this.behavior.verdict === 'technical_error') {
      return { status: 'technical_error', provider: 'TIANAI', technicalReason: 'UPSTREAM_TIMEOUT' };
    }
    if (this.behavior.verdict === 'failed') {
      return { status: 'failed', provider: 'TIANAI', reason: 'SOLUTION_INVALID' };
    }
    return { status: 'passed', provider: 'TIANAI' };
  }
}

interface Harness {
  service: CaptchaService;
  store: CaptchaStore;
  redis: FakeRedis;
  tianai: FakeTianai;
  audits: any[];
  advance(ms: number): void;
  setConfig(cfg: DynamicConfig): void;
  setRisk(level: string): void;
  setPrivileged(v: boolean): void;
  setTenant(t: string): void;
}

function setup(opts: {
  config?: Partial<DynamicConfig>;
  deps?: Partial<CaptchaServiceDeps>;
  tianaiBehavior?: ConstructorParameters<typeof FakeTianai>[1];
  tianaiBaseUrl?: string;
  /** 默认 TENANT；用于验证「跨租户 ticket 不可复用」 */
  tenant?: string;
} = {}): Harness {
  let clock = START;
  const redis = new FakeRedis(() => clock);
  const store = new CaptchaStore(() => redis);
  const audits: any[] = [];
  const tianai = new FakeTianai(() => clock, opts.tianaiBehavior);
  let config = makeConfig(opts.config);
  let riskLevel = 'LOW';
  let privileged = false;
  let tenant = opts.tenant ?? TENANT;

  const service = new CaptchaService({
    store,
    getConfig: async () => config,
    risk: { getIpRisk: async () => ({ level: riskLevel as any, score: riskLevel === 'HIGH' ? 90 : 0 }) },
    now: () => clock,
    audit: async (input) => { audits.push(input); },
    devBypass: false,
    resolveTenant: async () => tenant,
    isPrivilegedAccount: async () => privileged,
    hmacKey: HMAC_KEY,
    cost: TEST_COST,
    tianaiBaseUrl: opts.tianaiBaseUrl ?? TIANAI_URL,
    tianaiProvider: tianai,
    // 默认把 ticket 服务绑到同一个 fake redis，保证测试完全离线且时钟可控
    ticketService: new CaptchaTicketService(() => redis as any, () => clock),
    ...opts.deps,
  });

  return {
    service,
    store,
    redis,
    tianai,
    audits,
    advance: (ms) => { clock += ms; },
    setConfig: (cfg) => { config = cfg; },
    setRisk: (level) => { riskLevel = level; },
    setPrivileged: (v) => { privileged = v; },
    setTenant: (t) => { tenant = t; },
  };
}

/** 与登录接口一致的请求元信息 */
function meta(over: Record<string, any> = {}) {
  return {
    domainName: 'demo.example.com',
    username: 'admin',
    ip: '10.0.0.1',
    userAgent: CHROME_UA,
    requestId: 'req-1',
    route: '/api/captcha/verify',
    method: 'POST',
    ...over,
  };
}

/** 走完第一层（ALTCHA）并拿到一次性 captchaTicket */
async function issueSilentTicket(h: Harness, over: Record<string, any> = {}) {
  const generated = await h.service.generate({ ...meta(over), provider: 'ALTCHA' });
  const payload = await solveAltcha(generated.challenge as any);
  const result = await h.service.verify({ ...meta(over), provider: 'ALTCHA', payload });
  return { challenge: generated.challenge, payload, result };
}

/** 走「风控升级 → 生成第二层 → 提交答案」完整链路 */
async function issueSecondaryTicket(h: Harness, over: Record<string, any> = {}) {
  const silent = await issueSilentTicket(h, over);
  const grant = silent.result.escalationGrant!;
  const generated = await h.service.generate({
    ...meta(over),
    provider: 'TIANAI',
    escalationGrant: grant,
  });
  const result = await h.service.verify({
    ...meta(over),
    provider: 'TIANAI',
    sessionId: generated.sessionId,
    data: { bgImageWidth: 600, bgImageHeight: 300, startTime: START, stopTime: START + 800, trackList: [] },
  });
  return { generated, result, silent };
}

// ============================================================
// 一、总开关与公开配置
// ============================================================
describe('两级人机验证 —— 总开关', () => {
  it('1. 功能关闭：公开配置 enabled=false，登录不要求 ticket', async () => {
    const h = setup({ config: { loginCaptchaEnabled: false } });
    const cfg = await h.service.getPublicConfig(meta());
    expect(cfg.enabled).toBe(false);
    await expect(h.service.consumeLoginTicket(meta())).resolves.toEqual({ required: false });
  });

  it('1b. 功能关闭：generate / verify 明确拒绝（不静默通过）', async () => {
    const h = setup({ config: { loginCaptchaEnabled: false } });
    await expect(h.service.generate({ ...meta(), provider: 'ALTCHA' })).rejects.toBeInstanceOf(ValidationError);
    await expect(h.service.verify({ ...meta(), provider: 'ALTCHA', payload: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('1c. 功能开启：公开配置只下发渲染所需字段，并如实反映 tianaiEnabled', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    const cfg: any = await h.service.getPublicConfig(meta());
    expect(cfg.enabled).toBe(true);
    expect(cfg.tianaiEnabled).toBe(true);
    expect(Object.keys(cfg).sort()).toEqual([
      'enabled', 'fallbackProvider', 'fieldName', 'generateUrl', 'primaryProvider', 'tianaiEnabled', 'verifyUrl',
    ]);
    expect(JSON.stringify(cfg)).not.toContain('ACCOUNT_FAILURES');
    expect(JSON.stringify(cfg)).not.toContain('PRIVILEGED_ACCOUNT');
    expect(cfg).not.toHaveProperty('requiredStage');
    expect(cfg).not.toHaveProperty('mode');
  });

  it('1d. devBypass：公开配置为关闭且不消费 ticket', async () => {
    const h = setup({ deps: { devBypass: true } });
    expect((await h.service.getPublicConfig(meta())).enabled).toBe(false);
    await expect(h.service.consumeLoginTicket(meta())).resolves.toEqual({ required: false });
  });
});

// ============================================================
// 二、第一层 ALTCHA
// ============================================================
describe('两级人机验证 —— 第一层（ALTCHA）', () => {
  it('2. 静默 PoW 通过 → 签发 provider=ALTCHA 的一次性 captchaTicket', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const { result } = await issueSilentTicket(h);
    expect(result.status).toBe('passed');
    expect(result.provider).toBe('ALTCHA');
    expect(result.captchaTicket).toBeTruthy();

    await expect(h.service.consumeLoginTicket({ ...meta(), captchaTicket: result.captchaTicket }))
      .resolves.toMatchObject({ required: true, provider: 'ALTCHA' });
  });

  it('2b. 明文 ticket 绝不出现在 Redis key 中（只用 sha256）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const { result } = await issueSilentTicket(h);
    const ticket = result.captchaTicket!;
    const keys = h.redis.keys();

    expect(keys.some((k) => k.includes(ticket))).toBe(false);
    expect(keys).toContain(`${TICKET_KEY_PREFIX}${captchaTicketHash(ticket)}`);

    // 消费后 used-marker 同样只保存 hash
    await h.service.consumeLoginTicket({ ...meta(), captchaTicket: ticket });
    const after = h.redis.keys();
    expect(after.some((k) => k.includes(ticket))).toBe(false);
    expect(after).toContain(`${USED_KEY_PREFIX}${captchaTicketHash(ticket)}`);
  });

  it('3. PoW 失败 / payload 结构错误 → failed，且不签发 ticket', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const malformed = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload: encodePayload({ foo: 1 }) });
    expect(malformed.status).toBe('failed');
    expect(malformed.reason).toBe('PAYLOAD_MALFORMED');
    expect(malformed.captchaTicket).toBeUndefined();

    const missing = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload: '' });
    expect(missing.reason).toBe('PAYLOAD_MISSING');

    const bad = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload: 'not-base64!!' });
    expect(bad.reason).toBe('PAYLOAD_MALFORMED');
  });

  it('4. challenge 过期 → CHALLENGE_EXPIRED；重放同一 payload → 第二次拒绝', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const generated = await h.service.generate({ ...meta(), provider: 'ALTCHA' });
    const payload = await solveAltcha(generated.challenge as any);

    // challenge nonce 从未被登记（模拟服务端未签发 / 已过期清理）
    await h.redis.del(CAPTCHA_KEY.challenge(String((generated.challenge as any).parameters.nonce)));
    const expired = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload });
    expect(expired.status).toBe('failed');
    expect(expired.reason).toBe('CHALLENGE_EXPIRED');

    // 正常流程下同一 payload 只能成功一次（nonce 一次性消费）
    const h2 = setup({ config: { captchaTianaiEnabled: false } });
    const g2 = await h2.service.generate({ ...meta(), provider: 'ALTCHA' });
    const p2 = await solveAltcha(g2.challenge as any);
    expect((await h2.service.verify({ ...meta(), provider: 'ALTCHA', payload: p2 })).status).toBe('passed');
    const replayed = await h2.service.verify({ ...meta(), provider: 'ALTCHA', payload: p2 });
    expect(replayed.status).toBe('failed');
    expect(replayed.reason).toBe('CHALLENGE_EXPIRED');
  });

  it('5. 绑定不匹配：A 的 challenge 不能给 B 使用（BINDING_MISMATCH）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const generated = await h.service.generate({ ...meta({ username: 'alice' }), provider: 'ALTCHA' });
    const payload = await solveAltcha(generated.challenge as any);
    const res = await h.service.verify({ ...meta({ username: 'bob' }), provider: 'ALTCHA', payload });
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('BINDING_MISMATCH');
    expect(res.captchaTicket).toBeUndefined();
  });

  it('5b. 伪造 stage / display / provider 字段不影响服务端判定（无 stage 概念）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const generated = await h.service.generate({ ...meta(), provider: 'ALTCHA' });
    const payload = await solveAltcha(generated.challenge as any);
    const forged = {
      ...meta(),
      provider: 'ALTCHA',
      payload,
      stage: 'secondary',
      captchaMode: 'always',
      display: 'standard',
    } as any;
    const res = await h.service.verify(forged);
    expect(res.status).toBe('passed');
    expect(res.provider).toBe('ALTCHA');
    // 伪造字段不会让它跳过风控，也不会写进 ticket
    const consumed = await h.service.consumeLoginTicket({ ...meta(), captchaTicket: res.captchaTicket });
    expect(consumed.provider).toBe('ALTCHA');
  });

  it('5c. 签名不符的 challenge（他人密钥签发）→ 拒绝', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const other = await createAltchaChallenge({
      hmacKey: 'another-altcha-hmac-key-9876543210zyxwvuts',
      ttlSeconds: 180,
      cost: TEST_COST,
      data: { tenantId: TENANT, usernameHash: sha256Hex('admin'), scene: 'LOGIN' },
    });
    await h.store.claimChallengeNonce(String((other as any).parameters.nonce), 180);
    const payload = await solveAltcha(other as any);
    const res = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload });
    expect(res.status).toBe('failed');
    expect(['SIGNATURE_INVALID', 'CHALLENGE_EXPIRED']).toContain(res.reason);
  });
});

// ============================================================
// 三、ticket（登录侧）
// ============================================================
describe('两级人机验证 —— captchaTicket', () => {
  it('6. ticket 只能消费一次（重放 → CAPTCHA_REPLAYED；并发只有一个成功）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const { result } = await issueSilentTicket(h);
    const ticket = result.captchaTicket!;

    await expect(h.service.consumeLoginTicket({ ...meta(), captchaTicket: ticket })).resolves.toBeTruthy();
    await expect(h.service.consumeLoginTicket({ ...meta(), captchaTicket: ticket }))
      .rejects.toBeInstanceOf(CaptchaReplayedError);

    const h2 = setup({ config: { captchaTianaiEnabled: false } });
    const second = await issueSilentTicket(h2);
    const settled = await Promise.allSettled([
      h2.service.consumeLoginTicket({ ...meta(), captchaTicket: second.result.captchaTicket }),
      h2.service.consumeLoginTicket({ ...meta(), captchaTicket: second.result.captchaTicket }),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((s) => s.status === 'rejected')).toHaveLength(1);
  });

  it('6b. 缺少 ticket → CAPTCHA_REQUIRED（存在有效 ticket 时才继续）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    await expect(h.service.consumeLoginTicket(meta())).rejects.toBeInstanceOf(CaptchaRequiredError);
  });

  it('6c. ticket 过期 → CAPTCHA_EXPIRED', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const { result } = await issueSilentTicket(h);
    h.advance(121_000);
    await expect(h.service.consumeLoginTicket({ ...meta(), captchaTicket: result.captchaTicket }))
      .rejects.toBeInstanceOf(CaptchaExpiredError);
  });

  it('6d. 跨账号 / 跨 IP / 跨 UA / 跨域名使用 ticket → CAPTCHA_INVALID', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    const a = await issueSilentTicket(h, { username: 'alice' });
    await expect(h.service.consumeLoginTicket({ ...meta({ username: 'bob' }), captchaTicket: a.result.captchaTicket }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);

    const h2 = setup({ config: { captchaTianaiEnabled: false } });
    const b = await issueSilentTicket(h2);
    await expect(h2.service.consumeLoginTicket({ ...meta({ ip: '10.9.9.9' }), captchaTicket: b.result.captchaTicket }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);

    const h3 = setup({ config: { captchaTianaiEnabled: false } });
    const c = await issueSilentTicket(h3);
    await expect(h3.service.consumeLoginTicket({ ...meta({ userAgent: 'curl/8.0' }), captchaTicket: c.result.captchaTicket }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);

    const h4 = setup({ config: { captchaTianaiEnabled: false } });
    const d = await issueSilentTicket(h4);
    // 另一个租户（同一 Redis，不同 tenant 绑定）不能复用同一张 ticket → BINDING_MISMATCH
    h4.setTenant('T002');
    await expect(h4.service.consumeLoginTicket({ ...meta(), captchaTicket: d.result.captchaTicket }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('6e. Redis 不可用 → fail closed（生成与消费都抛 50301）', async () => {
    const h = setup({
      config: { captchaTianaiEnabled: false },
      deps: {
        store: new CaptchaStore(() => null),
        ticketService: new CaptchaTicketService(() => null),
      },
    });
    await expect(h.service.generate({ ...meta(), provider: 'ALTCHA' })).rejects.toBeInstanceOf(CaptchaUnavailableError);
    await expect(h.service.consumeLoginTicket({ ...meta(), captchaTicket: 'any.ticket' }))
      .rejects.toBeInstanceOf(CaptchaUnavailableError);
  });
});

// ============================================================
// 四、风控升级 + escalation grant
// ============================================================
describe('两级人机验证 —— 风控升级与 escalate 授权', () => {
  it('7. 超管账号 → 第一层通过也不签发 ticket，返回 escalationGrant', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    const { result } = await issueSilentTicket(h);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('SECONDARY_REQUIRED');
    expect(result.requireFallback).toBe(true);
    expect(result.nextProvider).toBe('TIANAI');
    expect(result.captchaTicket).toBeUndefined();
    expect(result.escalationGrant).toBeTruthy();

    // 内部原因只写审计，绝不下发
    expect(JSON.stringify(result)).not.toContain('PRIVILEGED_ACCOUNT');
    expect(h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('PRIVILEGED_ACCOUNT');
  });

  it('7b. 连续失败达阈值 / IP 高风险 / UA 异常同样触发升级（内部原因只写审计）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());
    const byFailures = await issueSilentTicket(h);
    expect(byFailures.result.reason).toBe('SECONDARY_REQUIRED');
    expect(h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('ACCOUNT_FAILURES');

    const high = setup({ config: { captchaTianaiEnabled: true } });
    high.setRisk('HIGH');
    expect((await issueSilentTicket(high)).result.reason).toBe('SECONDARY_REQUIRED');

    const bot = setup({ config: { captchaTianaiEnabled: true } });
    const r = await issueSilentTicket(bot, { userAgent: 'curl/8.0' });
    expect(r.result.reason).toBe('SECONDARY_REQUIRED');
  });

  it('7c. 未启用 Tianai → 不升级（内部原因仍写审计），第一层通过即签发 ticket', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    h.setPrivileged(true);
    const { result } = await issueSilentTicket(h);
    expect(result.status).toBe('passed');
    expect(result.captchaTicket).toBeTruthy();
    expect(result.escalationGrant).toBeUndefined();
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_RISK_NOTED')).toBe(true);
  });

  it('7d. 审计语义互斥：一次 /verify 请求不能既"要求第二层"又"第一层通过"', async () => {
    // ① 未启用第二层 + 风控命中 → CAPTCHA_RISK_NOTED（仅记录）+ CAPTCHA_POW_PASSED，
    //    绝不能出现 CAPTCHA_SECONDARY_REQUIRED（那意味着真的拦截了）
    const off = setup({ config: { captchaTianaiEnabled: false } });
    off.setPrivileged(true);
    await issueSilentTicket(off);
    const offTypes = off.audits.map((a) => a.eventType);
    expect(offTypes).toContain('CAPTCHA_RISK_NOTED');
    expect(offTypes).toContain('CAPTCHA_POW_PASSED');
    expect(offTypes).not.toContain('CAPTCHA_SECONDARY_REQUIRED');
    // 风险等级：仅记录 → LOW
    expect(off.audits.find((a) => a.eventType === 'CAPTCHA_RISK_NOTED')?.riskLevel).toBe('LOW');

    // ② 启用第二层 + 风控命中 → 只写 CAPTCHA_SECONDARY_REQUIRED，且不写 CAPTCHA_POW_PASSED
    const on = setup({ config: { captchaTianaiEnabled: true } });
    on.setPrivileged(true);
    await issueSilentTicket(on);
    const onTypes = on.audits.map((a) => a.eventType);
    expect(onTypes).toContain('CAPTCHA_SECONDARY_REQUIRED');
    expect(onTypes).not.toContain('CAPTCHA_POW_PASSED');
    expect(onTypes).not.toContain('CAPTCHA_RISK_NOTED');
  });

  it('8. 客户端不能凭 provider=TIANAI 直接索要第二层（缺 grant → 400）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI' }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
    expect(h.tianai.genCalls).toBe(0);

    // 伪造一个 grant 也不行
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: 'forged-grant-value' }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
    expect(h.tianai.genCalls).toBe(0);
  });

  it('8b. escalation grant 一次性：用过即失效', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h);
    const grant = silent.result.escalationGrant!;

    await expect(h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: grant })).resolves.toBeTruthy();
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: grant }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
    expect(h.tianai.genCalls).toBe(1);
  });

  it('8c. escalation grant 与租户 / 账号 / IP / UA 绑定', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h, { username: 'alice' });
    const grant = silent.result.escalationGrant!;
    await expect(h.service.generate({ ...meta({ username: 'bob' }), provider: 'TIANAI', escalationGrant: grant }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);

    const h2 = setup({ config: { captchaTianaiEnabled: true } });
    h2.setPrivileged(true);
    const s2 = await issueSilentTicket(h2);
    await expect(h2.service.generate({ ...meta({ ip: '10.9.9.9' }), provider: 'TIANAI', escalationGrant: s2.result.escalationGrant }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);

    const h3 = setup({ config: { captchaTianaiEnabled: true } });
    h3.setPrivileged(true);
    const s3 = await issueSilentTicket(h3);
    h3.advance(181_000);
    await expect(h3.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: s3.result.escalationGrant }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('8d. 明文 escalation grant 不落 Redis key（只存 sha256）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h);
    const grant = silent.result.escalationGrant!;
    const keys = h.redis.keys();
    expect(keys.some((k) => k.includes(grant))).toBe(false);
    expect(keys).toContain(CAPTCHA_KEY.escalation(sha256Hex(grant)));
  });
});

// ============================================================
// 五、第二层 TIANAI
// ============================================================
describe('两级人机验证 —— 第二层（Tianai）', () => {
  it('9. 完整链路：ALTCHA（被强制）→ escalation grant → Tianai → ticket', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);

    const { generated, result } = await issueSecondaryTicket(h);
    expect(generated.provider).toBe('TIANAI');
    expect(generated.sessionId).toBeTruthy();
    expect(result.status).toBe('passed');
    expect(result.provider).toBe('TIANAI');

    await expect(h.service.consumeLoginTicket({ ...meta(), captchaTicket: result.captchaTicket }))
      .resolves.toMatchObject({ required: true, provider: 'TIANAI' });

    const types = h.audits.map((a) => a.eventType);
    expect(types).toContain('CAPTCHA_SECONDARY_REQUIRED');
    expect(types).toContain('CAPTCHA_SECONDARY_PASSED');
  });

  it('9b. 第二层会话一次性：同一 sessionId 只能提交一次（重放 → CHALLENGE_EXPIRED）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h);
    const generated = await h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: silent.result.escalationGrant });
    const data = { bgImageWidth: 600, bgImageHeight: 300, startTime: START, stopTime: START + 800, trackList: [] };

    const first = await h.service.verify({ ...meta(), provider: 'TIANAI', sessionId: generated.sessionId, data });
    expect(first.status).toBe('passed');
    expect(h.tianai.verifyCalls).toBe(1);

    const second = await h.service.verify({ ...meta(), provider: 'TIANAI', sessionId: generated.sessionId, data });
    expect(second.status).toBe('failed');
    expect(second.reason).toBe('CHALLENGE_EXPIRED');
    // 重放不会再打上游
    expect(h.tianai.verifyCalls).toBe(1);
  });

  it('9c. 第二层会话绑定账号 / 场景：A 的 session 不能给 B 用', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h, { username: 'alice' });
    const generated = await h.service.generate({ ...meta({ username: 'alice' }), provider: 'TIANAI', escalationGrant: silent.result.escalationGrant });

    const res = await h.service.verify({
      ...meta({ username: 'bob' }),
      provider: 'TIANAI',
      sessionId: generated.sessionId,
      data: {},
    });
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('BINDING_MISMATCH');
    expect(h.tianai.verifyCalls).toBe(0);
  });

  it('9d. 第二层会话过期 → CHALLENGE_EXPIRED', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true, captchaChallengeTtlSeconds: 30 } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h);
    const generated = await h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: silent.result.escalationGrant });
    h.advance(31_000);
    const res = await h.service.verify({ ...meta(), provider: 'TIANAI', sessionId: generated.sessionId, data: {} });
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('CHALLENGE_EXPIRED');
  });

  it('10. Tianai 判定用户答案错误 → failed / SOLUTION_INVALID，不签发 ticket', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true }, tianaiBehavior: { verdict: 'failed' } });
    h.setPrivileged(true);
    const { result } = await issueSecondaryTicket(h);
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('SOLUTION_INVALID');
    expect(result.captchaTicket).toBeUndefined();
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_SECONDARY_FAILED')).toBe(true);
  });

  it('11. Tianai 技术故障 / 超时 → technical_error + 新 grant（前端可自动刷新，无需用户先失败一次）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true }, tianaiBehavior: { verdict: 'technical_error' } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h);
    const generated = await h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: silent.result.escalationGrant });

    const res = await h.service.verify({ ...meta(), provider: 'TIANAI', sessionId: generated.sessionId, data: {} });
    expect(res.status).toBe('technical_error');
    expect(res.requireFallback).toBe(true);
    expect(res.nextProvider).toBe('TIANAI');
    // 关键：补发新 grant，前端据此自动换一张 challenge，而不是让用户手动重试
    expect(res.escalationGrant).toBeTruthy();
    expect(res.captchaTicket).toBeUndefined();
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_SERVICE_UNAVAILABLE')).toBe(true);

    // 新 grant 立即可用
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: res.escalationGrant }))
      .resolves.toBeTruthy();
  });

  it('11b. Tianai 生成 challenge 失败 → fail closed（50302，绝不放行）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true }, tianaiBehavior: { genFails: true } });
    h.setPrivileged(true);
    const silent = await issueSilentTicket(h);
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: silent.result.escalationGrant }))
      .rejects.toBeInstanceOf(CaptchaTechnicalError);
  });

  it('12. 未配置 TIANAI_BASE_URL 且 tianaiEnabled=true → 风控命中时 fail closed（不降级放行）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true }, tianaiBaseUrl: '' });
    h.setPrivileged(true);
    const generated = await h.service.generate({ ...meta(), provider: 'ALTCHA' });
    const payload = await solveAltcha(generated.challenge as any);

    await expect(h.service.verify({ ...meta(), provider: 'ALTCHA', payload }))
      .rejects.toBeInstanceOf(CaptchaTechnicalError);

    // 关键断言：**没有**签发任何 ticket（旧实现会静默降级成「仅 ALTCHA」并放行）
    const audits = h.audits.filter((a) => a.eventType === 'CAPTCHA_SERVICE_UNAVAILABLE');
    expect(audits).toHaveLength(1);
    expect(audits[0].reason).toBe('PROVIDER_UNAVAILABLE');
    expect(audits[0].riskLevel).toBe('HIGH');
  });

  it('12b. 未配置 TIANAI_BASE_URL：既签发不出 grant，也不会打上游（双重 fail closed）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true }, tianaiBaseUrl: '' });
    h.setPrivileged(true);

    // ① 风控命中时第一层直接 fail closed：连 grant 都拿不到
    const generated = await h.service.generate({ ...meta(), provider: 'ALTCHA' });
    const payload = await solveAltcha(generated.challenge as any);
    await expect(h.service.verify({ ...meta(), provider: 'ALTCHA', payload }))
      .rejects.toBeInstanceOf(CaptchaTechnicalError);

    // ② 没有 grant 的第二层请求同样被拒，且从不访问上游
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI' }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);

    // ③ 健康检查如实报告不可用（供系统参数页预检）
    expect(await h.service.tianaiHealthy()).toBe(false);
    expect(h.tianai.genCalls).toBe(0);
  });

  it('12c. tianaiEnabled=false 时第二层请求被拒绝（本部署没有图形验证码服务）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    await expect(h.service.generate({ ...meta(), provider: 'TIANAI' })).rejects.toBeInstanceOf(CaptchaInvalidError);
    const res = await h.service.verify({ ...meta(), provider: 'TIANAI', sessionId: 'whatever', data: {} });
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('PROVIDER_UNAVAILABLE');
    // 未启用第二层时：既不签发 ticket，也不打上游
    expect(res.captchaTicket).toBeUndefined();
    expect(h.tianai.verifyCalls).toBe(0);
  });

  it('13. 健康检查：未配置 → false；替身可用 → true', async () => {
    const offline = setup({ tianaiBaseUrl: '' });
    expect(await offline.service.tianaiHealthy()).toBe(false);
    const online = setup();
    expect(await online.service.tianaiHealthy()).toBe(true);
  });
});

// ============================================================
// 六、其他不变量
// ============================================================
describe('两级人机验证 —— 其他不变量', () => {
  it('14. 所有写入 Redis 的 key 都带 TTL（不产生永久数据）', async () => {
    const h = setup({ config: { captchaTianaiEnabled: true } });
    h.setPrivileged(true);
    await issueSecondaryTicket(h);
    const keys = h.redis.keys();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(await h.redis.exists(k)).toBe(1);
    }
  });

  it('15. IP 多账号统计使用真实 usernameHash —— 空用户名不参与计数', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    for (let i = 0; i < 5; i++) {
      await h.service.generate({ ...meta({ username: '' }), provider: 'ALTCHA' });
    }
    const ipHash = sha256Hex('10.0.0.1');
    expect(await h.store.getIpAccountCount(ipHash)).toBe(0);

    await h.service.generate({ ...meta({ username: 'alice' }), provider: 'ALTCHA' });
    await h.service.generate({ ...meta({ username: 'bob' }), provider: 'ALTCHA' });
    expect(await h.store.getIpAccountCount(ipHash)).toBe(2);
  });

  it('16. 登录成功后清零连续失败计数', async () => {
    const h = setup({ config: { captchaTianaiEnabled: false } });
    await h.service.recordLoginFailure(meta());
    await h.service.recordLoginFailure(meta());
    const scope = TENANT;
    expect(await h.store.getAccountFailures(scope, sha256Hex('admin'))).toBe(2);
    await h.service.resetLoginFailures(meta());
    expect(await h.store.getAccountFailures(scope, sha256Hex('admin'))).toBe(0);
  });
});
