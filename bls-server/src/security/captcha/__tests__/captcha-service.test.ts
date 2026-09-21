/**
 * 登录人机验证（ALTCHA）—— 服务端行为测试（内存 Redis + 官方库真实求解）
 *
 * 覆盖用户要求的场景：
 *   1  验证功能关闭
 *   2  invisible 静默验证成功
 *   3  ALTCHA payload 无效（结构 / 签名 / 解）
 *   4  challenge 过期 / challenge 一次性
 *   5  captchaToken 过期
 *   6  captchaToken 重复消费
 *   7  Token 与账号不匹配
 *   8  Token 与域名不匹配
 *   9  跨 IP 使用 Token
 *   10 登录失败达到阈值后要求可见验证
 *   11 Redis 不可用 → fail closed
 *   12 并发消费 Token 只能成功一次
 *   +  challenge 绑定不一致 / 无永久数据 / provider=tianai 未配置
 */
import { describe, it, expect } from 'vitest';
import { FakeRedis } from './fake-redis';
import { solveAltcha, encodePayload } from './altcha-helper';
import { CAPTCHA_KEY, CaptchaStore } from '../store';
import { CaptchaService, type CaptchaServiceDeps } from '../service';
import { createAltchaChallenge } from '../altcha';
import { sha256Hex } from '../crypto-utils';
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

function makeConfig(overrides: Partial<DynamicConfig> = {}): DynamicConfig {
  return {
    multiLogin: true,
    uploadLimitMB: 20,
    demoEnabled: false,
    appName: 'BLS-KOX',
    captchaEnabled: true,
    captchaMode: 'adaptive',
    captchaProvider: 'altcha',
    captchaChallengeTtlSeconds: 180,
    captchaTokenTtlSeconds: 120,
    captchaForceAfterFailures: 3,
    ...overrides,
  };
}

interface Harness {
  service: CaptchaService;
  store: CaptchaStore;
  redis: FakeRedis;
  audits: any[];
  advance(ms: number): void;
  setConfig(cfg: DynamicConfig): void;
}

function setup(opts: { config?: Partial<DynamicConfig>; deps?: Partial<CaptchaServiceDeps> } = {}): Harness {
  let clock = START;
  const redis = new FakeRedis(() => clock);
  const store = new CaptchaStore(() => redis);
  const audits: any[] = [];
  let config = makeConfig(opts.config);

  const service = new CaptchaService({
    store,
    getConfig: async () => config,
    risk: { getIpRisk: async () => ({ level: 'LOW' as any, score: 0 }) },
    now: () => clock,
    audit: async (input) => { audits.push(input); },
    devBypass: false,
    resolveTenant: async () => TENANT,
    isPrivilegedAccount: async () => false,
    hmacKey: HMAC_KEY,
    cost: TEST_COST,
    ...opts.deps,
  });

  return {
    service,
    store,
    redis,
    audits,
    advance: (ms) => { clock += ms; },
    setConfig: (cfg) => { config = cfg; },
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

/** 走完整个 invisible 流程并拿到一次性 captchaToken */
async function issueToken(h: Harness, over: Record<string, any> = {}) {
  const challenge: any = await h.service.createChallenge(meta(over));
  const payload = await solveAltcha(challenge);
  const result = await h.service.verifyPayload({ ...meta(over), payload, stage: 'invisible' });
  expect(result.passed).toBe(true);
  return { challenge, payload, captchaToken: result.captchaToken as string };
}

// ============================================================
describe('ALTCHA captcha —— 功能开关', () => {
  it('1. enabled=false → 不要求 captchaToken（保持原登录接口兼容）', async () => {
    const h = setup({ config: { captchaEnabled: false } });
    expect((await h.service.getPublicConfig(meta())).enabled).toBe(false);
    expect((await h.service.consumeLoginToken(meta())).required).toBe(false);
    await expect(h.service.createChallenge(meta())).rejects.toBeInstanceOf(ValidationError);
  });

  it('1b. mode=off → 同样视为关闭', async () => {
    const h = setup({ config: { captchaMode: 'off' } });
    expect((await h.service.getPublicConfig(meta())).enabled).toBe(false);
    expect((await h.service.consumeLoginToken(meta())).required).toBe(false);
  });

  it('1c. CAPTCHA_DEV_BYPASS → 关闭（仅开发环境可用）', async () => {
    const h = setup({ deps: { devBypass: true } });
    expect((await h.service.getPublicConfig(meta())).enabled).toBe(false);
    expect((await h.service.consumeLoginToken(meta())).required).toBe(false);
  });

  it('公开配置只含驱动 widget 所需的字段，且配置改动立即生效', async () => {
    const h = setup();
    const cfg = await h.service.getPublicConfig(meta());
    expect(Object.keys(cfg).sort()).toEqual(['challengeUrl', 'display', 'enabled', 'fieldName', 'mode', 'provider']);
    expect(cfg).toMatchObject({ enabled: true, mode: 'adaptive', provider: 'altcha', display: 'invisible' });
    expect(JSON.stringify(cfg)).not.toContain('forceAfterFailures');
    expect(JSON.stringify(cfg)).not.toContain('cost');
    expect(JSON.stringify(cfg)).not.toContain('Hmac');

    h.setConfig(makeConfig({ captchaEnabled: false }));
    expect((await h.service.getPublicConfig(meta())).enabled).toBe(false);

    h.setConfig(makeConfig({ captchaMode: 'always' }));
    expect((await h.service.getPublicConfig(meta())).display).toBe('visible');
  });
});

// ============================================================
describe('ALTCHA captcha —— invisible 静默验证', () => {
  it('2. 静默验证成功 → 签发一次性 captchaToken → 登录可消费一次', async () => {
    const h = setup();

    const challenge: any = await h.service.createChallenge(meta());
    // 服务端签发的 challenge：官方结构 + HMAC 签名 + 过期时间（客户端不可篡改）
    expect(challenge.parameters.algorithm).toBe('PBKDF2/SHA-256');
    expect(typeof challenge.signature).toBe('string');
    expect(challenge.parameters.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(challenge.parameters.data).toMatchObject({ tenantId: TENANT, display: 'invisible' });

    const payload = await solveAltcha(challenge);
    const result = await h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' });
    expect(result.passed).toBe(true);
    expect(result.captchaToken).toBeTruthy();

    const consumed = await h.service.consumeLoginToken({ ...meta(), captchaToken: result.captchaToken! });
    expect(consumed.required).toBe(true);
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_POW_PASSED')).toBe(true);
  });

  it('challenge 一次性：同一 payload 第二次提交被拒绝', async () => {
    const h = setup();
    const { payload } = await issueToken(h);
    const again = await h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' });
    expect(again.passed).toBe(false);
    expect(again.reason).toBe('CHALLENGE_EXPIRED');
  });

  it('challenge 与 username 绑定：换账号提交同一 payload → BINDING_MISMATCH', async () => {
    const h = setup();
    const challenge: any = await h.service.createChallenge(meta({ username: 'bob' }));
    const payload = await solveAltcha(challenge);
    const result = await h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('BINDING_MISMATCH');
  });
});

// ============================================================
describe('ALTCHA captcha —— payload 校验', () => {
  it('3a. 缺少 payload → PAYLOAD_MISSING', async () => {
    const h = setup();
    const result = await h.service.verifyPayload({ ...meta(), payload: undefined });
    expect(result).toMatchObject({ passed: false, reason: 'PAYLOAD_MISSING' });
  });

  it('3b. payload 非法 / 非 base64 → PAYLOAD_MALFORMED', async () => {
    const h = setup();
    for (const bad of ['not-base64!!', Buffer.from('{"a":1}').toString('base64'), encodePayload({ challenge: {} })]) {
      const result = await h.service.verifyPayload({ ...meta(), payload: bad });
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('PAYLOAD_MALFORMED');
    }
  });

  it('3c. challenge 签名被篡改（其它 HMAC 密钥签发）→ SIGNATURE_INVALID', async () => {
    const h = setup();
    const forged: any = await createAltchaChallenge({
      hmacKey: OTHER_HMAC_KEY,
      ttlSeconds: 180,
      cost: TEST_COST,
      data: { tenantId: TENANT, usernameHash: sha256Hex('admin'), display: 'invisible' },
    });
    await h.store.claimChallengeNonce(forged.parameters.nonce, 180);
    const payload = await solveAltcha(forged);
    const result = await h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' });
    expect(result).toMatchObject({ passed: false, reason: 'SIGNATURE_INVALID' });
  });

  it('3d. 解错误（counter / derivedKey 不匹配）→ SOLUTION_INVALID', async () => {
    const h = setup();
    const challenge: any = await h.service.createChallenge(meta());
    const payload = await solveAltcha(challenge);
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    decoded.solution.counter += 1; // derivedKey 与 counter 不再对应
    const tampered = encodePayload(decoded);
    const result = await h.service.verifyPayload({ ...meta(), payload: tampered, stage: 'invisible' });
    expect(result).toMatchObject({ passed: false, reason: 'SOLUTION_INVALID' });
  });

  it('4. challenge 过期 → CHALLENGE_EXPIRED', async () => {
    const h = setup();
    const expired: any = await createAltchaChallenge({
      hmacKey: HMAC_KEY,
      ttlSeconds: -5,
      cost: TEST_COST,
      data: { tenantId: TENANT, usernameHash: sha256Hex('admin'), display: 'invisible' },
    });
    await h.store.claimChallengeNonce(expired.parameters.nonce, 60);
    const payload = await solveAltcha(expired);
    const result = await h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' });
    expect(result).toMatchObject({ passed: false, reason: 'CHALLENGE_EXPIRED' });
  });
});

// ============================================================
describe('ALTCHA captcha —— captchaToken 生命周期', () => {
  it('5. captchaToken 过期 → CAPTCHA_EXPIRED', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    h.advance(121_000); // tokenTtlSeconds = 120
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken })).rejects.toBeInstanceOf(CaptchaExpiredError);
  });

  it('6. captchaToken 重复消费 → CAPTCHA_REPLAYED', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    await h.service.consumeLoginToken({ ...meta(), captchaToken });
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken })).rejects.toBeInstanceOf(CaptchaReplayedError);
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_TOKEN_REPLAYED')).toBe(true);
  });

  it('7. Token 与账号不匹配 → CAPTCHA_INVALID', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    await expect(
      h.service.consumeLoginToken({ ...meta({ username: 'someone-else' }), captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('8. Token 与域名不匹配 → CAPTCHA_INVALID', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    await expect(
      h.service.consumeLoginToken({ ...meta({ domainName: 'evil.example.com' }), captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('9. 跨 IP / 跨 UA 使用 Token → CAPTCHA_INVALID', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    await expect(
      h.service.consumeLoginToken({ ...meta({ ip: '10.9.9.9' }), captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);

    const h2 = setup();
    const second = await issueToken(h2);
    await expect(
      h2.service.consumeLoginToken({ ...meta({ userAgent: 'curl/8.0.1' }), captchaToken: second.captchaToken }),
    ).rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('缺少 captchaToken（功能开启时）→ CAPTCHA_REQUIRED', async () => {
    const h = setup();
    await expect(h.service.consumeLoginToken(meta())).rejects.toBeInstanceOf(CaptchaRequiredError);
  });

  it('12. 并发消费 Token 只能成功一次', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    const results = await Promise.allSettled([
      h.service.consumeLoginToken({ ...meta(), captchaToken }),
      h.service.consumeLoginToken({ ...meta(), captchaToken }),
      h.service.consumeLoginToken({ ...meta(), captchaToken }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.length).toBe(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(CaptchaReplayedError);
  });
});

// ============================================================
describe('ALTCHA captcha —— 可见验证升级', () => {
  it('10. 登录失败达到阈值 → 不再完全静默，要求可见 ALTCHA 组件', async () => {
    const h = setup({ config: { captchaForceAfterFailures: 3 } });
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());

    const cfg = await h.service.getPublicConfig(meta());
    expect(cfg.display).toBe('visible');
    expect(cfg.reason).toBe('ACCOUNT_FAILURES');

    // challenge 被标记为 visible（写入 HMAC 签名内的 data）
    const challenge: any = await h.service.createChallenge(meta());
    expect(challenge.parameters.data.display).toBe('visible');

    // 客户端仍以 invisible 提交 → 拒绝并要求可见交互
    const payload = await solveAltcha(challenge);
    const invisibleAttempt = await h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' });
    expect(invisibleAttempt).toMatchObject({ passed: false, requireVisible: true, reason: 'VISIBLE_REQUIRED' });
    expect(invisibleAttempt.captchaToken).toBeUndefined();

    // 切换为可见组件后重新验证 → 通过
    const challenge2: any = await h.service.createChallenge(meta());
    const payload2 = await solveAltcha(challenge2);
    const visibleAttempt = await h.service.verifyPayload({ ...meta(), payload: payload2, stage: 'visible' });
    expect(visibleAttempt.passed).toBe(true);
    expect(visibleAttempt.captchaToken).toBeTruthy();

    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_VISIBLE_REQUIRED')).toBe(true);
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_VISIBLE_PASSED')).toBe(true);
  });

  it('10b. mode=always → 始终可见；平台超管账号 → 可见', async () => {
    const always = setup({ config: { captchaMode: 'always' } });
    const cfg = await always.service.getPublicConfig(meta());
    expect(cfg).toMatchObject({ display: 'visible', reason: 'MODE_ALWAYS' });

    const priv = setup({ deps: { isPrivilegedAccount: async () => true } });
    expect((await priv.service.getPublicConfig(meta())).display).toBe('visible');
  });

  it('10c. 登录成功后可清零失败计数 → 回到静默', async () => {
    const h = setup();
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());
    expect((await h.service.getPublicConfig(meta())).display).toBe('visible');
    await h.service.resetLoginFailures(meta());
    expect((await h.service.getPublicConfig(meta())).display).toBe('invisible');
  });

  it('10d. IP 中高风险 / 多账号 → 可见', async () => {
    const risky = setup({ deps: { risk: { getIpRisk: async () => ({ level: 'HIGH' as any, score: 85 }) } } });
    expect((await risky.service.getPublicConfig(meta())).display).toBe('visible');

    const fanout = setup();
    for (const u of ['a', 'b', 'c']) {
      await fanout.service.createChallenge(meta({ username: u }));
    }
    expect((await fanout.service.getPublicConfig(meta({ username: 'c' }))).display).toBe('visible');
  });
});

// ============================================================
describe('ALTCHA captcha —— fail closed', () => {
  it('11. Redis 不可用 → 拒绝验证（不签发 Token、不放过登录）', async () => {
    const h = setup({ deps: { store: new CaptchaStore(() => null) } });
    await expect(h.service.createChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);

    // 使用结构完全合法的 payload：解码/绑定都通过，必须在校验 challenge 一次性时因 Redis 不可用而失败
    const valid: any = await createAltchaChallenge({
      hmacKey: HMAC_KEY,
      ttlSeconds: 180,
      cost: TEST_COST,
      data: { tenantId: TENANT, usernameHash: sha256Hex('admin'), display: 'invisible' },
    });
    const payload = await solveAltcha(valid);
    await expect(h.service.verifyPayload({ ...meta(), payload, stage: 'invisible' })).rejects.toBeInstanceOf(CaptchaUnavailableError);

    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: 'any' })).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('11b. Redis 命令异常 → 同样 fail closed', async () => {
    const broken = new FakeRedis();
    (broken as any).set = async () => { throw new Error('redis down'); };
    const h = setup({ deps: { store: new CaptchaStore(() => broken) } });
    await expect(h.service.createChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('11c. provider=tianai 但未配置独立服务 → fail closed', async () => {
    const h = setup({ config: { captchaProvider: 'tianai' }, deps: { tianaiBaseUrl: '' } });
    await expect(h.service.createChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: 'any' })).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });
});

// ============================================================
describe('ALTCHA captcha —— 资源保护', () => {
  it('challenge nonce / Token 均带 TTL，不产生永久数据', async () => {
    const h = setup();
    const challenge: any = await h.service.createChallenge(meta());
    const nonce = challenge.parameters.nonce;
    expect(await h.redis.has(CAPTCHA_KEY.challenge(nonce))).toBe(true);

    h.advance(181_000); // challengeTtlSeconds = 180
    expect(await h.redis.has(CAPTCHA_KEY.challenge(nonce))).toBe(false);

    const { captchaToken } = await issueToken(h);
    const tokenHash = sha256Hex(captchaToken);
    expect(await h.redis.has(CAPTCHA_KEY.token(tokenHash))).toBe(true);
    h.advance(121_000);
    expect(await h.redis.has(CAPTCHA_KEY.token(tokenHash))).toBe(false);
  });

  it('Redis 中绝不出现明文 Token（只存 sha256）', async () => {
    const h = setup();
    const { captchaToken } = await issueToken(h);
    const dump = JSON.stringify(h.redis.keys());
    expect(dump).not.toContain(captchaToken);
    expect(dump).toContain(sha256Hex(captchaToken));
  });
});
