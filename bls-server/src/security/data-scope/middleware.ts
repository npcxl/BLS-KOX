/**
 * Data Scope 中间件
 * 自动注入 ctx.state.dataScope
 */
import type { Context, Next } from 'koa';
import { resolveMaxScope, type DataScopeConfig, type DataScopeType } from './data-scope';
import { getRequestContext } from '../../core/request-context';
import { logger } from '../../core/logger';

export async function buildDataScope(ctx: Context): Promise<DataScopeConfig | null> {
  const reqCtx = getRequestContext();
  const userId = reqCtx?.userId ?? ctx.state.user?.userId ?? '';
  const tenantId = reqCtx?.tenantId ?? ctx.state.user?.tenantId ?? '';
  if (!userId || !tenantId) return null;

  // 从 ctx.state.user 获取角色和部门
  const userRoles: { dataScope?: DataScopeType }[] = (ctx.state.user?.roles ?? []).map((r: any) =>
    typeof r === 'string' ? { dataScope: 'TENANT' as DataScopeType } : r,
  );
  const scope = resolveMaxScope(userRoles);

  // 获取用户部门 ID
  const deptIds: string[] = [];
  if (ctx.state.user?.deptId) deptIds.push(String(ctx.state.user.deptId));

  // DEPT_AND_CHILDREN: 递归查询子部门
  if (scope === 'DEPT_AND_CHILDREN' && deptIds.length > 0) {
    try {
      const { getDb } = require('../../core/database');
      const db = await getDb();
      const allDeptIds = [...deptIds];
      let parents = [...deptIds];
      while (parents.length > 0) {
        const children = (await db
          .selectFrom('sys_dept').select('dept_id')
          .where('parent_id', 'in', parents).where('deleted', '=', 0)
          .execute()) as any[];
        if (children.length === 0) break;
        parents = children.map((c: any) => String(c.dept_id));
        allDeptIds.push(...parents);
      }
      return { userId, tenantId, deptIds: allDeptIds, scope };
    } catch (err) {
      logger.warn('[data-scope] dept query failed', { error: String(err) });
    }
  }

  return { userId, tenantId, deptIds, scope };
}

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
