import type { Context, Next } from 'koa';
import { getRequestContext } from '../../core/request-context';
import { RateLimitService } from './RateLimitService';
import { defaultRateLimitRules, matchRateLimitRule } from './rules';
import type { RateLimitRule } from './types';

let _svc: RateLimitService | null = null;

function getService(): RateLimitService {
  if (!_svc) _svc = new RateLimitService(defaultRateLimitRules);
  return _svc;
}

/** 全局限流中间件 */
export function rateLimitMiddleware() {
  return async (ctx: Context, next: Next) => {
    const svc = getService();
    const rule = matchRateLimitRule(ctx.path, ctx.method, svc.getRules());
    if (!rule) { await next(); return; }

    const reqCtx = getRequestContext();
    const ip = reqCtx?.clientIp ?? ctx.ip ?? 'unknown';

    // 对每个维度分别检查
    for (const dim of rule.dimensions) {
      const key = dim === 'ip' ? ip : dim === 'user' ? (reqCtx?.userId ?? 'anonymous') : (reqCtx?.tenantId ?? '000000');
      const result = await svc.check(rule, key, ctx.path);

      if (!result.allowed) {
        ctx.status = 429;
        ctx.set('Retry-After', String(result.retryAfter));
        ctx.set('X-RateLimit-Remaining', String(result.remaining));
        ctx.set('X-RateLimit-Reset', String(result.resetAt));
        ctx.body = { code: 42901, message: '请求过于频繁，请稍后再试', data: null };
        return;
      }

      ctx.set('X-RateLimit-Remaining', String(result.remaining));
      ctx.set('X-RateLimit-Reset', String(result.resetAt));
    }

    await next();
  };
}
