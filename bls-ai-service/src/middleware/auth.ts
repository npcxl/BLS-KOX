import { Context, Next } from 'koa';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../core/errors';
import { setAuthContext } from '../core/request-context';
import { logger } from '../core/logger';

interface JwtPayload {
  userId: string;
  tenantId: string;
  username?: string;
  jti: string;
  tokenType: string;
  exp?: number;
}

function parseBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

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
      const payload = jwt.verify(rawToken, env.jwt.secret) as JwtPayload;

      // 验证 token 类型必须为 access
      if (payload.tokenType !== 'access') {
        throw new UnauthorizedError('无效的访问令牌');
      }

      // 将用户信息注入上下文
      setAuthContext({
        userId: payload.userId,
        tenantId: payload.tenantId,
        username: payload.username,
      });

      logger.debug('JWT 认证成功', { userId: payload.userId, tenantId: payload.tenantId });
    } catch (error: any) {
      if (error instanceof UnauthorizedError) throw error;

      if (error.name === 'TokenExpiredError') {
        logger.warn('JWT Token 已过期');
        throw new UnauthorizedError('登录已过期');
      }

      logger.warn('JWT 认证失败', { error: error.message });
      throw new UnauthorizedError();
    }

    await next();
  };
}
