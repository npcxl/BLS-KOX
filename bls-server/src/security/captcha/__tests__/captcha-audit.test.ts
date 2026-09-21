/**
 * 安全审计事件负载测试
 *
 * 直接拦截 `writeSecurityLog`，断言真实写入的 detail 只包含：
 *   challengeId / 验证类型 / 风险分数 / 失败原因枚举 / tenantId / usernameHash / IP hash / requestId
 * 并断言绝不包含：答案、密码、完整行为轨迹、完整 Token。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const captured = vi.hoisted(() => ({ logs: [] as any[] }));

vi.mock('../../../core/security-audit', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    writeSecurityLog: async (input: any) => { captured.logs.push(input); },
  };
});

import { FakeRedis } from './fake-redis';
import { CAPTCHA_KEY, CaptchaStore } from '../store';
import { CaptchaService } from '../service';
import type { DynamicConfig } from '../../../config/dynamic-config';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SECRET = 'audit-test-captcha-secret-0123456789abcdef';

function makeConfig(overrides: Partial<DynamicConfig> = {}): DynamicConfig {
  return {
    multiLogin: true, uploadLimitMB: 20, demoEnabled: false, appName: 'BLS-KOX',
    captchaEnabled: true, captchaMode: 'adaptive', captchaSilentThreshold: 70,
    captchaForceAfterFailures: 3, captchaChallengeTtlSeconds: 180, captchaTokenTtlSeconds: 120,
    captchaSecondaryTypes: ['slider'], captchaMaxAttempts: 5, captchaProvider: 'builtin',
    ...overrides,
  };
}

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

function build() {
  let clock = 1_700_000_000_000;
  const redis = new FakeRedis(() => clock);
  const service = new CaptchaService({
    store: new CaptchaStore(() => redis),
    getConfig: async () => makeConfig(),
    risk: { getIpRisk: async () => ({ level: 'LOW' as any, score: 0 }) },
    now: () => clock,
    devBypass: false,
    resolveTenant: async () => 'T001',
    isPrivilegedAccount: async () => false,
    secret: SECRET,
  });
  return { service, redis, advance: (ms: number) => { clock += ms; } };
}

describe('captcha — 安全审计负载', () => {
  beforeEach(() => { captured.logs.length = 0; });

  it('静默通过 / 静默失败 / 二级通过 / 二级失败 / Token 重放 事件类型齐全且负载受限', async () => {
    const h = build();

    // 1) 静默通过
    const c1 = await h.service.createChallenge(meta());
    h.advance(2500);
    const pass = await h.service.verifySilent({
      ...meta(),
      challengeId: c1.challenge!.challengeId,
      nonce: c1.challenge!.nonce,
      interactionSummary: { dwellMs: 2500, mouse: { count: 24, avgSpeed: 0.8, stdInterval: 45 }, focus: { blurCount: 0 } },
    });
    expect(pass.passed).toBe(true);
    const token = (pass as any).captchaToken as string;

    // 2) 静默失败 → 二级
    const c2 = await h.service.createChallenge(meta());
    h.advance(2500);
    const silentFail = await h.service.verifySilent({
      ...meta(), challengeId: c2.challenge!.challengeId, nonce: c2.challenge!.nonce, interactionSummary: {},
    });
    expect(silentFail.passed).toBe(false);

    // 2b) 被强制（连续登录失败）→ CAPTCHA_SECONDARY_REQUIRED
    for (let i = 0; i < 3; i++) await h.service.recordLoginFailure(meta());
    const c2b = await h.service.createChallenge(meta());
    h.advance(2500);
    const forced = await h.service.verifySilent({
      ...meta(),
      challengeId: c2b.challenge!.challengeId,
      nonce: c2b.challenge!.nonce,
      interactionSummary: { dwellMs: 2500, mouse: { count: 24, stdInterval: 45 } },
    });
    expect(forced.passed).toBe(false);

    // 3) 二级失败
    const c3 = await h.service.createChallenge(meta(), 'secondary');
    const raw = await h.redis.get(CAPTCHA_KEY.challenge(c3.challenge!.challengeId));
    const rec = JSON.parse(raw!);
    await h.service.verifySecondary({ ...meta(), challengeId: c3.challenge!.challengeId, answer: { x: rec.answer.x + 99 } });

    // 4) 二级通过
    const c4 = await h.service.createChallenge(meta(), 'secondary');
    const raw4 = await h.redis.get(CAPTCHA_KEY.challenge(c4.challenge!.challengeId));
    const rec4 = JSON.parse(raw4!);
    const secPass = await h.service.verifySecondary({ ...meta(), challengeId: c4.challenge!.challengeId, answer: { x: rec4.answer.x } });
    expect(secPass.passed).toBe(true);

    // 5) Token 重放
    await h.service.consumeLoginToken({ ...meta(), captchaToken: token });
    await h.service.consumeLoginToken({ ...meta(), captchaToken: token }).catch(() => { /* expected */ });

    const types = captured.logs.map((l) => l.eventType);
    expect(types).toContain('CAPTCHA_SILENT_PASSED');
    expect(types).toContain('CAPTCHA_SILENT_FAILED');
    expect(types).toContain('CAPTCHA_SECONDARY_REQUIRED');
    expect(types).toContain('CAPTCHA_SECONDARY_PASSED');
    expect(types).toContain('CAPTCHA_SECONDARY_FAILED');
    expect(types).toContain('CAPTCHA_TOKEN_REPLAYED');

    const ALLOWED_DETAIL_KEYS = new Set([
      'challengeId', 'stage', 'secondaryType', 'riskScore', 'failureReason',
      'tenantId', 'usernameHash', 'ipHash', 'requestId',
    ]);

    for (const log of captured.logs) {
      expect(log.source).toBe('captcha');
      expect(typeof log.title).toBe('string');
      const detail = log.detail ?? {};
      for (const key of Object.keys(detail)) {
        expect(ALLOWED_DETAIL_KEYS.has(key)).toBe(true);
      }
      // actor 中不允许出现明文 username
      expect((log.actor ?? {}).username).toBeUndefined();
    }

    // 全量 payload 中不得出现完整 Token / 密钥 / 密码 / 答案 / 轨迹
    const dump = JSON.stringify(captured.logs);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain('password');
    expect(dump).not.toContain('"answer"');
    expect(dump).not.toContain('interactionSummary');
    expect(dump).not.toContain('stdInterval');
    expect(dump).not.toContain('mouse');
  });

  it('失败原因使用枚举值（ACCOUNT_FAILURES / ANSWER_MISMATCH / MAX_ATTEMPTS …）', async () => {
    const h = build();
    await h.service.recordLoginFailure(meta());
    await h.service.recordLoginFailure(meta());
    await h.service.recordLoginFailure(meta());

    const c = await h.service.createChallenge(meta());
    h.advance(2500);
    await h.service.verifySilent({
      ...meta(),
      challengeId: c.challenge!.challengeId,
      nonce: c.challenge!.nonce,
      interactionSummary: { dwellMs: 2500, mouse: { count: 24, stdInterval: 45 } },
    });

    const forced = captured.logs.find((l) => l.eventType === 'CAPTCHA_SECONDARY_REQUIRED');
    expect(forced?.detail.failureReason).toBe('ACCOUNT_FAILURES');
    expect(forced?.detail.tenantId).toBe('T001');
    expect(typeof forced?.detail.usernameHash).toBe('string');
    expect(typeof forced?.detail.ipHash).toBe('string');
    expect(typeof forced?.detail.challengeId).toBe('string');
    expect(forced?.detail.requestId).toBe('req-1');
  });
});
