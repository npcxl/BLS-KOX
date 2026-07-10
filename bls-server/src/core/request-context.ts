/**
 * 请求上下文（基于 AsyncLocalStorage）
 *
 * 替代零散的 console.log 和 ctx.state 杂散访问。
 * 复用现有 TenantStorage，向上兼容 getCurrentTenantId()。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  traceId?: string;
  tenantId: string | null;
  userId: string | null;
  username?: string;
  sessionId?: string;
  tokenJti?: string;
  clientIp: string;
  userAgent?: string;
  startTime: number;
}

const ctxStorage = new AsyncLocalStorage<RequestContext>();

/** 获取当前请求上下文（中间件/Service 中使用） */
export function getRequestContext(): RequestContext | undefined {
  return ctxStorage.getStore();
}

/** 获取当前租户 ID（兼容旧接口） */
export function getCurrentTenantId(): string | null {
  return ctxStorage.getStore()?.tenantId ?? null;
}

/** 获取当前用户 ID */
export function getCurrentUserId(): string | null {
  return ctxStorage.getStore()?.userId ?? null;
}

/** 获取 Request ID */
export function getRequestId(): string {
  return ctxStorage.getStore()?.requestId ?? 'unknown';
}

/** 中间件：初始化请求上下文 */
export async function requestContextMiddleware(ctx: any, next: () => Promise<void>) {
  const store: RequestContext = {
    requestId: (ctx.headers['x-request-id'] as string) || randomUUID().replace(/-/g, '').slice(0, 16),
    traceId: (ctx.headers['x-trace-id'] as string) || undefined,
    tenantId: null,
    userId: null,
    clientIp: (ctx.ip as string) || (ctx.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown',
    userAgent: (ctx.headers['user-agent'] as string) || undefined,
    startTime: Date.now(),
  };

  await ctxStorage.run(store, async () => {
    await next();
  });
}

/** 更新上下文（jwtAuth 认证后调用） */
export function setAuthContext(user: { userId: string; tenantId: string; username?: string }) {
  const store = ctxStorage.getStore();
  if (store) {
    store.userId = user.userId;
    store.tenantId = user.tenantId;
    store.username = user.username;
  }
}
