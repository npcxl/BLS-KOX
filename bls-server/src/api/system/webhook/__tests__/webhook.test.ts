/**
 * P12: Webhook — 真实行为测试 (mock DNS/DB/enqueue/权限)
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { promises as dns } from 'dns';

// ====== module-level mocks (hoisted) ======

const enqueueMock = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  selectFrom: vi.fn().mockReturnThis(),
  selectAll: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  executeTakeFirst: vi.fn(),
  insertInto: vi.fn(),
};
const mockGetDb = vi.fn().mockResolvedValue(mockDb);

vi.mock('../../../../core/database.js', () => ({ getDb: mockGetDb }));
vi.mock('../../../../queue/queue.js', () => ({ enqueue: enqueueMock }));

// ====== dynamic imports ======

let validateWebhookUrl: any;
let hasPermMw: any;

beforeAll(async () => {
  const mod = await import('../validate.js');
  validateWebhookUrl = mod.validateWebhookUrl;

  const permMod = await import('../../../../middleware/permission.js');
  hasPermMw = permMod.hasPerm;
});

afterEach(() => {
  vi.clearAllMocks();
  // reset defaults
  mockGetDb.mockResolvedValue(mockDb);
  enqueueMock.mockResolvedValue(undefined);
  mockDb.selectFrom.mockReturnThis();
  mockDb.selectAll.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.executeTakeFirst.mockResolvedValue(null);
  mockDb.insertInto.mockReset();
});

// ctx helper
function makeCtx(overrides: Record<string, any> = {}): any {
  return {
    path: '/system/webhooks', method: 'GET', state: {}, query: {}, params: {},
    request: { body: {} }, headers: {}, ip: '127.0.0.1',
    status: 200, body: null, set: vi.fn(), get: vi.fn(),
    ...overrides,
  };
}

describe('P12 Webhook', () => {
  // ====== DNS mock ======

  it('DNS: 解析到公网 IP → 通过', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValueOnce(['93.184.216.34']);
    vi.spyOn(dns, 'resolve6').mockResolvedValueOnce([]);
    const r = await validateWebhookUrl('https://example.com/hook');
    expect(r.valid).toBe(true);
  });

  it('DNS: 解析到内网 IP (10.x) → 拒绝', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValueOnce(['10.0.0.1']);
    vi.spyOn(dns, 'resolve6').mockResolvedValueOnce([]);
    const r = await validateWebhookUrl('https://internal.example.com/hook');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('10.0.0.1');
  });

  it('DNS: 解析到 192.168.x → 拒绝', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValueOnce(['192.168.1.100']);
    vi.spyOn(dns, 'resolve6').mockResolvedValueOnce([]);
    const r = await validateWebhookUrl('http://intranet.local/');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('192.168');
  });

  it('DNS: IPv6 内网 → 拒绝', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValueOnce([]);
    vi.spyOn(dns, 'resolve6').mockResolvedValueOnce(['fd12::1']);
    const r = await validateWebhookUrl('https://ipv6.internal/');
    expect(r.valid).toBe(false);
  });

  it('DNS: 解析失败 → 拒绝', async () => {
    vi.spyOn(dns, 'resolve4').mockRejectedValueOnce(new Error('ENOTFOUND'));
    vi.spyOn(dns, 'resolve6').mockRejectedValueOnce(new Error('ENOTFOUND'));
    const r = await validateWebhookUrl('https://no-123456-host.com/hook');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('DNS');
  });

  // ====== 静态校验 ======

  it('静态: file:// → 拒绝', async () => {
    const r = await validateWebhookUrl('file:///etc/passwd');
    expect(r.valid).toBe(false);
  });

  it('静态: localhost → 拒绝', async () => {
    const r = await validateWebhookUrl('http://localhost:8080');
    expect(r.valid).toBe(false);
  });

  it('静态: 127.0.0.1 → 拒绝', async () => {
    const r = await validateWebhookUrl('http://127.0.0.1:3000');
    expect(r.valid).toBe(false);
  });

  it('静态: metadata IP → 拒绝', async () => {
    const r = await validateWebhookUrl('http://169.254.169.254/latest/meta-data');
    expect(r.valid).toBe(false);
  });

  it('静态: gopher:// → 拒绝', async () => {
    const r = await validateWebhookUrl('gopher://evil.com');
    expect(r.valid).toBe(false);
  });

  // ====== tenantId 强制 ======

  it('webhookJob: tenantId 缺失 → throw', async () => {
    const mod = await import('../../../../queue/jobs/webhook.job.js');
    await expect(mod.webhookJob.handler({ webhookId: 'w1', url: 'https://x.com', secret: 's' } as any))
      .rejects.toThrow('tenantId');
  });

  // ====== mock fetch ======

  it('fetch: res.ok=false → throw', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'ISE' } as any);
    const mod = await import('../../../../queue/jobs/webhook.job.js');
    await expect(mod.webhookJob.handler({ webhookId: 'w2', url: 'https://fail.com', secret: 's', tenantId: '000001', event: 'test', attempt: 1 } as any))
      .rejects.toThrow('500');
    global.fetch = orig;
  });

  it('fetch: ECONNREFUSED → throw', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const mod = await import('../../../../queue/jobs/webhook.job.js');
    await expect(mod.webhookJob.handler({ webhookId: 'w3', url: 'https://down.com', secret: 's', tenantId: '000001', event: 'test', attempt: 1 } as any))
      .rejects.toThrow('ECONNREFUSED');
    global.fetch = orig;
  });

  it('fetch: AbortError → throw', async () => {
    const orig = global.fetch;
    global.fetch = vi.fn().mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const mod = await import('../../../../queue/jobs/webhook.job.js');
    await expect(mod.webhookJob.handler({ webhookId: 'w4', url: 'https://slow.com', secret: 's', tenantId: '000001', event: 'test', attempt: 1 } as any))
      .rejects.toThrow();
    global.fetch = orig;
  });

  // ====== 1. retry 真实 handler — mock getDb + enqueue（已模块级 mock） ======

  it('retry handler: 调用真实 handler → 断言 jobData.tenantId', async () => {
    // 设置 mock DB 返回值
    mockDb.executeTakeFirst.mockResolvedValue({
      webhook_id: 'WH001', url: 'https://x.com/hook', secret: 's3cret',
      events: '["USER_CREATED"]',
    });

    // 重新 import webhook 模块（使用模块级 mock）
    const apiMod = await import('../index.js');
    const router = apiMod.default as any;

    // 从 router stack 找到 POST /:id/retry 的 handler
    const retryLayer = router.stack.find((s: any) =>
      s.path === '/:id/retry' && s.methods.includes('POST')
    );
    expect(retryLayer).toBeDefined();
    const handler = retryLayer.stack[retryLayer.stack.length - 1];
    expect(handler).toBeDefined();

    const ctx = makeCtx({
      path: '/system/webhooks/WH001/retry',
      method: 'POST',
      params: { id: 'WH001' },
      state: { user: { userId: '1', tenantId: '000000', username: 'admin', perms: ['*'] } },
      request: { body: { event: 'USER_CREATED' } },
    });

    await handler(ctx, async () => {});

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const arg = enqueueMock.mock.calls[0][0];
    expect(arg.jobType).toBe('webhook');
    expect(arg.jobData.webhookId).toBe('WH001');
    expect(arg.jobData.url).toBe('https://x.com/hook');
    expect(arg.jobData.secret).toBe('s3cret');
    expect(arg.jobData.event).toBe('USER_CREATED');
    // 核心：tenantId 由真实 handler 写入
    expect(arg.jobData.tenantId).toBeDefined();
  });

  // ====== 2. hasPerm 中间件真实调用 ======

  it('hasPerm: 超管(000000) → next 通过', async () => {
    const mw = hasPermMw('system:webhook:add');
    let called = false;
    const ctx = makeCtx({
      path: '/system/webhooks', method: 'POST',
      state: { user: { userId: 'u0', tenantId: '000000', username: 'admin', perms: [] } },
    });
    await mw(ctx, async () => { called = true; });
    expect(called).toBe(true);
  });

  it('hasPerm: * 权限 → next 通过', async () => {
    const mw = hasPermMw('system:webhook:add');
    let called = false;
    const ctx = makeCtx({
      path: '/system/webhooks', method: 'POST',
      state: { user: { userId: 'u1', tenantId: 'T001', username: 'super', perms: ['*'] } },
    });
    await mw(ctx, async () => { called = true; });
    expect(called).toBe(true);
  });

  it('hasPerm: 无权限 → ForbiddenError', async () => {
    const mw = hasPermMw('system:webhook:add');
    let nextCalled = false;
    const ctx = makeCtx({
      path: '/system/webhooks', method: 'POST',
      state: { user: { userId: 'u2', tenantId: 'T001', username: 'normal', perms: ['system:user:list'] } },
    });
    await expect(mw(ctx, async () => { nextCalled = true; })).rejects.toThrow();
    expect(nextCalled).toBe(false);
  });

  it('hasPerm: 有权限 → next 通过', async () => {
    const mw = hasPermMw('system:webhook:add');
    let called = false;
    const ctx = makeCtx({
      path: '/system/webhooks', method: 'POST',
      state: { user: { userId: 'u3', tenantId: 'T001', username: 'webhooker', perms: ['system:webhook:add', 'system:webhook:list'] } },
    });
    await mw(ctx, async () => { called = true; });
    expect(called).toBe(true);
  });

  it('hasPerm: 无 user → UnauthorizedError', async () => {
    const mw = hasPermMw('system:webhook:add');
    const ctx = makeCtx({ path: '/system/webhooks', method: 'POST', state: {} });
    await expect(mw(ctx, async () => {})).rejects.toThrow();
  });

  // ====== 3. mock DB — 断言投递日志 ======

  it('logDeliveryLocal: INSERT 含 tenantId + error', async () => {
    const mockValues = vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    const insertInto = vi.fn().mockReturnValue({ values: mockValues });

    const { logDeliveryLocal } = await import('../index.js');
    await logDeliveryLocal({ insertInto } as any, 'WH001', 'test', '{}', 'failed', null, null, 'ECONNREFUSED', 1, '000003');

    expect(insertInto).toHaveBeenCalledWith('sys_webhook_delivery');
    const row = mockValues.mock.calls[0]?.[0];
    expect(row.status).toBe('failed');
    expect(row.tenant_id).toBe('000003');
    expect(row.error_message).toBe('ECONNREFUSED');
    expect(row.webhook_id).toBe('WH001');
    expect(row.attempt).toBe(1);
  });

  // ====== HMAC ======

  it('HMAC: 相同输入 → 相同签名', () => {
    const s1 = createHmac('sha256', 's').update('p').digest('hex');
    const s2 = createHmac('sha256', 's').update('p').digest('hex');
    expect(s1).toBe(s2);
  });

  // ====== Job 属性 ======

  it('webhookJob: type / maxAttempts', async () => {
    const mod = await import('../../../../queue/jobs/webhook.job.js');
    expect(mod.webhookJob.type).toBe('webhook');
    expect(mod.webhookJob.maxAttempts).toBe(5);
  });
});
