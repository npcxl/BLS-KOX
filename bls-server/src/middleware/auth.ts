import { Context, Next } from 'koa';
import { SessionInvalidError, UnauthorizedError } from '../core/errors';
import { AuthService } from '../modules/auth/auth.service';
import { getStoredSession } from '../modules/auth/auth.session';
import { parseBearerToken, verifyToken } from '../shared/utils/jwt';

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
      console.log('[jwtAuth] token jti=%s userId=%s tenantId=%s sessionExists=%s', payload.jti, payload.userId, payload.tenantId, Boolean(session));
      if (!session || session.userId !== payload.userId) {
        console.warn('[jwtAuth] session mismatch or missing jti=%s', payload.jti);
        throw new SessionInvalidError();
      }
      ctx.state.user = await authService.profile(payload.userId, payload.tenantId);
    } catch (error) {
      console.error('[jwtAuth] auth failed:', error);
      if (isJwtExpiredError(error)) {
        throw new UnauthorizedError('登录已过期');
      }
      throw error;
    }

    await next();
  };
}
