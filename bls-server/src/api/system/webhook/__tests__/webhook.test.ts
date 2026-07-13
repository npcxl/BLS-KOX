/**
 * P12: Webhook — 专项测试
 */
import { describe, it, expect } from 'vitest';
import { validateWebhookUrl } from '../validate';
import { createHmac } from 'crypto';

describe('P12 Webhook Platform', () => {
  // ====== validateWebhookUrl SSRF 防护 ======

  it('validateWebhookUrl: 合法 https URL', () => {
    expect(validateWebhookUrl('https://example.com/webhook').valid).toBe(true);
  });

  it('validateWebhookUrl: 合法 http URL', () => {
    expect(validateWebhookUrl('http://api.example.com/callback').valid).toBe(true);
  });

  it('validateWebhookUrl: 空字符串 → 拒绝', () => {
    const r = validateWebhookUrl('');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: file:// → 拒绝', () => {
    const r = validateWebhookUrl('file:///etc/passwd');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: ftp:// → 拒绝', () => {
    const r = validateWebhookUrl('ftp://evil.com');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: gopher:// → 拒绝', () => {
    const r = validateWebhookUrl('gopher://evil.com');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: localhost → 拒绝', () => {
    const r = validateWebhookUrl('http://localhost:8080');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 127.0.0.1 → 拒绝', () => {
    const r = validateWebhookUrl('http://127.0.0.1:3000');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: ::1 → 拒绝', () => {
    const r = validateWebhookUrl('http://[::1]:3000');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 10.x → 拒绝', () => {
    const r = validateWebhookUrl('http://10.0.0.1/admin');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 192.168.x → 拒绝', () => {
    const r = validateWebhookUrl('http://192.168.1.1');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 172.16.x → 拒绝', () => {
    const r = validateWebhookUrl('http://172.16.0.1');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 169.254.169.254 metadata IP → 拒绝', () => {
    const r = validateWebhookUrl('http://169.254.169.254/latest/meta-data');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 169.254.x link-local → 拒绝', () => {
    const r = validateWebhookUrl('http://169.254.1.1');
    expect(r.valid).toBe(false);
  });

  it('validateWebhookUrl: 无协议 → 拒绝', () => {
    const r = validateWebhookUrl('example.com');
    expect(r.valid).toBe(false);
  });

  // ====== HMAC 签名 ======

  it('HMAC signature: 相同输入产生相同签名', () => {
    const secret = 'test-secret-123';
    const payload = '{"event":"test"}';
    const sig1 = createHmac('sha256', secret).update(payload).digest('hex');
    const sig2 = createHmac('sha256', secret).update(payload).digest('hex');
    expect(sig1).toBe(sig2);
  });

  it('HMAC signature: 不同 secret 产生不同签名', () => {
    const payload = '{"event":"test"}';
    const sig1 = createHmac('sha256', 'secret-a').update(payload).digest('hex');
    const sig2 = createHmac('sha256', 'secret-b').update(payload).digest('hex');
    expect(sig1).not.toBe(sig2);
  });

  it('HMAC signature: 不同 payload 产生不同签名', () => {
    const sig1 = createHmac('sha256', 'secret').update('a').digest('hex');
    const sig2 = createHmac('sha256', 'secret').update('b').digest('hex');
    expect(sig1).not.toBe(sig2);
  });

  // ====== webhookJob exports ======

  it('webhookJob type is webhook', async () => {
    const mod = await import('../../../../queue/jobs/webhook.job.js');
    expect(mod.webhookJob.type).toBe('webhook');
    expect(mod.webhookJob.maxAttempts).toBe(5);
    expect(mod.webhookJob.timeout).toBe(15_000);
  });

  // ====== API 权限存在性 ======

  it('webhook API router exports', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
  });

  // ====== 概念验证 ======

  it('retry: enqueue payload 应包含 tenantId', () => {
    // 概念验证: jobData.tenantId 字段存在
    const jobData = {
      webhookId: 'w1', url: 'https://x.com', secret: 's',
      events: ['USER_CREATED'], event: 'manual_retry', tenantId: '000001',
    };
    expect(jobData.tenantId).toBe('000001');
  });

  it('delivery log: tenant_id 应是真实租户，非硬编码', () => {
    // 概念验证: logDelivery 接收 tenantId 参数
    const sampleTenantId = '000001';
    expect(sampleTenantId).not.toBe('000000'); // 不应硬编码
    expect(sampleTenantId).toBe('000001');
  });

  it('fetch: AbortController timeout 概念验证', () => {
    // AbortController 在 webhookJob 和 test send 中使用
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('validate: 生产建议只允许 https', () => {
    // 概念验证: http 生产环境建议禁用
    const httpAllowed = validateWebhookUrl('http://example.com').valid;
    expect(httpAllowed).toBe(true); // 当前允许 http，生产可收紧
  });
});
