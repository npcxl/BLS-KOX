/**
 * API Versioning — 专项测试
 */
import { describe, it, expect } from 'vitest';
import { apiVersion, API_PREFIXES } from '../api-version';

describe('API Versioning', () => {
  it('API_PREFIXES 定义存在', () => {
    expect(API_PREFIXES.V1).toBe('/api/v1');
    expect(API_PREFIXES.OPENAPI_V1).toBe('/openapi/v1');
    expect(API_PREFIXES.INTERNAL).toBe('/internal');
  });

  it('apiVersion 返回中间件函数', () => {
    const mw = apiVersion();
    expect(typeof mw).toBe('function');
  });

  it('apiVersion: /api/v1/xxx → v1', async () => {
    const ctx: any = { path: '/api/v1/system/user', state: {}, set: () => {}, get: () => '' };
    const next = async () => {};
    await apiVersion()(ctx, next);
    expect(ctx.state.apiVersion).toBe('v1');
  });

  it('apiVersion: /openapi/v1/xxx → openapi_v1', async () => {
    const ctx: any = { path: '/openapi/v1/orders', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('openapi_v1');
  });

  it('apiVersion: /internal/xxx → internal', async () => {
    const ctx: any = { path: '/internal/health', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('internal');
  });

  it('apiVersion: /api/xxx (无版本前缀) → 默认 v1', async () => {
    const ctx: any = { path: '/api/system/user', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  it('apiVersion: /other/xxx → 默认 v1', async () => {
    const ctx: any = { path: '/other/thing', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  it('apiVersion: /api/xxx 的 Deprecation 由 app.ts 控制（中间件不负责）', async () => {
    const ctx: any = { path: '/api/system/user', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  // ====== 路由版本化 ======

  it('/api/v1/system/user → apiVersion = v1', async () => {
    const ctx: any = { path: '/api/v1/system/user', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  it('/api/system/user → 旧路径仍兼容，apiVersion = v1', async () => {
    const ctx: any = { path: '/api/system/user', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });

  it('/openapi/v1/orders → apiVersion = openapi_v1', async () => {
    const ctx: any = { path: '/openapi/v1/orders', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('openapi_v1');
  });

  it('/internal/health → apiVersion = internal', async () => {
    const ctx: any = { path: '/internal/health', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('internal');
  });

  it('/other → 未知路径默认 v1', async () => {
    const ctx: any = { path: '/metrics', state: {}, set: () => {}, get: () => '' };
    await apiVersion()(ctx, async () => {});
    expect(ctx.state.apiVersion).toBe('v1');
  });
});
