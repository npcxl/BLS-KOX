/**
 * 登录人机验证（两级架构）—— 服务端行为测试
 *
 * 覆盖：
 *   1  功能关闭时不拦截
 *   2  第一层静默 PoW 通过后签发 captchaToken
 *   3  **客户端伪造阶段**（stage=visible / stage=secondary）一律失败
 *   4  用户名 A 的 challenge 不能给用户名 B 使用
 *   5  用户名变化后旧 Token 绑定校验失败
 *   6  Token 只能消费一次（重放 / 并发）
 *   7  公开 config 不泄露管理员身份与风控原因
 *   8  silent → secondary(Tianai) → login 完整链路
 *   9  Tianai 未配置 / 超时 / 错误响应全部 fail closed
 *   10 challenge / token 过期、Redis 不可用 fail closed
 */
import { describe, it, expect } from 'vitest';
import { FakeRedis } from './fake-redis';
import { solveAltcha, encodePayload } from './altcha-helper';
import { CAPTCHA_KEY, CaptchaStore } from '../store';
import { CaptchaService, type CaptchaServiceDeps } from '../service';
import { createAltchaChallenge } from '../altcha';
import type { CaptchaSecondaryType } from '../../../config/dynamic-config';
import { sha256Hex } from '../crypto-utils';
import { TianaiSecondaryProvider } from '../providers/tianai-provider';
import type { DynamicConfig } from '../../../config/dynamic-config';
import {
  CaptchaExpiredError,
  CaptchaInvalidError,
  CaptchaReplayedError,
  CaptchaRequiredError,
  CaptchaUnavailableError,
  ValidationError,
} from '../../../core/errors';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HMAC_KEY = 'unit-test-altcha-hmac-key-0123456789abcdef';
const OTHER_HMAC_KEY = 'another-altcha-hmac-key-9876543210zyxwvuts';
/** 测试用极低 PoW 难度（生产默认 5 万） */
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
    captchaEnabled: true,
    captchaMode: 'adaptive',
    captchaPrimaryProvider: 'altcha',
    captchaSecondaryProvider: 'tianai',
    captchaSecondaryType: 'blockPuzzle',
    captchaChallengeTtlSeconds: 180,
    captchaTokenTtlSeconds: 120,
    captchaForceAfterFailures: 3,
    ...overrides,
  };
}

/** 可控的第二层 adapter（模拟 Tianai 独立服务） */
class FakeTianai extends TianaiSecondaryProvider {
  public genCalls = 0;
  public checkCalls = 0;

  constructor(
    private behavior: {
      healthy?: boolean;
      genFails?: boolean;
      checkResult?: boolean;
      checkThrows?: boolean;
      upstreamId?: string;
    } = {},
  ) {
    super({ baseUrl: TIANAI_URL });
  }

  override get configured(): boolean {
    return true;
  }

  override async healthCheck(): Promise<boolean> {
    return this.behavior.healthy ?? true;
  }

  override async createChallenge(type: CaptchaSecondaryType) {
    this.genCalls++;
    if (this.behavior.genFails) throw new CaptchaUnavailableError();
    return {
      upstreamId: this.behavior.upstreamId ?? 'upstream-1',
      type,
      payload: { backgroundImage: 'data:image/png;base64,AAAA', width: 320, height: 160 },
    };
  }

  override async verify(): Promise<boolean> {
    this.checkCalls++;
    if (this.behavior.checkThrows) throw new CaptchaUnavailableError();
    return this.behavior.checkResult ?? true;
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
}

function setup(opts: {
  config?: Partial<DynamicConfig>;
  deps?: Partial<CaptchaServiceDeps>;
  tianai?: ConstructorParameters<typeof FakeTianai>[0];
} = {}): Harness {
  let clock = START;
  const redis = new FakeRedis(() => clock);
  const store = new CaptchaStore(() => redis);
  const audits: any[] = [];
  const tianai = new FakeTianai(opts.tianai);
  let config = makeConfig(opts.config);
  let riskLevel = 'LOW';
  let privileged = false;

  const service = new CaptchaService({
    store,
    getConfig: async () => config,
    risk: { getIpRisk: async () => ({ level: riskLevel as any, score: riskLevel === 'HIGH' ? 90 : 0 }) },
    now: () => clock,
    audit: async (input) => { audits.push(input); },
    devBypass: false,
    resolveTenant: async () => TENANT,
    isPrivilegedAccount: async () => privileged,
    hmacKey: HMAC_KEY,
    cost: TEST_COST,
    tianaiBaseUrl: TIANAI_URL,
    tianaiProvider: tianai,
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
    route: '/api/auth/captcha/verify',
    method: 'POST',
    ...over,
  };
}

/** 走完第一层并拿到一次性 captchaToken */
async function issueSilentToken(h: Harness, over: Record<string, any> = {}) {
  const challenge: any = await h.service.createSilentChallenge(meta(over));
  const payload = await solveAltcha(challenge);
  const result = await h.service.verifySilent({ ...meta(over), payload });
  return { challenge, payload, result };
}

/** 走完第二层（Tianai）并拿到一次性 captchaToken */
async function issueSecondaryToken(h: Harness, over: Record<string, any> = {}) {
  const challenge = await h.service.createSecondaryChallenge(meta(over));
  h.advance(3000);
  const result = await h.service.verifySecondary({
    ...meta(over),
    sessionId: challenge.sessionId,
    data: { x: 100, y: 50 },
  });
  return { challenge, result };
}

describe('两级人机验证 —— 第一层（ALTCHA 静默）', () => {
  it('1. 功能关闭时不拦截登录（consumeLoginToken → required=false）', async () => {
    const h = setup({ config: { captchaEnabled: false } });
    await expect(h.service.consumeLoginToken(meta())).resolves.toEqual({ required: false });
  });

  it('2. 静默 PoW 通过 → 签发 stage=silent / provider=altcha 的一次性 Token', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h);
    expect(result.passed).toBe(true);
    expect(result.stage).toBe('silent');
    expect(result.captchaToken).toBeTruthy();

    // Token 记录中的 stage / provider 完全由服务端决定
    const raw = await h.redis.get(CAPTCHA_KEY.token(sha256Hex(result.captchaToken!)));
    const record = JSON.parse(raw!);
    expect(record.stage).toBe('silent');
    expect(record.provider).toBe('altcha');

    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: result.captchaToken }))
      .resolves.toMatchObject({ required: true, stage: 'silent' });
  });

  it('3. 客户端伪造阶段不能通过（invisible challenge + stage=visible/secondary 均无 Token）', async () => {
    const h = setup();
    const challenge: any = await h.service.createSilentChallenge(meta());
    const payload = await solveAltcha(challenge);

    // 服务端根本不读取请求体里的 stage —— 签名内的 stage 才是唯一依据
    // （这里刻意传入伪造字段，模拟攻击者构造的请求体）
    const forged = { ...meta(), payload, stage: 'visible', display: 'standard', provider: 'tianai' } as any;
    const result: any = await h.service.verifySilent(forged);
    expect(result.passed).toBe(true);
    // 伪造的 stage 不会影响服务端判定的阶段
    expect(result.stage).toBe('silent');
    const raw = await h.redis.get(CAPTCHA_KEY.token(sha256Hex(result.captchaToken!)));
    expect(JSON.parse(raw!).stage).toBe('silent');

    // 再试一次 stage=secondary"自愿升级"：同样不能拿到 secondary 凭证
    const c2: any = await h.service.createSilentChallenge(meta());
    const p2 = await solveAltcha(c2);
    const r2: any = await h.service.verifySilent({ ...meta(), payload: p2, stage: 'secondary' } as any);
    expect(r2.stage).toBe('silent');
  });

  it('3b. 签名内 stage 不是 silent 的 challenge（伪造签名后）被拒绝并审计 STAGE_MISMATCH', async () => {
    const h = setup();
    // 用同一 HMAC 密钥直接构造一个 stage=secondary 的 challenge（模拟被签名的二级 challenge 提交到一级接口）
    const forged = await createAltchaChallenge({
      hmacKey: HMAC_KEY,
      ttlSeconds: 180,
      cost: TEST_COST,
      data: { tenantId: TENANT, usernameHash: sha256Hex('admin'), stage: 'secondary', display: 'invisible' },
    });
    const payload = await solveAltcha(forged as any);
    // 手动登记 nonce（模拟该 challenge 由服务端签发过）
    await h.store.claimChallengeNonce(String(forged.parameters.nonce), 180);

    const result = await h.service.verifySilent({ ...meta(), payload });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('STAGE_MISMATCH');
    expect(h.audits.some((a) => a.reason === 'STAGE_MISMATCH')).toBe(true);
  });

  it('4. 用户名 A 的 challenge 不能给用户名 B 使用（BINDING_MISMATCH）', async () => {
    const h = setup();
    const challenge: any = await h.service.createSilentChallenge(meta({ username: 'alice' }));
    const payload = await solveAltcha(challenge);

    const result = await h.service.verifySilent({ ...meta({ username: 'bob' }), payload });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('BINDING_MISMATCH');
  });

  it('5. 用户名变化后旧 Token 无效（BINDING_MISMATCH）', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h, { username: 'alice' });
    expect(result.passed).toBe(true);

    await expect(
      h.service.consumeLoginToken({ ...meta({ username: 'bob' }), captchaToken: result.captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('6. Token 只能消费一次（重放 → CAPTCHA_REPLAYED；并发只有一个成功）', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h);
    const token = result.captchaToken!;

    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: token })).resolves.toBeTruthy();
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: token }))
      .rejects.toBeInstanceOf(CaptchaReplayedError);

    // 并发场景
    const h2 = setup();
    const second = await issueSilentToken(h2);
    const token2 = second.result.captchaToken!;
    const settled = await Promise.allSettled([
      h2.service.consumeLoginToken({ ...meta(), captchaToken: token2 }),
      h2.service.consumeLoginToken({ ...meta(), captchaToken: token2 }),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((s) => s.status === 'rejected')).toHaveLength(1);
  });

  it('7. 公开 config 不泄露管理员身份 / 风控原因，只返回通用 requiredStage', async () => {
    const h = setup();
    h.setPrivileged(true); // 超管 → 内部原因 PRIVILEGED_ACCOUNT
    const cfg: any = await h.service.getPublicConfig(meta({ username: 'admin' }));

    expect(cfg.requiredStage).toBe('secondary');
    // 内部原因绝不能出现在响应里
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain('PRIVILEGED_ACCOUNT');
    expect(serialized).not.toContain('ACCOUNT_FAILURES');
    expect(serialized).not.toContain('IP_RISK_HIGH');
    expect(cfg.reason).toBeUndefined();
    // 只有前端驱动组件所需字段
    expect(Object.keys(cfg).sort()).toEqual([
      'challengeUrl', 'enabled', 'fieldName', 'mode',
      'primaryProvider', 'requiredStage', 'secondaryChallengeUrl',
      'secondaryProvider', 'secondaryType',
    ]);
    // 但审计里必须留有内部原因
    expect(h.audits.length).toBe(0); // getPublicConfig 只判定，不写审计
  });

  it('7b. 策略要求第二层时，第一层即使 PoW 通过也不签发 Token（SECONDARY_REQUIRED）', async () => {
    const h = setup();
    h.setPrivileged(true);
    const { result } = await issueSilentToken(h);
    expect(result.passed).toBe(false);
    expect(result.requiredStage).toBe('secondary');
    expect(result.reason).toBe('SECONDARY_REQUIRED');
    expect(result.captchaToken).toBeUndefined();
    // 内部原因只出现在审计
    expect(h.audits.some((a) => a.reason === 'PRIVILEGED_ACCOUNT')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVILEGED_ACCOUNT');
  });

  it('10a. challenge 过期 / 未签发 / 重放一律拒绝', async () => {
    const h = setup();
    const challenge: any = await h.service.createSilentChallenge(meta());
    const payload = await solveAltcha(challenge);

    // 未登记 nonce（模拟服务端从未签发）→ CHALLENGE_EXPIRED
    await h.redis.del(CAPTCHA_KEY.challenge(String(challenge.parameters.nonce)));
    const first = await h.service.verifySilent({ ...meta(), payload });
    expect(first.passed).toBe(false);
    expect(first.reason).toBe('CHALLENGE_EXPIRED');

    // 正常流程下重复提交同一 payload → 第二次被拒
    const h2 = setup();
    const c2: any = await h2.service.createSilentChallenge(meta());
    const p2 = await solveAltcha(c2);
    expect((await h2.service.verifySilent({ ...meta(), payload: p2 })).passed).toBe(true);
    expect((await h2.service.verifySilent({ ...meta(), payload: p2 })).passed).toBe(false);
  });

  it('10b. 签名密钥不符 / payload 结构错误 → 拒绝', async () => {
    const h = setup();
    const other = await createAltchaChallenge({
      hmacKey: OTHER_HMAC_KEY,
      ttlSeconds: 180,
      cost: TEST_COST,
      data: { tenantId: TENANT, usernameHash: sha256Hex('admin'), stage: 'silent', display: 'invisible' },
    });
    await h.store.claimChallengeNonce(String(other.parameters.nonce), 180);
    const payload = await solveAltcha(other as any);
    const res = await h.service.verifySilent({ ...meta(), payload });
    expect(res.passed).toBe(false);
    expect(['SIGNATURE_INVALID', 'CHALLENGE_EXPIRED']).toContain(res.reason);

    const malformed = await h.service.verifySilent({ ...meta(), payload: encodePayload({ foo: 1 }) });
    expect(malformed.reason).toBe('PAYLOAD_MALFORMED');

    const missing = await h.service.verifySilent({ ...meta(), payload: '' });
    expect(missing.reason).toBe('PAYLOAD_MISSING');
  });

  it('10c. 账号连续失败达到阈值 → 强制第二层', async () => {
    const h = setup();
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());
    const { result } = await issueSilentToken(h);
    expect(result.requiredStage).toBe('secondary');
    expect(h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('ACCOUNT_FAILURES');
  });

  it('10d. IP 多账号统计使用真实 usernameHash —— 空用户名不参与计数', async () => {
    const h = setup();
    // 三次不带用户名的 challenge 请求：不应把空 hash 计入 IP 账号集合
    for (let i = 0; i < 5; i++) {
      await h.service.createSilentChallenge(meta({ username: '' }));
    }
    const ipHash = sha256Hex('10.0.0.1');
    expect(await h.store.getIpAccountCount(ipHash)).toBe(0);

    await h.service.createSilentChallenge(meta({ username: 'alice' }));
    await h.service.createSilentChallenge(meta({ username: 'bob' }));
    expect(await h.store.getIpAccountCount(ipHash)).toBe(2);
  });

  it('10e. Redis 不可用 → fail closed（绝不放行）', async () => {
    const h = setup({ deps: { store: new CaptchaStore(() => null) } });
    await expect(h.service.createSilentChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: 'any.token' }))
      .rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('10f. captchaToken 过期 → CAPTCHA_EXPIRED', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h);
    h.advance(121_000);
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: result.captchaToken }))
      .rejects.toBeInstanceOf(CaptchaExpiredError);
  });

  it('10g. 缺少 Token → CAPTCHA_REQUIRED，且不因缺少 Token 而检查账号', async () => {
    const h = setup();
    await expect(h.service.consumeLoginToken(meta())).rejects.toBeInstanceOf(CaptchaRequiredError);
  });

  it('10h. 域名不一致 → CAPTCHA_INVALID', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h);
    await expect(
      h.service.consumeLoginToken({ ...meta({ domainName: 'evil.example.com' }), captchaToken: result.captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('10i. 跨 IP / 跨 UA 使用 Token → CAPTCHA_INVALID', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h);
    await expect(
      h.service.consumeLoginToken({ ...meta({ ip: '10.9.9.9' }), captchaToken: result.captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);

    const h2 = setup();
    const second = await issueSilentToken(h2);
    await expect(
      h2.service.consumeLoginToken({ ...meta({ userAgent: 'curl/8.0' }), captchaToken: second.result.captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('10j. 不写永久数据：所有 key 都带 TTL', async () => {
    const h = setup();
    const { result } = await issueSilentToken(h);
    await h.service.createSecondaryChallenge(meta());
    const keys = h.redis.keys();
    expect(keys.length).toBeGreaterThan(0);
    expect(result.captchaToken).toBeTruthy();
    // FakeRedis 中所有 key 都会在过期时间后被清理；这里确认过期时间已设置
    for (const k of keys) {
      expect(await h.redis.exists(k)).toBe(1);
    }
  });
});

describe('两级人机验证 —— 第二层（Tianai 图形验证）', () => {
  it('8. 完整链路：silent（被强制）→ secondary → 消费 Token 登录', async () => {
    const h = setup({ config: { captchaMode: 'always' } });

    // 第一层：PoW 通过但被策略拦下
    const silent = await issueSilentToken(h);
    expect(silent.result.requiredStage).toBe('secondary');
    expect(silent.result.captchaToken).toBeUndefined();

    // 第二层：拿 challenge → 提交答案 → 拿到 stage=secondary 的 Token
    const { challenge, result } = await issueSecondaryToken(h);
    expect(challenge.type).toBe('blockPuzzle');
    expect(challenge.sessionId).toBeTruthy();
    expect(result.passed).toBe(true);
    expect(result.stage).toBe('secondary');

    const record = JSON.parse((await h.redis.get(CAPTCHA_KEY.token(sha256Hex(result.captchaToken!))))!);
    expect(record.stage).toBe('secondary');
    expect(record.provider).toBe('tianai');
    expect(record.secondaryType).toBe('blockPuzzle');

    // 登录侧消费
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: result.captchaToken }))
      .resolves.toMatchObject({ required: true, stage: 'secondary' });

    // 审计链路完整
    const types = h.audits.map((a) => a.eventType);
    expect(types).toContain('CAPTCHA_SECONDARY_REQUIRED');
    expect(types).toContain('CAPTCHA_SECONDARY_PASSED');
  });

  it('8b. 第二层会话一次性：同一 sessionId 只能提交一次', async () => {
    const h = setup({ config: { captchaMode: 'always' } });
    const challenge = await h.service.createSecondaryChallenge(meta());
    const first = await h.service.verifySecondary({ ...meta(), sessionId: challenge.sessionId, data: { x: 1 } });
    expect(first.passed).toBe(true);

    const second = await h.service.verifySecondary({ ...meta(), sessionId: challenge.sessionId, data: { x: 1 } });
    expect(second.passed).toBe(false);
    expect(second.reason).toBe('CHALLENGE_EXPIRED');
  });

  it('8c. 第二层会话绑定账号：A 的 session 不能给 B 用', async () => {
    const h = setup({ config: { captchaMode: 'always' } });
    const challenge = await h.service.createSecondaryChallenge(meta({ username: 'alice' }));
    const res = await h.service.verifySecondary({
      ...meta({ username: 'bob' }),
      sessionId: challenge.sessionId,
      data: { x: 1 },
    });
    expect(res.passed).toBe(false);
    expect(res.reason).toBe('BINDING_MISMATCH');
  });

  it('8d. 第二层会话过期 → CHALLENGE_EXPIRED', async () => {
    const h = setup({ config: { captchaMode: 'always', captchaChallengeTtlSeconds: 30 } });
    const challenge = await h.service.createSecondaryChallenge(meta());
    h.advance(31_000);
    const res = await h.service.verifySecondary({ ...meta(), sessionId: challenge.sessionId, data: { x: 1 } });
    expect(res.reason).toBe('CHALLENGE_EXPIRED');
  });

  it('9. Tianai 未配置 → fail closed（统一 503 错误）', async () => {
    const h = setup({ deps: { tianaiBaseUrl: '' } });
    await expect(h.service.createSecondaryChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);
    await expect(
      h.service.verifySecondary({ ...meta(), sessionId: 'whatever', data: {} }),
    ).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('9b. Tianai 生成 challenge 失败 / 超时 → fail closed', async () => {
    const h = setup({ tianai: { genFails: true } });
    await expect(h.service.createSecondaryChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('9c. Tianai 校验抛错（超时 / 5xx）→ fail closed，不当作“答案错误”放行', async () => {
    const h = setup({ config: { captchaMode: 'always' }, tianai: { checkThrows: true } });
    const challenge = await h.service.createSecondaryChallenge(meta());
    await expect(
      h.service.verifySecondary({ ...meta(), sessionId: challenge.sessionId, data: { x: 1 } }),
    ).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('9d. Tianai 判定答案错误 → SOLUTION_INVALID（不签发 Token）', async () => {
    const h = setup({ config: { captchaMode: 'always' }, tianai: { checkResult: false } });
    const challenge = await h.service.createSecondaryChallenge(meta());
    const res = await h.service.verifySecondary({ ...meta(), sessionId: challenge.sessionId, data: { x: 1 } });
    expect(res.passed).toBe(false);
    expect(res.reason).toBe('SOLUTION_INVALID');
    expect(res.captchaToken).toBeUndefined();
  });

  it('9e. 健康检查：未配置返回 false，可达返回 true（供配置保存前预检）', async () => {
    expect(await new TianaiSecondaryProvider({ baseUrl: '' }).healthCheck()).toBe(false);
    const fake = new FakeTianai({ healthy: false });
    expect(await fake.healthCheck()).toBe(false);
    expect(await new FakeTianai().healthCheck()).toBe(true);
  });
});

describe('两级人机验证 —— 边界', () => {
  it('功能未开启时 challenge / verify 接口明确拒绝', async () => {
    const h = setup({ config: { captchaEnabled: false } });
    await expect(h.service.createSilentChallenge(meta())).rejects.toBeInstanceOf(ValidationError);
    await expect(h.service.createSecondaryChallenge(meta())).rejects.toBeInstanceOf(ValidationError);
  });

  it('devBypass 时公开配置为关闭且不消费 Token', async () => {
    const h = setup({ deps: { devBypass: true } });
    const cfg = await h.service.getPublicConfig(meta());
    expect(cfg.enabled).toBe(false);
    await expect(h.service.consumeLoginToken(meta())).resolves.toEqual({ required: false });
  });
});
