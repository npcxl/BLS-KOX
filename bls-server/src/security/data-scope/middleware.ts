/**
 * Data Scope 中间件
 *
 * 自动注入 ctx.state.dataScope，供业务处理使用。
 */
import type { Context, Next } from 'koa';
import { resolveMaxScope, type DataScopeConfig } from './data-scope';
import { getRequestContext } from '../../core/request-context';
import { logger } from '../../core/logger';

/**
 * 从上下文构建 DataScope 配置
 */
export async function buildDataScope(ctx: Context): Promise<DataScopeConfig | null> {
  const reqCtx = getRequestContext();
  const userId = reqCtx?.userId ?? ctx.state.user?.userId;
  const tenantId = reqCtx?.tenantId ?? ctx.state.user?.tenantId;
  if (!userId || !tenantId) return null;

  // 获取用户角色列表
  const roles = ctx.state.user?.roles ?? [];
  const scope = resolveMaxScope(roles);

  // 获取用户部门（从 ctx.state.user 中）
  const deptIds: string[] = ctx.state.user?.deptIds ?? ctx.state.user?.deptId ? [ctx.state.user.deptId] : [];

  // DEPT_AND_CHILDREN 需要递归查询子部门
  if (scope === 'DEPT_AND_CHILDREN' && deptIds.length > 0) {
    try {
      const { getDb } = require('../../core/database');
      const db = await getDb();
      const allDeptIds = [...deptIds];
      let parents = deptIds;
      while (parents.length > 0) {
        const children = await db
          .selectFrom('sys_dept')
          .select('dept_id')
          .where('parent_id', 'in', parents)
          .where('deleted', '=', 0)
          .execute() as any[];
        if (children.length === 0) break;
        parents = children.map((c: any) => String(c.dept_id));
        allDeptIds.push(...parents);
      }
      return { userId, tenantId, deptIds: allDeptIds, scope };
    } catch (err) {
      logger.warn('[data-scope] recursive dept query failed', { error: String(err) });
    }
  }

  return { userId, tenantId, deptIds, scope };
}

/**
 * Data Scope 中间件
 */
export function dataScope(options?: { required?: boolean }) {
  return async (ctx: Context, next: Next) => {
    const scope = await buildDataScope(ctx);
    if (options?.required && !scope) {
      ctx.status = 403;
      ctx.body = { code: 403, message: '数据权限解析失败' };
      return;
    }
    ctx.state.dataScope = scope;
    await next();
  };
}
