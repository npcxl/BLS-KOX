/**
 * 安全审计负载测试（两级人机验证 + 统一 captchaTicket）
 *
 * 直接拦截 `writeSecurityLog`，断言真实写入的 detail 只包含：
 *   provider / scene / secondaryType / failureReason / tenantId / usernameHash / ipHash / requestId
 * 并断言**绝不**包含：ALTCHA HMAC 密钥、完整 payload、完整 captchaTicket、明文用户名、
 * escalation grant、上游答案数据。
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
import { CaptchaTicketService } from '../ticket-service';
import type { DynamicConfig } from '../../../config/dynamic-config';
import type {
  CaptchaChallengeResult,
  CaptchaGenerateInput,
  CaptchaProviderAdapter,
  CaptchaVerifyInput,
  CaptchaVerifyResult,
} from '../providers/types';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HMAC_KEY = 'audit-test-altcha-hmac-key-0123456789abcdef';
const TEST_COST = 200;
const TENANT = 'T001';

function makeConfig(overrides: Partial<DynamicConfig> = {}): DynamicConfig {
  return {
    multiLogin: true, uploadLimitMB: 20, demoEnabled: false, appName: 'BLS-KOX',
    loginCaptchaEnabled: true,
    captchaPrimaryProvider: 'ALTCHA', captchaFallbackProvider: 'TIANAI',
    captchaTicketTtl: 120, captchaTianaiEnabled: true,
    captchaChallengeTtlSeconds: 180, captchaForceAfterFailures: 3,
    captchaSecondaryType: 'blockPuzzle',
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
    route: '/api/captcha/verify',
    method: 'POST',
    ...over,
  };
}

const CLOCK = 1_700_000_000_000;

/** 第二层 adapter 替身：默认通过，可切换为技术故障 */
class StubTianai implements CaptchaProviderAdapter {
  readonly name = 'TIANAI' as const;
  verdict: 'passed' | 'failed' | 'technical_error' = 'passed';
  private genCount = 0;

  isAvailable() { return true; }

  async generate(_input: CaptchaGenerateInput): Promise<CaptchaChallengeResult> {
    this.genCount++;
    return {
      provider: 'TIANAI',
      challenge: {
        id: `up-${this.genCount}`,
        type: 'SLIDER',
        backgroundImage: 'data:image/jpeg;base64,AAAA',
        templateImage: 'data:image/png;base64,BBBB',
        backgroundImageWidth: 600,
        backgroundImageHeight: 300,
        templateImageWidth: 120,
        templateImageHeight: 300,
      },
      sessionId: `sess-${this.genCount}`,
      expiresAt: CLOCK + 180_000,
    };
  }

  async verify(_input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
    if (this.verdict === 'technical_error') {
      return { status: 'technical_error', provider: 'TIANAI', technicalReason: 'UPSTREAM_TIMEOUT' };
    }
    if (this.verdict === 'failed') {
      return { status: 'failed', provider: 'TIANAI', reason: 'SOLUTION_INVALID' };
    }
    return { status: 'passed', provider: 'TIANAI' };
  }
}

function build(overrides: Partial<DynamicConfig> = {}, privileged = false) {
  const redis = new FakeRedis(() => CLOCK);
  const tianai = new StubTianai();
  const service = new CaptchaService({
    store: new CaptchaStore(() => redis),
    getConfig: async () => makeConfig(overrides),
    risk: { getIpRisk: async () => ({ level: 'LOW' as any, score: 0 }) },
    now: () => CLOCK,
    devBypass: false,
    resolveTenant: async () => TENANT,
    isPrivilegedAccount: async () => privileged,
    hmacKey: HMAC_KEY,
    cost: TEST_COST,
    tianaiBaseUrl: 'https://tianai.test',
    tianaiProvider: tianai,
    // ticket 服务绑到同一个 fake redis，保证审计测试完全离线
    ticketService: new CaptchaTicketService(() => redis as any, () => CLOCK),
  });
  return { service, redis, tianai };
}

const ALLOWED_DETAIL_KEYS = new Set([
  'provider', 'scene', 'secondaryType', 'failureReason', 'tenantId', 'usernameHash', 'ipHash', 'requestId',
]);

describe('两级人机验证 — 安全审计负载', () => {
  beforeEach(() => { captured.logs.length = 0; });

  it('事件类型齐全，detail 字段受限，且不含密钥 / 完整 payload / 完整 ticket / grant', async () => {
    const h = build();

    // 1) 第一层静默通过（Tianai 未启用 → 直接签发 ticket）
    const h0 = build({ captchaTianaiEnabled: false });
    const g0 = await h0.service.generate({ ...meta(), provider: 'ALTCHA' });
    const p0 = await solveAltcha(g0.challenge as any);
    const pass0 = await h0.service.verify({ ...meta(), provider: 'ALTCHA', payload: p0 });
    const ticket = pass0.captchaTicket as string;

    // 2) PoW 失败（结构非法）
    await h0.service.verify({ ...meta(), provider: 'ALTCHA', payload: 'not-a-payload' });

    // 3) 风控要求第二层（超管）→ grant；再完成第二层
    const h2 = build({ captchaTianaiEnabled: true }, true);
    const g2 = await h2.service.generate({ ...meta(), provider: 'ALTCHA' });
    const p2 = await solveAltcha(g2.challenge as any);
    const required = await h2.service.verify({ ...meta(), provider: 'ALTCHA', payload: p2 });
    const grant = required.escalationGrant as string;
    expect(required.reason).toBe('SECONDARY_REQUIRED');

    const sc = await h2.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: grant });
    const secondaryPass = await h2.service.verify({
      ...meta(), provider: 'TIANAI', sessionId: sc.sessionId,
      data: { bgImageWidth: 600, bgImageHeight: 300, startTime: CLOCK, stopTime: CLOCK + 800, trackList: [] },
    });
    expect(secondaryPass.status).toBe('passed');

    // 4) 上游技术故障
    const h3 = build({ captchaTianaiEnabled: true }, true);
    h3.tianai.verdict = 'technical_error';
    const g3 = await h3.service.generate({ ...meta(), provider: 'ALTCHA' });
    const p3 = await solveAltcha(g3.challenge as any);
    const req3 = await h3.service.verify({ ...meta(), provider: 'ALTCHA', payload: p3 });
    const sc3 = await h3.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: req3.escalationGrant });
    await h3.service.verify({ ...meta(), provider: 'TIANAI', sessionId: sc3.sessionId, data: {} });

    // 5) ticket 重放
    await h0.service.consumeLoginTicket({ ...meta(), captchaTicket: ticket });
    await h0.service.consumeLoginTicket({ ...meta(), captchaTicket: ticket }).catch(() => { /* expected */ });

    const types = captured.logs.map((l) => l.eventType);
    expect(types).toContain('CAPTCHA_POW_PASSED');
    expect(types).toContain('CAPTCHA_POW_FAILED');
    expect(types).toContain('CAPTCHA_SECONDARY_REQUIRED');
    expect(types).toContain('CAPTCHA_SECONDARY_PASSED');
    expect(types).toContain('CAPTCHA_TOKEN_REPLAYED');
    expect(types).toContain('CAPTCHA_SERVICE_UNAVAILABLE');

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

    // 全量日志中不得出现敏感值
    const dump = JSON.stringify(captured.logs);
    expect(dump).not.toContain(HMAC_KEY);
    expect(dump).not.toContain(ticket);
    expect(dump).not.toContain(grant);
    expect(dump).not.toContain(p2);
    expect(dump).not.toContain('"admin"');
    expect(dump).not.toContain('derivedKey');
    expect(dump).not.toContain('solution');
    expect(dump).not.toContain('signature');
    // 审计里不允许出现旧概念
    expect(dump).not.toContain('captchaToken');
    expect(dump).not.toContain('stage');
  });

  it('内部风控原因只写审计，不出现在公开响应里', async () => {
    const h = build({ captchaTianaiEnabled: true }, true);
    const cfg: any = await h.service.getPublicConfig(meta());
    expect(JSON.stringify(cfg)).not.toContain('PRIVILEGED_ACCOUNT');
    expect(captured.logs.length).toBe(0); // 读取配置不写审计

    const g = await h.service.generate({ ...meta(), provider: 'ALTCHA' });
    const payload = await solveAltcha(g.challenge as any);
    const res: any = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload });
    expect(res.reason).toBe('SECONDARY_REQUIRED');
    expect(JSON.stringify(res)).not.toContain('PRIVILEGED_ACCOUNT');
    expect(captured.logs.find((l) => l.eventType === 'CAPTCHA_SECONDARY_REQUIRED')?.detail.failureReason)
      .toBe('PRIVILEGED_ACCOUNT');
  });

  it('失败原因使用枚举值，并记录 provider / scene / hashes', async () => {
    const h = build({ captchaTianaiEnabled: false });
    await h.service.verify({ ...meta(), provider: 'ALTCHA', payload: encodePayload({ challenge: {} }) });

    const failed = captured.logs.find((l) => l.eventType === 'CAPTCHA_POW_FAILED');
    expect(failed?.detail.failureReason).toBe('PAYLOAD_MALFORMED');
    expect(failed?.detail.tenantId).toBe(TENANT);
    expect(failed?.detail.provider).toBe('ALTCHA');
    expect(failed?.detail.scene).toBe('LOGIN');
    expect(typeof failed?.detail.usernameHash).toBe('string');
    expect(typeof failed?.detail.ipHash).toBe('string');
    expect(failed?.detail.requestId).toBe('req-1');
  });

  it('第二层审计记录 provider=TIANAI / secondaryType', async () => {
    const h = build({ captchaTianaiEnabled: true }, true);
    await h.service.consumeLoginTicket(meta({ captchaTicket: '' })).catch(() => { /* 触发 required 审计路径 */ });
    const g = await h.service.generate({ ...meta(), provider: 'ALTCHA' });
    const payload = await solveAltcha(g.challenge as any);
    const req = await h.service.verify({ ...meta(), provider: 'ALTCHA', payload });
    const sc = await h.service.generate({ ...meta(), provider: 'TIANAI', escalationGrant: req.escalationGrant });
    await h.service.verify({ ...meta(), provider: 'TIANAI', sessionId: sc.sessionId, data: {} });

    const passed = captured.logs.find((l) => l.eventType === 'CAPTCHA_SECONDARY_PASSED');
    expect(passed?.detail.provider).toBe('TIANAI');
    expect(passed?.detail.secondaryType).toBe('blockPuzzle');
  });
});
