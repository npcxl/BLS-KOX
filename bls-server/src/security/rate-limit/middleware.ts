import { createHash } from 'crypto';
import type { Context, Next } from 'koa';
import { getRequestContext } from '../../core/request-context';
import { RateLimitService } from './RateLimitService';
import { defaultRateLimitRules, matchRateLimitRules } from './rules';
import { rateLimitRejectedTotal } from '../../observability/metrics';

let _svc: RateLimitService | null = null;
function getService(): RateLimitService { if (!_svc) _svc = new RateLimitService(defaultRateLimitRules); return _svc; }

function accountKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  return createHash('sha256').update(raw.trim().toLowerCase(), 'utf8').digest('hex').slice(0, 16);
}

export function rateLimitMiddleware() {
  return async (ctx: Context, next: Next) => {
    const svc = getService();
    const rules = matchRateLimitRules(ctx.path, ctx.method, svc.getRules());
    if (rules.length === 0) { await next(); return; }

    const reqCtx = getRequestContext();
    const ip = reqCtx?.clientIp ?? ctx.ip ?? 'unknown';
    let minRemaining = Infinity;
    let minReset = 0;

    for (const rule of rules) {
      const routeKey = rule.path; // wildcard 共享同一个桶
      const key = getDimKey(rule.dimensions[0], reqCtx, ip, ctx);
      const result = await svc.check(rule, key, routeKey);

      if (!result.allowed) {
        ctx.state.metricsRoute = routeKey; // 提前返回路径写入标准化 route
        ctx.status = 429;
        ctx.set('Retry-After', String(result.retryAfter));
        rateLimitRejectedTotal.inc({ path: result.routeKey ?? ctx.path, dimension: result.dimension ?? 'default' });
        ctx.body = { code: 42901, message: '请求过于频繁，请稍后再试', data: null };
        return;
      }
      if (result.remaining < minRemaining) minRemaining = result.remaining;
      if (result.resetAt > minReset) minReset = result.resetAt;
    }

    if (minRemaining !== Infinity) {
      ctx.set('X-RateLimit-Remaining', String(minRemaining));
      ctx.set('X-RateLimit-Reset', String(minReset));
    }
    await next();
  };
}

function getDimKey(dim: string, reqCtx: any, ip: string, ctx: Context): string {
  switch (dim) {
    case 'ip': return ip;
    case 'user': return reqCtx?.userId ?? 'anonymous';
    case 'tenant': return reqCtx?.tenantId ?? '000000';
    case 'account': return accountKey((ctx.request.body as any)?.username) ?? 'anon';
    default: return ip;
  }
}
