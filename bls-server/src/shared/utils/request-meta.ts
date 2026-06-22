import type { Context } from 'koa';
import { extractRequestIp, resolveClientIp } from './ip';

export interface RequestMeta {
  loginIp: string | null;
  userAgent: string | null;
  requestId: string | null;
  loginType: string | null;
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function buildRequestMeta(ctx: Context, loginType: string = 'password'): Promise<RequestMeta> {
  const sourceIp = extractRequestIp(ctx);
  return {
    loginIp: await resolveClientIp(sourceIp),
    userAgent: normalizeHeaderValue(ctx.headers['user-agent']),
    requestId: normalizeHeaderValue(ctx.headers['x-request-id']),
    loginType,
  };
}
