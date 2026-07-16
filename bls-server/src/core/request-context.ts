/**
 * 请求上下文（基于 AsyncLocalStorage）
 *
 * 所有安全模块通过 getRequestContext() 读取统一身份和 IP，
 * 禁止各模块单独解析 ctx.ip / x-forwarded-for / x-real-ip。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  traceId: string;
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

export function getRequestContext(): RequestContext | undefined { return ctxStorage.getStore(); }
export function getCurrentTenantId(): string | null { return ctxStorage.getStore()?.tenantId ?? null; }
export function getCurrentUserId(): string | null { return ctxStorage.getStore()?.userId ?? null; }
export function getRequestId(): string { return ctxStorage.getStore()?.requestId ?? 'unknown'; }

function normalizeRequestId(value?: string): string {
  if (value && /^[A-Za-z0-9_-]{8,64}$/.test(value)) return value;
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/** 标准化 IP：去除 IPv4-mapped IPv6 前缀 ::ffff: */
function normalizeIp(value?: string): string | undefined {
  if (!value) return undefined;
  const ip = value.trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** 中间件：初始化请求上下文 */
export async function requestContextMiddleware(ctx: any, next: () => Promise<void>) {
  // 优先使用 traceMiddleware 已设置的 requestId/traceId，保证日志、响应头、上下文一致
  const store: RequestContext = {
    requestId: normalizeRequestId(ctx.state.requestId ?? ctx.headers['x-request-id'] as string),
    traceId: normalizeRequestId(ctx.state.traceId ?? ctx.headers['x-trace-id'] as string),
    tenantId: null,
    userId: null,
    clientIp: normalizeIp(ctx.ip) ?? 'unknown',
    userAgent: ctx.get('user-agent') || undefined,
    startTime: Date.now(),
  };

  await ctxStorage.run(store, async () => {
    await next();
  });
}

/** 更新上下文（jwtAuth 认证后调用） */
export function setAuthContext(user: { userId: string; tenantId: string; username?: string }) {
  const store = ctxStorage.getStore();
  if (store) { store.userId = user.userId; store.tenantId = user.tenantId; store.username = user.username; }
}

/** 部分更新上下文 */
export function setRequestContext(partial: Partial<Pick<RequestContext, 'userId' | 'tenantId' | 'username'>>) {
  const store = ctxStorage.getStore();
  if (store) Object.assign(store, partial);
}
