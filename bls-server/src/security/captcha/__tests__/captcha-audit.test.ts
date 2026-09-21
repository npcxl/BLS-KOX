/**
 * 安全审计负载测试（两级人机验证）
 *
 * 直接拦截 `writeSecurityLog`，断言真实写入的 detail 只包含：
 *   stage / provider / secondaryType / failureReason / tenantId / usernameHash / ipHash / requestId
 * 并断言**绝不**包含：ALTCHA HMAC 密钥、完整 payload、完整 captchaToken、明文用户名、上游答案数据。
 * 同时断言内部风控原因（如 PRIVILEGED_ACCOUNT）**只出现在审计**，不出现在公开响应里。
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
import { solveAltcha, encodePayload } from './altcha-helper';
import { CaptchaStore } from '../store';
import { CaptchaService } from '../service';
import { TianaiSecondaryProvider } from '../providers/tianai-provider';
import type { CaptchaSecondaryType, DynamicConfig } from '../../../config/dynamic-config';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HMAC_KEY = 'audit-test-altcha-hmac-key-0123456789abcdef';
const TEST_COST = 200;
const TENANT = 'T001';

function makeConfig(overrides: Partial<DynamicConfig> = {}): DynamicConfig {
  return {
    multiLogin: true, uploadLimitMB: 20, demoEnabled: false, appName: 'BLS-KOX',
    captchaEnabled: true, captchaMode: 'adaptive',
    captchaPrimaryProvider: 'altcha', captchaSecondaryProvider: 'tianai', captchaSecondaryType: 'blockPuzzle',
    captchaChallengeTtlSeconds: 180, captchaTokenTtlSeconds: 120, captchaForceAfterFailures: 3,
    ...overrides,
  };
}

/** 第二层 adapter 替身（不发真实网络请求） */
class StubTianai extends TianaiSecondaryProvider {
  constructor() { super({ baseUrl: 'https://tianai.test' }); }
  override get configured() { return true; }
  override async healthCheck() { return true; }
  override async createChallenge(type: CaptchaSecondaryType) {
    return { upstreamId: 'up-1', type, payload: { backgroundImage: 'data:image/png;base64,AAAA', width: 320, height: 160 } };
  }
  override async verify() { return true; }
}

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

function build(overrides: Partial<DynamicConfig> = {}, privileged = false) {
  const redis = new FakeRedis(() => 1_700_000_000_000);
  const service = new CaptchaService({
    store: new CaptchaStore(() => redis),
    getConfig: async () => makeConfig(overrides),
    risk: { getIpRisk: async () => ({ level: 'LOW' as any, score: 0 }) },
    now: () => 1_700_000_000_000,
    devBypass: false,
    resolveTenant: async () => TENANT,
    isPrivilegedAccount: async () => privileged,
    hmacKey: HMAC_KEY,
    cost: TEST_COST,
    tianaiBaseUrl: 'https://tianai.test',
    tianaiProvider: new StubTianai(),
  });
  return { service, redis };
}

describe('两级人机验证 — 安全审计负载', () => {
  beforeEach(() => { captured.logs.length = 0; });

  it('事件类型齐全，detail 字段受限，且不含密钥 / 完整 payload / 完整 Token', async () => {
    const h = build();

    // 1) 第一层静默通过
    const challenge: any = await h.service.createSilentChallenge(meta());
    const payload = await solveAltcha(challenge);
    const pass = await h.service.verifySilent({ ...meta(), payload });
    expect(pass.passed).toBe(true);
    const token = pass.captchaToken as string;

    // 2) PoW 失败（结构非法）
    await h.service.verifySilent({ ...meta(), payload: 'not-a-payload' });

    // 3) 策略要求第二层（超管）+ 通过
    const h2 = build({ captchaMode: 'always' }, true);
    const c2: any = await h2.service.createSilentChallenge(meta());
    const p2 = await solveAltcha(c2);
    const required = await h2.service.verifySilent({ ...meta(), payload: p2 });
    expect(required.requiredStage).toBe('secondary');

    const sc = await h2.service.createSecondaryChallenge(meta());
    const secondaryPass = await h2.service.verifySecondary({ ...meta(), sessionId: sc.sessionId, data: { x: 1, y: 2 } });
    expect(secondaryPass.passed).toBe(true);

    // 4) Token 重放
    await h.service.consumeLoginToken({ ...meta(), captchaToken: token });
    await h.service.consumeLoginToken({ ...meta(), captchaToken: token }).catch(() => { /* expected */ });

    const types = captured.logs.map((l) => l.eventType);
    expect(types).toContain('CAPTCHA_POW_PASSED');
    expect(types).toContain('CAPTCHA_POW_FAILED');
    expect(types).toContain('CAPTCHA_SECONDARY_REQUIRED');
    expect(types).toContain('CAPTCHA_SECONDARY_PASSED');
    expect(types).toContain('CAPTCHA_TOKEN_REPLAYED');

    const ALLOWED_DETAIL_KEYS = new Set([
      'stage', 'provider', 'secondaryType', 'failureReason', 'tenantId', 'usernameHash', 'ipHash', 'requestId',
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

    // 全量日志中不得出现：HMAC 密钥 / 完整 payload / 完整 Token / 明文用户名 / 上游答案
    const dump = JSON.stringify(captured.logs);
    expect(dump).not.toContain(HMAC_KEY);
    expect(dump).not.toContain(payload);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain('"admin"');
    expect(dump).not.toContain('derivedKey');
    expect(dump).not.toContain('solution');
    expect(dump).not.toContain('signature');
    expect(dump).not.toContain('"x":1');
  });

  it('内部风控原因只写审计，不出现在公开响应里', async () => {
    const h = build({}, true);
    const cfg: any = await h.service.getPublicConfig(meta());
    expect(cfg.requiredStage).toBe('secondary');
    expect(JSON.stringify(cfg)).not.toContain('PRIVILEGED_ACCOUNT');
    expect(captured.logs.length).toBe(0); // 读取配置不写审计

    const challenge: any = await h.service.createSilentChallenge(meta());
    const payload = await solveAltcha(challenge);
    const res: any = await h.service.verifySilent({ ...meta(), payload });
    expect(res.reason).toBe('SECONDARY_REQUIRED');
    expect(JSON.stringify(res)).not.toContain('PRIVILEGED_ACCOUNT');
    expect(captured.logs.find((l) => l.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.detail.failureReason)
      .toBe('PRIVILEGED_ACCOUNT');
  });

  it('失败原因使用枚举值，并记录 stage / provider / hashes', async () => {
    const h = build();
    await h.service.verifySilent({ ...meta(), payload: encodePayload({ challenge: {} }) });

    const failed = captured.logs.find((l) => l.eventType === 'CAPTCHA_POW_FAILED');
    expect(failed?.detail.failureReason).toBe('PAYLOAD_MALFORMED');
    expect(failed?.detail.tenantId).toBe(TENANT);
    expect(failed?.detail.provider).toBe('altcha');
    expect(failed?.detail.stage).toBe('silent');
    expect(typeof failed?.detail.usernameHash).toBe('string');
    expect(typeof failed?.detail.ipHash).toBe('string');
    expect(failed?.detail.requestId).toBe('req-1');
  });

  it('第二层审计记录 stage=secondary / provider=tianai / secondaryType', async () => {
    const h = build({ captchaMode: 'always' });
    const sc = await h.service.createSecondaryChallenge(meta());
    await h.service.verifySecondary({ ...meta(), sessionId: sc.sessionId, data: { x: 1 } });

    const passed = captured.logs.find((l) => l.eventType === 'CAPTCHA_SECONDARY_PASSED');
    expect(passed?.detail.stage).toBe('secondary');
    expect(passed?.detail.provider).toBe('tianai');
    expect(passed?.detail.secondaryType).toBe('blockPuzzle');
  });
});
