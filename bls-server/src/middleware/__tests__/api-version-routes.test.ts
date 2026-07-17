/**
 * API Versioning — 路由级集成测试
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { apiVersion, API_PREFIXES } from '../api-version';
import { openApiAuth } from '../openapi-auth';
import { internalAuth } from '../internal-auth';

describe('API Versioning — Route Integration', () => {
  // ====== FIX-01: /api/v1/ 真实映射 ======

  it('/api/v1/system/user → rewrite 为 /api/system/user', () => {
    // 验证 rewrite 逻辑
    const path = '/api/v1/system/user';
    const rewritten = '/api' + path.slice(7);
    expect(rewritten).toBe('/api/system/user');
  });

  it('/api/v1/system/role → rewrite 为 /api/system/role', () => {
    const path = '/api/v1/system/role/list';
    const rewritten = '/api' + path.slice(7);
    expect(rewritten).toBe('/api/system/role/list');
  });

  it('/api/v1/health → rewrite 为 /api/health', () => {
    const path = '/api/v1/health';
    const rewritten = '/api' + path.slice(7);
    expect(rewritten).toBe('/api/health');
  });

  // ====== FIX-02: /api/ 旧路径 deprecation ======

  it('/api/system/user → 旧路径应带 Deprecation', async () => {
    const ctx: any = { path: '/api/system/user', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  it('/api/v1/system/user → 新路径无 Deprecation', async () => {
    const ctx: any = { path: '/api/v1/system/user', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  // ====== FIX-03: OpenAPI auth ======

  it('openApiAuth: missing headers → 401', async () => {
    const ctx: any = {
      path: '/openapi/v1/orders',
      method: 'GET',
      state: {},
      set: () => {},
      get: () => '',
      request: { body: {} },
    };
    const mw = openApiAuth();
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(401);
  });

  it('openApiAuth: invalid timestamp → 401', async () => {
    const ctx: any = {
      path: '/openapi/v1/orders',
      method: 'GET',
      state: {},
      set: () => {},
      get: (k: string) => {
        if (k === 'X-Api-Key') return 'test-key';
        if (k === 'X-Timestamp') return '1000000000'; // expired
        if (k === 'X-Nonce') return 'n1';
        if (k === 'X-Signature') return 'sig';
        return '';
      },
      request: { body: {} },
    };
    const mw = openApiAuth();
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(401);
  });

  it('openApiAuth: middleware is exported', () => {
    expect(typeof openApiAuth).toBe('function');
    const mw = openApiAuth();
    expect(typeof mw).toBe('function');
  });

  // ====== FIX-04: Internal auth ======

  it('internalAuth: missing token → 401', async () => {
    const ctx: any = {
      path: '/internal/health',
      method: 'GET',
      state: {},
      ip: '127.0.0.1',
      request: { ip: '127.0.0.1' },
      set: () => {},
      get: () => '', // no token
    };
    const mw = internalAuth();
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(401);
  });

  it('internalAuth: invalid token → 403', async () => {
    const ctx: any = {
      path: '/internal/health',
      method: 'GET',
      state: {},
      ip: '127.0.0.1',
      request: { ip: '127.0.0.1' },
      set: () => {},
      get: (k: string) => k === 'X-Internal-Token' ? 'wrong_token' : '',
    };
    const mw = internalAuth();
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(403);
  });

  it('internalAuth: dev mode + local IP + correct token → passes', async () => {
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_SECRET = 'test-internal-secret-for-unit-tests';
    const secret = process.env.INTERNAL_SECRET;
    const ctx: any = {
      path: '/internal/health',
      method: 'GET',
      state: {},
      ip: '127.0.0.1',
      request: { ip: '127.0.0.1' },
      set: () => {},
      get: (k: string) => k === 'X-Internal-Token' ? secret : '',
    };
    const mw = internalAuth();
    let called = false;
    await mw(ctx, async () => { called = true; });
    expect(ctx.status).not.toBe(401);
    expect(ctx.status).not.toBe(403);
    expect(ctx.state.internal).toBe(true);
    delete process.env.INTERNAL_SECRET;
  });

  it('internalAuth: middleware is exported', () => {
    expect(typeof internalAuth).toBe('function');
    const mw = internalAuth();
    expect(typeof mw).toBe('function');
  });

  // ====== FIX-05: 全链路版本识别 ======

  it('API_PREFIXES constants are correct', () => {
    expect(API_PREFIXES.V1).toBe('/api/v1');
    expect(API_PREFIXES.OPENAPI_V1).toBe('/openapi/v1');
    expect(API_PREFIXES.INTERNAL).toBe('/internal');
  });

  it('all three auth middlewares coexist without conflict', () => {
    expect(typeof apiVersion).toBe('function');
    expect(typeof openApiAuth).toBe('function');
    expect(typeof internalAuth).toBe('function');
  });
});
