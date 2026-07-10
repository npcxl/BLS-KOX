import { Context, Next } from 'koa';
import { ForbiddenError, UnauthorizedError } from '../core/errors';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../core/security-audit';

export function hasPerm(perm: string) {
  return async (ctx: Context, next: Next): Promise<void> => {
    const user = ctx.state.user;
    if (!user) throw new UnauthorizedError();

    // 跨租户访问检测：用户 tenantId 与请求路径中的 tenantId 不一致
    const requestedTenant = (ctx.query as any)?.tenantId
      ?? (ctx.request.body as any)?.tenantId
      ?? (ctx.params as any)?.tenantId;
    if (requestedTenant && user.tenantId !== '000000' && String(requestedTenant) !== user.tenantId) {
      await writeSecurityLog({
        eventType: SecurityEventType.CROSS_TENANT_ACCESS,
        riskLevel: RiskLevel.HIGH,
        title: `跨租户访问：${user.username} (${user.tenantId}) → ${requestedTenant}`,
        detail: { userTenantId: user.tenantId, requestTenantId: requestedTenant, perm },
        actor: actorFromCtx(ctx),
        route: ctx.path,
        method: ctx.method,
        source: 'permission',
      }).catch(() => {});
    }

    // 平台租户或超级管理员
    if (user.tenantId === "000000" || user.perms.includes('*')) {
      await next();
      return;
    }

    if (!user.perms.includes(perm)) {
      await writeSecurityLog({
        eventType: SecurityEventType.PERMISSION_DENIED,
        riskLevel: RiskLevel.MEDIUM,
        title: `权限拒绝：${user.username} 缺少 ${perm}`,
        detail: { userId: user.userId, tenantId: user.tenantId, requiredPerm: perm, userPerms: user.perms.slice(0, 20) },
        actor: actorFromCtx(ctx),
        route: ctx.path,
        method: ctx.method,
        source: 'permission',
      }).catch(() => {});
      throw new ForbiddenError();
    }
    await next();
  };
}
