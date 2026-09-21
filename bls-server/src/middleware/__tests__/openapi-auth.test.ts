/**
 * 阶段六：openApiAuth 中间件测试
 *
 * 覆盖：缺头、时间戳过期、Redis 不可用 fail-closed、nonce 重放、
 *      无效 Key、租户停用、签名错误、scope 不足、成功路径上下文注入。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';

const h = vi.hoisted(() => ({
  redis: null as any,
  keyRecord: null as any,
  secret: 'secret-abc',
  tenantActive: true,
  logs: [] as any[],
  contextSet: [] as any[],
}));

vi.mock('../../shared/utils/redis', () => ({ getRedisClient: () => h.redis }));
vi.mock('../../services/tenant-lifecycle', () => ({
  assertTenantActive: async () => {
    if (!h.tenantActive) throw new Error('租户已停用');
    return { tenantId: h.keyRecord?.tenantId };
  },
}));
vi.mock('../../services/api-key-service', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    apiKeyService: {
      resolve: async () => (h.keyRecord ? { record: h.keyRecord, secret: h.secret } : null),
      touchLastUsed: async () => {},
    },
  };
});
vi.mock('../../core/security-audit', () => ({
  writeSecurityLog: async (input: any) => { h.logs.push(input); },
  actorFromCtx: () => ({ tenantId: '000000', userId: null, username: null, clientIp: null, userAgent: null, requestId: null }),
  SecurityEventType: {
    NONCE_REPLAY: 'NONCE_REPLAY', SIGNATURE_INVALID: 'SIGNATURE_INVALID',
    PERMISSION_DENIED: 'PERMISSION_DENIED', TOKEN_INVALID: 'TOKEN_INVALID',
  },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
}));
vi.mock('../../core/request-context', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, setRequestContext: (patch: any) => { h.contextSet.push(patch); return actual.setRequestContext(patch); } };
});
vi.mock('../../core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { openApiAuth } from '../openapi-auth';

class FakeRedis {
  store = new Map<string, string>();
  async set(k: string, v: string, ...args: any[]) {
    const nx = args.some((a) => String(a).toUpperCase() === 'NX');
    if (nx && this.store.has(k)) return null;
    this.store.set(k, v);
    return 'OK';
  }
}

const PATH = '/api/system/user/list';
const METHOD = 'GET';

function ctxOf(headers: Record<string, string>, body: any = {}) {
  const ctx: any = {
    path: PATH,
    method: METHOD,
    state: {},
    request: { body, rawBody: JSON.stringify(body) },
    status: 200,
    body: undefined,
    headers,
    ip: '10.0.0.1',
    get(name: string) { return headers[String(name).toLowerCase()] ?? headers[name] ?? ''; },
  };
  return ctx;
}

function sign(secret: string, ts: number, nonce: string, method = METHOD, path = PATH, body = '{}') {
  return createHmac('sha256', secret).update(`${method}:${path}:${ts}:${nonce}:${body}`).digest('hex');
}

async function invoke(ctx: any) {
  let nextCalled = false;
  await openApiAuth()(ctx, async () => { nextCalled = true; });
  return nextCalled;
}

beforeEach(() => {
  h.redis = new FakeRedis();
  h.secret = 'secret-abc';
  h.keyRecord = {
    apiKeyId: 'AK1', tenantId: 'T1', name: 'partner', keyId: 'kid1', keyHash: 'hash',
    encryptedSecret: 'enc', secretPreview: null, scopes: 'read', status: '0',
    expireAt: null, revokedAt: null, lastUsedAt: null, createdBy: null,
    createdAt: '2026-09-21 00:00:00', deleted: 0,
  };
  h.tenantActive = true;
  h.logs = [];
  h.contextSet = [];
});

describe('openApiAuth', () => {
  it('缺少认证头 → 401', async () => {
    const ctx = ctxOf({});
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.status).toBe(401);
  });

  it('时间戳过期 → 401', async () => {
    const ts = Math.floor(Date.now() / 1000) - 600;
    const ctx = ctxOf({ 'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n1', 'x-signature': 'x' });
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.body.message).toMatch(/Timestamp/);
  });

  it('Redis 不可用 → 503（fail-closed，绝不降级放行）', async () => {
    h.redis = null;
    const ts = Math.floor(Date.now() / 1000);
    const ctx = ctxOf({
      'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n1',
      'x-signature': sign(h.secret, ts, 'n1'),
    });
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.status).toBe(503);
  });

  it('nonce 重放 → 401 并记录 NONCE_REPLAY', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(h.secret, ts, 'n-dup');
    const first = ctxOf({ 'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n-dup', 'x-signature': sig });
    expect(await invoke(first)).toBe(true);

    const second = ctxOf({ 'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n-dup', 'x-signature': sig });
    expect(await invoke(second)).toBe(false);
    expect(second.status).toBe(401);
    expect(h.logs.some((l) => l.eventType === 'NONCE_REPLAY')).toBe(true);
  });

  it('无效 API Key → 403', async () => {
    h.keyRecord = null;
    const ts = Math.floor(Date.now() / 1000);
    const ctx = ctxOf({ 'x-api-key': 'nope', 'x-timestamp': String(ts), 'x-nonce': 'n2', 'x-signature': 'x' });
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.status).toBe(403);
  });

  it('租户停用 → 403', async () => {
    h.tenantActive = false;
    const ts = Math.floor(Date.now() / 1000);
    const ctx = ctxOf({
      'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n3',
      'x-signature': sign(h.secret, ts, 'n3'),
    });
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.body.message).toMatch(/Tenant/);
  });

  it('签名错误 → 403 并记录 SIGNATURE_INVALID', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const ctx = ctxOf({ 'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n4', 'x-signature': 'bad' });
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.status).toBe(403);
    expect(h.logs.some((l) => l.eventType === 'SIGNATURE_INVALID')).toBe(true);
  });

  it('只读 scope 调用写方法 → 403（scope 校验）', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = { name: 'x' };
    const ctx = ctxOf({
      'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n5',
      'x-signature': sign(h.secret, ts, 'n5', 'POST', PATH, JSON.stringify(body)),
    }, body);
    ctx.method = 'POST';
    expect(await invoke(ctx)).toBe(false);
    expect(ctx.status).toBe(403);
    expect(ctx.body.message).toMatch(/read|scope/);
  });

  it('签名正确且 scope 足够 → 放行，并注入可信租户上下文', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'n6';
    const ctx = ctxOf({
      'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': nonce,
      'x-signature': sign(h.secret, ts, nonce),
    });
    expect(await invoke(ctx)).toBe(true);
    expect(ctx.state.openApi).toMatchObject({ tenantId: 'T1', scopes: ['read'], keyId: 'kid1' });
    expect(h.contextSet.some((c) => c.tenantId === 'T1')).toBe(true);
  });

  it('写 scope 可调用写方法', async () => {
    h.keyRecord.scopes = 'read,write';
    const ts = Math.floor(Date.now() / 1000);
    const body = { name: 'x' };
    const ctx = ctxOf({
      'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n7',
      'x-signature': sign(h.secret, ts, 'n7', 'POST', PATH, JSON.stringify(body)),
    }, body);
    ctx.method = 'POST';
    expect(await invoke(ctx)).toBe(true);
  });

  it('API Key 的租户上下文来自记录，不接受请求伪造的 tenantId', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = { tenantId: 'HACKED' };
    const ctx = ctxOf({
      'x-api-key': 'kid1', 'x-timestamp': String(ts), 'x-nonce': 'n8',
      'x-signature': sign(h.secret, ts, 'n8', METHOD, PATH, JSON.stringify(body)),
    }, body);
    expect(await invoke(ctx)).toBe(true);
    expect(ctx.state.openApi.tenantId).toBe('T1');
  });
});
