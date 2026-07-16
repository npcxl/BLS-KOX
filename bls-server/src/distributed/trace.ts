/**
 * 请求链路追踪。
 *
 * 设计：
 *   - requestId: 来自 X-Request-Id 头或自动生成（UUID v4）
 *   - traceId: 来自 X-Trace-Id 头或自动生成（UUID v4），与 OpenTelemetry 兼容
 *   - 注入到 Response Header：X-Request-Id, X-Trace-Id
 *   - 注入到 Koa ctx.state 和 logger context
 *
 * 现有的 request-context.ts 已经通过 AsyncLocalStorage 实现了类似能力，
 * 本模块提供独立可复用的 trace 函数。
 */
import type { Context, Next } from 'koa';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';
export const TRACE_ID_HEADER = 'X-Trace-Id';

/**
 * Trace 中间件 —— 注入 requestId / traceId 到 ctx.state 和 Response Header。
 * 放在中间件链的最前面。
 */
export function traceMiddleware() {
  return async (ctx: Context, next: Next) => {
    // 提取或生成 requestId
    const requestId =
      (ctx.headers[REQUEST_ID_HEADER.toLowerCase()] as string) || randomUUID();

    // 提取或生成 traceId
    const traceId =
      (ctx.headers[TRACE_ID_HEADER.toLowerCase()] as string) || randomUUID();

    // 注入到 ctx.state
    ctx.state.requestId = requestId;
    ctx.state.traceId = traceId;

    // 注入到 Response Header
    ctx.set(REQUEST_ID_HEADER, requestId);
    ctx.set(TRACE_ID_HEADER, traceId);

    await next();
  };
}

/**
 * 从 Koa ctx 中提取 requestId
 */
export function getRequestId(ctx: Context): string {
  return (ctx.state.requestId as string) || 'unknown';
}

/**
 * 从 Koa ctx 中提取 traceId
 */
export function getTraceId(ctx: Context): string {
  return (ctx.state.traceId as string) || 'unknown';
}
