import { Context, Next } from 'koa';
import { ForbiddenError, UnauthorizedError } from '../core/errors';

export function hasPerm(perm: string) {
  return async (ctx: Context, next: Next): Promise<void> => {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError();
    if (user.tenantId === 0 || user.perms.includes('*')) {
      await next();
      return;
    }
    if (!user.perms.includes(perm)) throw new ForbiddenError();
    await next();
  };
}
