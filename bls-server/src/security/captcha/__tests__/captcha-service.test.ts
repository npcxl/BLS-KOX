/**
 * 登录人机验证服务 —— 端到端（内存 Redis）测试
 *
 * 覆盖需求「九、测试」中的：
 *   1  功能关闭时保持原登录兼容                11 captchaToken 重复消费
 *   2  静默验证通过                            12 captchaToken 绑定账号不一致
 *   3  静默验证失败后进入第二层                13 captchaToken 绑定域名不一致
 *   4  always 模式直接进入第二层               14 跨 IP 使用 Token
 *   5  多次登录失败后强制第二层                15 Redis 不可用时拒绝验证
 *   6  slider 成功 / 失败 / 误差边界           16 并发请求只能有一个成功消费 Token
 *   7  rotate 成功 / 失败 / 误差边界           17 系统配置修改后立即生效
 *   8  challenge 过期                          18 日志中不包含答案 / 密码 / 轨迹 / 完整 Token
 *   9  challenge 超过最大尝试次数
 *   10 captchaToken 过期
 */
import { describe, it, expect } from 'vitest';
import { FakeRedis } from './fake-redis';
import { CAPTCHA_KEY, CaptchaStore } from '../store';
import { CaptchaService, type CaptchaServiceDeps } from '../service';
import { signCaptchaToken } from '../crypto-utils';
import { ROTATE_TOLERANCE_DEG, SLIDER_TOLERANCE_PX } from '../types';
import type { DynamicConfig } from '../../../config/dynamic-config';
import { CaptchaInvalidError, CaptchaReplayedError, CaptchaRequiredError, CaptchaUnavailableError, CaptchaExpiredError } from '../../../core/errors';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SECRET = 'unit-test-captcha-secret-0123456789abcdef';
const START = 1_700_000_000_000;

function makeConfig(overrides: Partial<DynamicConfig> = {}): DynamicConfig {
  return {
    multiLogin: true,
    uploadLimitMB: 20,
    demoEnabled: false,
    appName: 'BLS-KOX',
    captchaEnabled: true,
    captchaMode: 'adaptive',
    captchaSilentThreshold: 70,
    captchaForceAfterFailures: 3,
    captchaChallengeTtlSeconds: 180,
    captchaTokenTtlSeconds: 120,
    captchaSecondaryTypes: ['slider', 'rotate'],
    captchaMaxAttempts: 5,
    captchaProvider: 'builtin',
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
    resolveTenant: async () => 'T001',
    isPrivilegedAccount: async () => false,
    secret: SECRET,
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
    route: '/api/auth/captcha/test',
    method: 'POST',
    ...over,
  };
}

/** 典型人类鼠标行为摘要（静默通过） */
const humanSummary = {
  dwellMs: 2500,
  mouse: { count: 24, moves: 22, avgSpeed: 0.8, maxSpeed: 2.4, avgInterval: 45, stdInterval: 45 },
  focus: { blurCount: 0, visibilityChanges: 0, hiddenMs: 0 },
};

async function readChallenge(redis: FakeRedis, challengeId: string): Promise<any> {
  const raw = await redis.get(CAPTCHA_KEY.challenge(challengeId));
  return raw ? JSON.parse(raw) : null;
}

/** 走完静默验证并拿到一次性 captchaToken */
async function issueSilentToken(h: Harness) {
  const created = await h.service.createChallenge(meta());
  h.advance(2500);
  const result = await h.service.verifySilent({
    ...meta(),
    challengeId: created.challenge!.challengeId,
    nonce: created.challenge!.nonce,
    interactionSummary: humanSummary,
  });
  expect(result.passed).toBe(true);
  return (result as any).captchaToken as string;
}

// ============================================================
describe('captcha —— 功能开关与公开配置', () => {
  it('1. enabled=false → 登录接口不要求 captchaToken（保持原登录兼容）', async () => {
    const h = setup({ config: { captchaEnabled: false } });
    const r = await h.service.consumeLoginToken(meta());
    expect(r.required).toBe(false);
  });

  it('1b. mode=off → 同样视为关闭', async () => {
    const h = setup({ config: { captchaMode: 'off' } });
    expect((await h.service.consumeLoginToken(meta())).required).toBe(false);
    expect((await h.service.getPublicConfig('demo.example.com')).enabled).toBe(false);
  });

  it('17. 公开配置只返回 enabled / mode / secondaryTypes，且配置改动立即生效', async () => {
    const h = setup();
    const enabled = await h.service.getPublicConfig('demo.example.com');
    expect(Object.keys(enabled).sort()).toEqual(['enabled', 'mode', 'secondaryTypes']);
    expect(enabled.enabled).toBe(true);
    expect(JSON.stringify(enabled)).not.toContain('silentThreshold');
    expect(JSON.stringify(enabled)).not.toContain('forceAfterFailures');
    expect(JSON.stringify(enabled)).not.toContain('maxAttempts');

    h.setConfig(makeConfig({ captchaEnabled: false }));
    expect((await h.service.getPublicConfig('demo.example.com')).enabled).toBe(false);

    h.setConfig(makeConfig({ captchaMode: 'off' }));
    expect((await h.service.getPublicConfig('demo.example.com')).enabled).toBe(false);

    h.setConfig(makeConfig({ captchaMode: 'always' }));
    const pub = await h.service.getPublicConfig('demo.example.com');
    expect(pub.enabled).toBe(true);
    expect(pub.mode).toBe('always');
  });
});

// ============================================================
describe('captcha —— 第一层静默验证', () => {
  it('2. 静默验证通过 → 签发一次性 captchaToken → 登录可消费一次', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    expect(token).toBeTruthy();

    const consumed = await h.service.consumeLoginToken({ ...meta(), captchaToken: token });
    expect(consumed.required).toBe(true);

    // 审计：静默通过
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_SILENT_PASSED')).toBe(true);
  });

  it('3. 静默验证失败 → 进入第二层，且响应体不含答案', async () => {
    const h = setup();
    const created = await h.service.createChallenge(meta());
    h.advance(3000);
    const result = await h.service.verifySilent({
      ...meta(),
      challengeId: created.challenge!.challengeId,
      nonce: created.challenge!.nonce,
      interactionSummary: {}, // 无任何人类行为信号
    });

    expect(result.passed).toBe(false);
    const res = result as any;
    expect(res.nextStage).toBe('secondary');
    expect(res.secondaryChallenge.stage).toBe('secondary');
    expect(res.secondaryChallenge.payload).toBeTruthy();
    expect(res.secondaryChallenge.answer).toBeUndefined();
    expect(res.secondaryChallenge.payload.answer).toBeUndefined();
    expect(res.secondaryChallenge.payload.tolerance).toBeGreaterThan(0);

    // 答案只存在于 Redis
    const rec = await readChallenge(h.redis, res.secondaryChallenge.challengeId);
    expect(rec.answer).toBeTruthy();
    expect(rec.stage).toBe('secondary');

    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_SILENT_FAILED')).toBe(true);

    // 被策略强制时写入 CAPTCHA_SECONDARY_REQUIRED（此处用连续登录失败触发）
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());
    const c2 = await h.service.createChallenge(meta());
    h.advance(3000);
    const forced = await h.service.verifySilent({
      ...meta(),
      challengeId: c2.challenge!.challengeId,
      nonce: c2.challenge!.nonce,
      interactionSummary: humanSummary, // 行为完全正常，仍被强制
    });
    expect(forced.passed).toBe(false);
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')).toBe(true);
    expect(h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('ACCOUNT_FAILURES');
  });

  it('4. mode=always → challenge 直接返回二级验证', async () => {
    const h = setup({ config: { captchaMode: 'always' } });
    const created = await h.service.createChallenge(meta());
    expect(created.challenge!.stage).toBe('secondary');
    expect(created.challenge!.secondaryType).toBeTruthy();
  });

  it('5. 同一账号连续登录失败达到 forceAfterFailures → 即使行为正常也强制二级', async () => {
    const h = setup({ config: { captchaForceAfterFailures: 3 } });
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());

    const created = await h.service.createChallenge(meta());
    h.advance(3000);
    const result = await h.service.verifySilent({
      ...meta(),
      challengeId: created.challenge!.challengeId,
      nonce: created.challenge!.nonce,
      interactionSummary: humanSummary, // 人类行为完全正常
    });

    expect(result.passed).toBe(false);
    expect((result as any).nextStage).toBe('secondary');
    const audited = h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED');
    expect(audited?.reason).toBe('ACCOUNT_FAILURES');
  });

  it('5b. 登录成功后可清零失败计数', async () => {
    const h = setup();
    await h.service.recordLoginFailure(meta());
    await h.service.resetLoginFailures(meta());
    const created = await h.service.createChallenge(meta());
    h.advance(3000);
    const result = await h.service.verifySilent({
      ...meta(),
      challengeId: created.challenge!.challengeId,
      nonce: created.challenge!.nonce,
      interactionSummary: humanSummary,
    });
    expect(result.passed).toBe(true);
  });

  it('5c. nonce 被篡改（重放）→ 强制二级 + NONCE_REPLAY 审计', async () => {
    const h = setup();
    const created = await h.service.createChallenge(meta());
    h.advance(3000);
    const result = await h.service.verifySilent({
      ...meta(),
      challengeId: created.challenge!.challengeId,
      nonce: 'tampered-nonce-value',
      interactionSummary: humanSummary,
    });
    expect(result.passed).toBe(false);
    const audited = h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED');
    expect(audited?.reason).toBe('NONCE_REPLAY');
  });

  it('5d. IP 中高风险 / 平台超管账号 → 强制二级；客户端无法跳过', async () => {
    const risk = setup({ deps: { risk: { getIpRisk: async () => ({ level: 'HIGH' as any, score: 85 }) } } });
    const c1 = await risk.service.createChallenge(meta());
    risk.advance(3000);
    const r1 = await risk.service.verifySilent({
      ...meta(), challengeId: c1.challenge!.challengeId, nonce: c1.challenge!.nonce, interactionSummary: humanSummary,
    });
    expect(r1.passed).toBe(false);
    expect(risk.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('IP_RISK_HIGH');

    const priv = setup({ deps: { isPrivilegedAccount: async () => true } });
    const c2 = await priv.service.createChallenge(meta());
    priv.advance(3000);
    const r2 = await priv.service.verifySilent({
      ...meta(), challengeId: c2.challenge!.challengeId, nonce: c2.challenge!.nonce, interactionSummary: humanSummary,
    });
    expect(r2.passed).toBe(false);
    expect(priv.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('PRIVILEGED_ACCOUNT');
  });

  it('5e. 设备 / 账号绑定不一致（换 IP 或换账号）→ 强制二级', async () => {
    const h = setup();
    const created = await h.service.createChallenge(meta());
    h.advance(3000);
    const result = await h.service.verifySilent({
      ...meta({ ip: '10.9.9.9' }),
      challengeId: created.challenge!.challengeId,
      nonce: created.challenge!.nonce,
      interactionSummary: humanSummary,
    });
    expect(result.passed).toBe(false);
  });

  it('8. challenge 过期 → 不通过并进入第二层（CHALLENGE_EXPIRED）', async () => {
    const h = setup();
    const created = await h.service.createChallenge(meta());
    // 手工写入一条已过期的 challenge（TTL 更长，确保能读到「过期」而不是「不存在」）
    const rec = await readChallenge(h.redis, created.challenge!.challengeId);
    rec.expiresAt = START - 1_000;
    await h.store.saveChallenge(rec, 600);

    const result = await h.service.verifySilent({
      ...meta(),
      challengeId: created.challenge!.challengeId,
      nonce: created.challenge!.nonce,
      interactionSummary: humanSummary,
    });
    expect(result.passed).toBe(false);
    expect(h.audits.find((a) => a.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.reason).toBe('CHALLENGE_EXPIRED');
  });
});

// ============================================================
describe('captcha —— 第二层 slider', () => {
  it('6. slider 成功 / 失败 / 误差边界', async () => {
    const h = setup({ config: { captchaSecondaryTypes: ['slider'] } });

    // --- 成功 ---
    const ok = await h.service.createChallenge(meta(), 'secondary');
    expect(ok.challenge!.secondaryType).toBe('slider');
    const okRec = await readChallenge(h.redis, ok.challenge!.challengeId);
    const okPay = await h.service.verifySecondary({
      ...meta(), challengeId: ok.challenge!.challengeId, answer: { x: okRec.answer.x },
    });
    expect(okPay.passed).toBe(true);
    expect((okPay as any).captchaToken).toBeTruthy();
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_SECONDARY_PASSED')).toBe(true);

    // --- 失败 ---
    const bad = await h.service.createChallenge(meta(), 'secondary');
    const badRec = await readChallenge(h.redis, bad.challenge!.challengeId);
    const badPay = await h.service.verifySecondary({
      ...meta(), challengeId: bad.challenge!.challengeId, answer: { x: badRec.answer.x + 60 },
    });
    expect(badPay.passed).toBe(false);
    expect((badPay as any).reason).toBe('ANSWER_MISMATCH');
    expect((badPay as any).retryable).toBe(true);

    // --- 误差边界：恰好 tolerance 通过 ---
    const edgeOk = await h.service.createChallenge(meta(), 'secondary');
    const edgeOkRec = await readChallenge(h.redis, edgeOk.challenge!.challengeId);
    const edgeOkPay = await h.service.verifySecondary({
      ...meta(), challengeId: edgeOk.challenge!.challengeId, answer: { x: edgeOkRec.answer.x + SLIDER_TOLERANCE_PX },
    });
    expect(edgeOkPay.passed).toBe(true);

    // --- 误差边界：超出 1px 失败 ---
    const edgeBad = await h.service.createChallenge(meta(), 'secondary');
    const edgeBadRec = await readChallenge(h.redis, edgeBad.challenge!.challengeId);
    const edgeBadPay = await h.service.verifySecondary({
      ...meta(), challengeId: edgeBad.challenge!.challengeId, answer: { x: edgeBadRec.answer.x + SLIDER_TOLERANCE_PX + 1 },
    });
    expect(edgeBadPay.passed).toBe(false);
  });

  it('9. 同一 challenge 超过 maxAttempts 立即失效（即使答案正确）', async () => {
    const h = setup({ config: { captchaSecondaryTypes: ['slider'], captchaMaxAttempts: 3 } });
    const created = await h.service.createChallenge(meta(), 'secondary');
    const id = created.challenge!.challengeId;
    const rec = await readChallenge(h.redis, id);

    for (let i = 1; i <= 3; i++) {
      const r = await h.service.verifySecondary({ ...meta(), challengeId: id, answer: { x: rec.answer.x + 90 } });
      expect(r.passed).toBe(false);
      expect((r as any).reason).toBe('ANSWER_MISMATCH');
      expect((r as any).retryable).toBe(i < 3);
    }

    // 第 4 次：超过上限，直接失效（正确答案也不再校验）
    const r4 = await h.service.verifySecondary({ ...meta(), challengeId: id, answer: { x: rec.answer.x } });
    expect((r4 as any).reason).toBe('MAX_ATTEMPTS');
    expect((r4 as any).retryable).toBe(false);
    expect(await h.redis.has(CAPTCHA_KEY.challenge(id))).toBe(false);
  });
});

// ============================================================
describe('captcha —— 第二层 rotate', () => {
  it('7. rotate 成功 / 失败 / 误差边界', async () => {
    const h = setup({ config: { captchaSecondaryTypes: ['rotate'] } });

    const ok = await h.service.createChallenge(meta(), 'secondary');
    expect(ok.challenge!.secondaryType).toBe('rotate');
    const okRec = await readChallenge(h.redis, ok.challenge!.challengeId);
    expect(typeof okRec.answer.angle).toBe('number');
    const okPay = await h.service.verifySecondary({
      ...meta(), challengeId: ok.challenge!.challengeId, answer: { angle: -okRec.answer.angle },
    });
    expect(okPay.passed).toBe(true);

    const bad = await h.service.createChallenge(meta(), 'secondary');
    const badRec = await readChallenge(h.redis, bad.challenge!.challengeId);
    const badPay = await h.service.verifySecondary({
      ...meta(), challengeId: bad.challenge!.challengeId, answer: { angle: -badRec.answer.angle + 60 },
    });
    expect(badPay.passed).toBe(false);
    expect((badPay as any).reason).toBe('ANSWER_MISMATCH');

    // 边界：恰好 tolerance 通过
    const edgeOk = await h.service.createChallenge(meta(), 'secondary');
    const edgeOkRec = await readChallenge(h.redis, edgeOk.challenge!.challengeId);
    const edgeOkPay = await h.service.verifySecondary({
      ...meta(), challengeId: edgeOk.challenge!.challengeId, answer: { angle: -edgeOkRec.answer.angle + ROTATE_TOLERANCE_DEG },
    });
    expect(edgeOkPay.passed).toBe(true);

    // 边界：超出 1° 失败
    const edgeBad = await h.service.createChallenge(meta(), 'secondary');
    const edgeBadRec = await readChallenge(h.redis, edgeBad.challenge!.challengeId);
    const edgeBadPay = await h.service.verifySecondary({
      ...meta(), challengeId: edgeBad.challenge!.challengeId, answer: { angle: -edgeBadRec.answer.angle + ROTATE_TOLERANCE_DEG + 1 },
    });
    expect(edgeBadPay.passed).toBe(false);
  });

  it('rotate 支持键盘操作声明（无障碍替代路径）', async () => {
    const h = setup({ config: { captchaSecondaryTypes: ['rotate'] } });
    const created = await h.service.createChallenge(meta(), 'secondary');
    expect(created.challenge!.payload?.keyboardHint).toBeTruthy();
    expect(created.challenge!.payload?.keyboardStep).toBeGreaterThan(0);
  });
});

// ============================================================
describe('captcha —— captchaToken', () => {
  it('10. captchaToken 过期 → CAPTCHA_EXPIRED', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    h.advance(121_000); // tokenTtlSeconds = 120
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: token }))
      .rejects.toBeInstanceOf(CaptchaExpiredError);
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_TOKEN_INVALID' && a.reason === 'EXPIRED')).toBe(true);
  });

  it('11. captchaToken 重复消费 → CAPTCHA_REPLAYED', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    await h.service.consumeLoginToken({ ...meta(), captchaToken: token });
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: token }))
      .rejects.toBeInstanceOf(CaptchaReplayedError);
    expect(h.audits.some((a) => a.eventType === 'CAPTCHA_TOKEN_REPLAYED')).toBe(true);
  });

  it('12. captchaToken 绑定账号不一致 → CAPTCHA_INVALID', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    await expect(h.service.consumeLoginToken({ ...meta({ username: 'someone-else' }), captchaToken: token }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('13. captchaToken 绑定域名不一致 → CAPTCHA_INVALID', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    await expect(h.service.consumeLoginToken({ ...meta({ domainName: 'evil.example.com' }), captchaToken: token }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('14. 跨 IP 使用 Token → CAPTCHA_INVALID', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    await expect(h.service.consumeLoginToken({ ...meta({ ip: '10.9.9.9' }), captchaToken: token }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('14b. 伪造 / 篡改签名的 Token → CAPTCHA_INVALID', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    const forged = token.split('.')[0] + '.AAAA';
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: forged }))
      .rejects.toBeInstanceOf(CaptchaInvalidError);
  });

  it('14c. 缺少 captchaToken（功能开启时）→ CAPTCHA_REQUIRED', async () => {
    const h = setup();
    await expect(h.service.consumeLoginToken(meta())).rejects.toBeInstanceOf(CaptchaRequiredError);
  });

  it('16. 并发消费只有一个成功，其余为 REPLAYED', async () => {
    const h = setup();
    const token = await issueSilentToken(h);
    const results = await Promise.allSettled([
      h.service.consumeLoginToken({ ...meta(), captchaToken: token }),
      h.service.consumeLoginToken({ ...meta(), captchaToken: token }),
      h.service.consumeLoginToken({ ...meta(), captchaToken: token }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(CaptchaReplayedError);
  });
});

// ============================================================
describe('captcha —— 失败关闭与审计安全', () => {
  it('15. Redis 不可用 → 拒绝验证（fail closed，绝不绕过）', async () => {
    const h = setup({ deps: { store: new CaptchaStore(() => null) } });
    await expect(h.service.createChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);

    // 即使签名合法，Redis 不可用时也必须拒绝（而不是放行）
    const signed = signCaptchaToken({ v: 1, c: 'cid', t: 'T001', e: Math.floor(START / 1000) + 600 }, SECRET);
    await expect(h.service.consumeLoginToken({ ...meta(), captchaToken: signed }))
      .rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('15b. Redis 命令异常 → 同样 fail closed', async () => {
    const broken = new FakeRedis();
    (broken as any).set = async () => { throw new Error('redis down'); };
    const h = setup({ deps: { store: new CaptchaStore(() => broken) } });
    await expect(h.service.createChallenge(meta())).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('18. 审计只包含允许的字段，且不含答案 / 密码 / 轨迹 / 完整 Token', async () => {
    const h = setup({ config: { captchaSecondaryTypes: ['slider'] } });
    const token = await issueSilentToken(h);

    // 制造一次二级失败
    const c = await h.service.createChallenge(meta(), 'secondary');
    const rec = await readChallenge(h.redis, c.challenge!.challengeId);
    await h.service.verifySecondary({ ...meta(), challengeId: c.challenge!.challengeId, answer: { x: rec.answer.x + 100 } });
    await h.service.consumeLoginToken({ ...meta(), captchaToken: token });

    const dump = JSON.stringify(h.audits);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain('password');
    expect(dump).not.toContain('p@ssw0rd');

    const allowed = new Set([
      'eventType', 'riskLevel', 'challengeId', 'stage', 'secondaryType', 'score',
      'reason', 'tenantId', 'usernameHash', 'ipHash', 'clientIp', 'userAgent',
      'requestId', 'route', 'method',
    ]);
    for (const a of h.audits) {
      for (const key of Object.keys(a)) expect(allowed.has(key)).toBe(true);
    }
    // 明确不保存：答案 / 完整轨迹 / 用户名明文
    expect(dump).not.toContain('"answer"');
    expect(dump).not.toContain('interactionSummary');
    expect(dump).not.toContain('"admin"');
  });
});

// ============================================================
describe('captcha —— 频率与资源保护', () => {
  it('challenge / 图片均带 TTL，不创建永久数据', async () => {
    const h = setup({ config: { captchaSecondaryTypes: ['slider'] } });
    const c = await h.service.createChallenge(meta(), 'secondary');
    expect(await h.redis.has(CAPTCHA_KEY.challenge(c.challenge!.challengeId))).toBe(true);
    expect(await h.redis.has(CAPTCHA_KEY.attempts(c.challenge!.challengeId))).toBe(false);

    // 超过 challenge TTL 后全部自动消失
    h.advance(181_000);
    expect(await h.redis.has(CAPTCHA_KEY.challenge(c.challenge!.challengeId))).toBe(false);
    expect(await h.store.getImage('nonexistent')).toBeNull();
  });

  it('图片接口只按 imageId 取，非法 id 直接返回 null', async () => {
    const h = setup();
    expect(await h.service.getImage('')).toBeNull();
    expect(await h.service.getImage('x'.repeat(200))).toBeNull();
    expect(await h.service.getImage('not-exists')).toBeNull();
  });
});
