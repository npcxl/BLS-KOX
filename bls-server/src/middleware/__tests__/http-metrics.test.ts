import { describe, it, expect, vi } from 'vitest';

// Mock metrics imports
vi.mock('../../observability/metrics', () => {
  let totalRequestsInc: any;
  let durationObserve: any;
  let errorsInc: any;
  return {
    httpRequestsTotal: {
      inc: vi.fn((labels: any) => { totalRequestsInc = labels; }),
      _getLastInc: () => totalRequestsInc,
    },
    httpRequestDurationSeconds: {
      observe: vi.fn((labels: any, val: any) => { durationObserve = { labels, val }; }),
      _getLastObserve: () => durationObserve,
    },
    httpRequestErrorsTotal: {
      inc: vi.fn((labels: any) => { errorsInc = labels; }),
      _getLastInc: () => errorsInc,
    },
  };
});

// Create a mock Koa context
function mockCtx(opts: { method?: string; path?: string; status?: number; matchedRoute?: string; metricsRoute?: string } = {}) {
  return {
    method: opts.method ?? 'GET',
    path: opts.path ?? '/api/test',
    status: opts.status ?? 200,
    _matchedRoute: opts.matchedRoute ?? undefined,
    state: {
      metricsRoute: opts.metricsRoute ?? undefined,
    },
    set: () => {},
    get: () => '',
  };
}

describe('HTTP Metrics Middleware', () => {
  it('should use _matchedRoute when available', async () => {
    const { httpMetricsMiddleware } = await import('../http-metrics');
    const { httpRequestDurationSeconds } = await import('../../observability/metrics');
    const ctx = mockCtx({ matchedRoute: '/api/system/user' });

    await httpMetricsMiddleware(ctx as any, async () => {});

    const last = (httpRequestDurationSeconds as any)._getLastObserve();
    expect(last.labels.route).toBe('/api/system/user');
  });

  it('should fallback to metricsRoute when no _matchedRoute', async () => {
    const { httpMetricsMiddleware } = await import('../http-metrics');
    const { httpRequestDurationSeconds } = await import('../../observability/metrics');
    const ctx = mockCtx({ metricsRoute: '/api/system/role/**' });

    await httpMetricsMiddleware(ctx as any, async () => {});

    const last = (httpRequestDurationSeconds as any)._getLastObserve();
    expect(last.labels.route).toBe('/api/system/role/**');
  });

  it('should fallback to /unmatched when no route info', async () => {
    const { httpMetricsMiddleware } = await import('../http-metrics');
    const { httpRequestDurationSeconds } = await import('../../observability/metrics');
    const ctx = mockCtx({ path: '/api/user/000001' });
    // no _matchedRoute and no metricsRoute

    await httpMetricsMiddleware(ctx as any, async () => {});

    const last = (httpRequestDurationSeconds as any)._getLastObserve();
    expect(last.labels.route).toBe('/unmatched');
  });

  it('should count errors for status >= 400', async () => {
    const { httpMetricsMiddleware } = await import('../http-metrics');
    const { httpRequestErrorsTotal } = await import('../../observability/metrics');
    const ctx = mockCtx({ status: 500, matchedRoute: '/api/test' });

    await httpMetricsMiddleware(ctx as any, async () => {});

    const last = (httpRequestErrorsTotal as any)._getLastInc();
    expect(last.route).toBe('/api/test');
    expect(last.method).toBe('GET');
  });
});
