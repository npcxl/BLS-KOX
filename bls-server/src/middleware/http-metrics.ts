/**
 * HTTP 请求指标中间件
 *
 * route label 优先级：
 *   1. ctx._matchedRoute（Koa Router 匹配的标准路由）
 *   2. ctx.state.metricsRoute（Rate Limit / Replay 等提前返回的中间件写入）
 *   3. '/unmatched'（最终兜底）
 *
 * 禁止使用 ctx.path 作为 route label，避免动态路径造成高基数。
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
    const route = ctx._matchedRoute ?? ctx.state?.metricsRoute ?? '/unmatched';
    const status = String(ctx.status);

    httpRequestsTotal.inc({ method, route, status });
    httpRequestDurationSeconds.observe({ method, route }, duration);
    if (ctx.status >= 400) {
      httpRequestErrorsTotal.inc({ method, route });
    }
  }
}
