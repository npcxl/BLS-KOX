import { Context, Next } from 'koa';
import { getRequestContext } from '../core/request-context';
import { logger } from '../core/logger';

/**
 * AI 请求审计日志中间件
 * 记录所有 /api/ai/* 请求的完整信息
 */
export async function auditLogMiddleware(ctx: Context, next: Next): Promise<void> {
  const startTime = Date.now();

  await next();

  const duration = Date.now() - startTime;
  const ctxInfo = getRequestContext();

  logger.info('AI 审计日志', {
    type: 'ai_audit',
    method: ctx.method,
    path: ctx.path,
    status: ctx.status,
    durationMs: duration,
    tenantId: ctxInfo?.tenantId ?? '-',
    userId: ctxInfo?.userId ?? '-',
    username: ctxInfo?.username ?? '-',
    clientIp: ctxInfo?.clientIp ?? '-',
    userAgent: ctxInfo?.userAgent ?? '-',
    requestBody: maskSensitive(ctx.request.body),
    responseCode: (ctx.body as any)?.code,
  });
}

/** 脱敏处理，避免日志中记录敏感信息 */
function maskSensitive(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const masked = { ...body };
  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'];
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      masked[key] = '***';
    }
  }
  return masked;
}
