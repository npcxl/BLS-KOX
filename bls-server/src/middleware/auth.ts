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
      const payload = verifyToken(rawToken);
      ctx.state.user = await authService.profile(payload.userId);
      await next();
    } catch {
      throw new UnauthorizedError();
    }
  };
}
