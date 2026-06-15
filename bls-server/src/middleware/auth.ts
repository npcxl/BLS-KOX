import { Context, Next } from 'koa';
import { UnauthorizedError } from '../core/errors';
import { AuthService } from '../modules/auth/auth.service';
import { parseBearerToken, verifyToken } from '../shared/utils/jwt';

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
      if (authService.isTokenRevoked(rawToken)) {
        throw new UnauthorizedError();
      }
      const payload = verifyToken(rawToken);
      ctx.state.user = await authService.profile(payload.userId, payload.tenantId);
      await next();
    } catch (error) {
      console.error('[jwtAuth] auth failed:', error);
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError();
    }
  };
}
