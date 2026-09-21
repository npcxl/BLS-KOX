import { Context, Next } from 'koa';
import { ForbiddenError, UnauthorizedError } from '../core/errors';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../core/security-audit';
import { PLATFORM_TENANT_ID } from '../shared/constants/tenant';
import { scopesAllow, type ApiKeyScope } from '../services/api-key-service';

/**
 * 平台超级管理员角色标识。
 *
 * 阶段二：**只有**同时满足以下条件的身份才允许绕过 `hasPerm`：
 *   - tenantId === '000000'（平台租户）
 *   - sys_user.is_admin === '1'
 *   - 拥有平台超级管理员角色（role_key 落在此列表）或 `*` 权限
 *
 * “只要是平台租户就绕过所有权限”的历史行为已被删除：平台租户下的普通用户
 * （例如平台运营、客服账号）与普通租户用户一样必须通过 `hasPerm`。
 */
export const PLATFORM_SUPER_ADMIN_ROLE_KEYS = ['admin', 'platform_super_admin'];

export function isPlatformSuperAdmin(user: any): boolean {
  if (!user) return false;
  if (String(user.tenantId ?? '') !== PLATFORM_TENANT_ID) return false;
  if (String(user.isAdmin ?? '0') !== '1') return false;
  const perms: string[] = user.perms ?? user.permissions ?? [];
  const roles: Array<{ roleKey?: string }> = user.roles ?? [];
  const hasSuperRole = roles.some((r) => PLATFORM_SUPER_ADMIN_ROLE_KEYS.includes(String(r?.roleKey ?? '')));
  return hasSuperRole || perms.includes('*');
}

export function hasPerm(perm: string) {
  return async (ctx: Context, next: Next): Promise<void> => {
    // 阶段六：开放 API 请求按 scope 授权（read = 只读方法，write = 写方法）
    const openApi = (ctx.state as any).openApi;
    if (openApi) {
      const required: ApiKeyScope = ['GET', 'HEAD', 'OPTIONS'].includes(ctx.method.toUpperCase())
        ? 'read'
        : 'write';
      if (!scopesAllow(openApi.scopes ?? [], required)) {
        throw new ForbiddenError(`API Key 缺少 ${required} scope`);
      }
      await next();
      return;
    }

    const user = ctx.state.user as any;
    if (!user) throw new UnauthorizedError();

    // 权限字段兼容：AuthService.profile 返回 permissions，部分调用方使用 perms
    const perms: string[] = user.perms ?? user.permissions ?? [];

    // 跨租户访问检测：用户 tenantId 与请求中的 tenantId 不一致
    const requestedTenant = (ctx.query as any)?.tenantId
      ?? (ctx.request.body as any)?.tenantId
      ?? (ctx.params as any)?.tenantId;
    if (requestedTenant && String(requestedTenant) !== String(user.tenantId)) {
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

    // 阶段二：只有明确的平台超级管理员身份才绕过权限校验
    if (isPlatformSuperAdmin(user)) {
      await next();
      return;
    }

    if (!perms.includes(perm)) {
      await writeSecurityLog({
        eventType: SecurityEventType.PERMISSION_DENIED,
        riskLevel: RiskLevel.MEDIUM,
        title: `权限拒绝：${user.username} 缺少 ${perm}`,
        detail: { userId: user.userId, tenantId: user.tenantId, requiredPerm: perm, userPerms: perms.slice(0, 20) },
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
