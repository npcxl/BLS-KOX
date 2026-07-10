import { Context, Next } from 'koa';
import { SessionInvalidError, UnauthorizedError } from '../core/errors';
import { AuthService, getStoredSession } from '../api/auth';
import { parseBearerToken, verifyToken } from '../shared/utils/jwt';
import { writeSecurityLog, actorFromCtx, SecurityEventType } from '../core/security-audit';

function isJwtExpiredError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'TokenExpiredError'
  );
}

const authService = new AuthService();

export function jwtAuth(options: { optional?: boolean } = {}) {
  return async (ctx: Context, next: Next): Promise<void> => {
    const rawToken = parseBearerToken(ctx.headers.authorization);
    if (!rawToken) {
      if (options.optional) {
        await next();
        return;
      }
      throw new UnauthorizedError();
    }

    try {
      const payload = verifyToken(rawToken);
      const session = await getStoredSession(payload.jti);
      if (!session || session.userId !== payload.userId) {
        // 会话失效
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_INVALID,
          title: `会话失效：${payload.username ?? 'unknown'}`,
          detail: { userId: payload.userId, tenantId: payload.tenantId, reason: 'session_mismatch' },
          actor: { ...actorFromCtx(ctx), userId: payload.userId, tenantId: payload.tenantId, username: payload.username },
          route: ctx.path,
          method: ctx.method,
          source: 'auth',
        }).catch(() => {});
        throw new SessionInvalidError();
      }
      ctx.state.user = await authService.profile(payload.userId, payload.tenantId);
    } catch (error) {
      if (isJwtExpiredError(error)) {
        // Token 过期
        const payload = parseJwtPayload(rawToken);
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_EXPIRED,
          title: `Token 过期：${payload?.username ?? 'unknown'}`,
          detail: { userId: payload?.userId, tenantId: payload?.tenantId },
          actor: { ...actorFromCtx(ctx), userId: payload?.userId, tenantId: payload?.tenantId, username: payload?.username },
          route: ctx.path,
          method: ctx.method,
          source: 'auth',
        }).catch(() => {});
        throw new UnauthorizedError('登录已过期');
      }
      // 其他认证失败
      if (!(error instanceof SessionInvalidError) && !(error instanceof UnauthorizedError)) {
        const payload = parseJwtPayload(rawToken);
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_INVALID,
          title: `Token 校验失败：${payload?.username ?? 'unknown'}`,
          detail: { error: String(error) },
          actor: { ...actorFromCtx(ctx), userId: payload?.userId, tenantId: payload?.tenantId, username: payload?.username },
          route: ctx.path,
          method: ctx.method,
          source: 'auth',
        }).catch(() => {});
      }
      throw error;
    }

    await next();
  };
}

/** 解码 JWT payload 但不抛错（仅用于审计日志） */
function parseJwtPayload(rawToken?: string): { userId?: string; tenantId?: string; username?: string } | null {
  if (!rawToken) return null;
  try {
    const jwt = require('jsonwebtoken');
    return jwt.decode(rawToken) as any;
  } catch {
    return null;
  }
}
