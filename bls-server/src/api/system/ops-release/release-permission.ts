import type { Context, Next } from 'koa';
import { logger } from '../../../../core/logger';

const PERMISSIONS: Record<string, string> = {
  'list': 'ops:release:view',
  'detail': 'ops:release:view',
  'steps': 'ops:release:view',
  'logs': 'ops:release:logs',
  'create': 'ops:release:create',
  'rollback': 'ops:release:rollback',
  'versions': 'ops:release:view',
  'current': 'ops:release:view',
  'services': 'ops:service:view',
};

/**
 * 发布操作权限中间件
 * 根据请求类型检查对应权限
 */
export function releasePermission(action: keyof typeof PERMISSIONS) {
  return async (ctx: Context, next: Next) => {
    const user = (ctx.state as any).user;
    if (!user?.permissions) {
      ctx.status = 403;
      ctx.body = { code: 403, message: '无权限' };
      return;
    }

    const requiredPerm = PERMISSIONS[action];
    if (!requiredPerm) {
      await next();
      return;
    }

    // 管理员角色自动放行
    if (user.roleKeys?.includes('admin')) {
      await next();
      return;
    }

    if (!user.permissions.includes(requiredPerm)) {
      logger.warn('[ReleasePermission] 权限不足', { userId: user.userId, required: requiredPerm });
      ctx.status = 403;
      ctx.body = { code: 403, message: `缺少权限: ${requiredPerm}` };
      return;
    }

    await next();
  };
}
