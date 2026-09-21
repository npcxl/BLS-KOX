import { Context, Next } from 'koa';
import { SessionInvalidError, UnauthorizedError } from '../core/errors';
import { AuthService } from '../api/auth';
import { parseBearerToken, verifyToken } from '../shared/utils/jwt';
import { writeSecurityLog, actorFromCtx, SecurityEventType } from '../core/security-audit';
import { sessionCenter } from '../security/session/session-center';
import { setRequestContext } from '../core/request-context';
import { assertTenantActive } from '../services/tenant-lifecycle';

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
    // 阶段六：/openapi/v1 请求已由 openApiAuth 建立可信租户上下文，这里直接放行
    if ((ctx.state as any).openApi) {
      await next();
      return;
    }

    const rawToken = parseBearerToken(ctx.headers.authorization);
    if (!rawToken) {
      if (options.optional) { await next(); return; }
      throw new UnauthorizedError();
    }

    try {
      const payload = verifyToken(rawToken);

      // 租户生命周期校验（阶段一）：停止 / 过期 / offboarding 的租户立即拒绝所有已签发的 access token
      try {
        await assertTenantActive(payload.tenantId);
      } catch (tenantError) {
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_INVALID,
          title: `租户不可用：${payload.username ?? 'unknown'}`,
          detail: {
            userId: payload.userId,
            tenantId: payload.tenantId,
            reason: 'tenant_inactive',
            message: tenantError instanceof Error ? tenantError.message : String(tenantError),
          },
          actor: { ...actorFromCtx(ctx), userId: payload.userId, tenantId: payload.tenantId, username: payload.username },
          route: ctx.path, method: ctx.method, source: 'auth',
        }).catch(() => {});
        throw new SessionInvalidError('租户已停用或过期，请重新登录');
      }

      // Session Center 校验（唯一真相源）
      const valid = await sessionCenter.validate(payload.tenantId, payload.userId, `acc:${payload.jti}`);
      if (!valid) {
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_INVALID,
          title: `会话失效：${payload.username ?? 'unknown'}`,
          detail: { userId: payload.userId, tenantId: payload.tenantId, reason: 'session_not_active' },
          actor: { ...actorFromCtx(ctx), userId: payload.userId, tenantId: payload.tenantId, username: payload.username },
          route: ctx.path, method: ctx.method, source: 'auth',
        }).catch(() => {});
        throw new SessionInvalidError();
      }

      const profile = await authService.profile(payload.userId, payload.tenantId);

      // 用户状态校验（阶段一）：删除 / 停用的用户立即失效
      if (Number((profile as any)?.deleted ?? 0) !== 0 || String((profile as any)?.status ?? '0') !== '0') {
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_INVALID,
          title: `用户不可用：${payload.username ?? 'unknown'}`,
          detail: { userId: payload.userId, tenantId: payload.tenantId, reason: 'user_inactive' },
          actor: { ...actorFromCtx(ctx), userId: payload.userId, tenantId: payload.tenantId, username: payload.username },
          route: ctx.path, method: ctx.method, source: 'auth',
        }).catch(() => {});
        await sessionCenter.revokeAll(payload.tenantId, payload.userId).catch(() => {});
        throw new SessionInvalidError('用户已被停用');
      }

      ctx.state.user = profile;

      // 更新 Request Context
      setRequestContext({ tenantId: payload.tenantId, userId: payload.userId, username: payload.username });
    } catch (error) {
      if (isJwtExpiredError(error)) {
        const payload = parseJwtPayload(rawToken);
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_EXPIRED,
          title: `Token 过期：${payload?.username ?? 'unknown'}`,
          detail: { userId: payload?.userId, tenantId: payload?.tenantId },
          actor: { ...actorFromCtx(ctx), userId: payload?.userId, tenantId: payload?.tenantId, username: payload?.username },
          route: ctx.path, method: ctx.method, source: 'auth',
        }).catch(() => {});
        throw new UnauthorizedError('登录已过期');
      }
      if (!(error instanceof SessionInvalidError) && !(error instanceof UnauthorizedError)) {
        const payload = parseJwtPayload(rawToken);
        await writeSecurityLog({
          eventType: SecurityEventType.TOKEN_INVALID,
          title: `Token 校验失败：${payload?.username ?? 'unknown'}`,
          detail: { error: String(error) },
          actor: { ...actorFromCtx(ctx), userId: payload?.userId, tenantId: payload?.tenantId, username: payload?.username },
          route: ctx.path, method: ctx.method, source: 'auth',
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
  } catch { return null; }
}
