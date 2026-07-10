/**
 * HTTP 请求指标中间件
 *
 * 自动采集所有 API 请求的：
 * - 请求数（counter）
 * - 请求耗时（histogram）
 * - 错误数（counter）
 */

import type { Context, Next } from 'koa';
import { httpRequestsTotal, httpRequestDurationSeconds, httpRequestErrorsTotal } from '../observability/metrics';

export async function httpMetricsMiddleware(ctx: Context, next: Next): Promise<void> {
  const start = Date.now();

  try {
    await next();
  } finally {
    const duration = (Date.now() - start) / 1000;
    const method = ctx.method;
    // 标准化路由（避免高基数）：用 ctx._matchedRoute 或 fallback 到 path
    const route = (ctx._matchedRoute ?? ctx.path) || '/unknown';
    const status = String(ctx.status);

    httpRequestsTotal.inc({ method, route, status });
    httpRequestDurationSeconds.observe({ method, route }, duration);
    if (ctx.status >= 400) {
      httpRequestErrorsTotal.inc({ method, route });
    }
  }
}
