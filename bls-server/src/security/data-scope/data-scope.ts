/**
 * Data Scope — 数据权限模型
 *
 * 在 RBAC 基础上增加"能看到哪些数据"的控制。
 *
 * Scope 类型:
 *   ALL               — 全部数据
 *   TENANT            — 仅当前租户（已有 tenant_id 自动注入）
 *   DEPT              — 仅所属部门
 *   DEPT_AND_CHILDREN — 所属部门及子部门
 *   SELF              — 仅自己的数据
 *   CUSTOM            — 自定义规则
 */

export type DataScopeType = 'ALL' | 'TENANT' | 'DEPT' | 'DEPT_AND_CHILDREN' | 'SELF' | 'CUSTOM';

export interface DataScopeConfig {
  /** 当前用户 ID */
  userId: string;
  /** 当前租户 ID */
  tenantId: string;
  /** 用户所属部门 ID 列表 */
  deptIds: string[];
  /** 用户角色中最大的数据权限范围 */
  scope: DataScopeType;
  /** 自定义 SQL WHERE 条件 */
  customCondition?: string;
}

/**
 * 根据数据权限范围生成 SQL WHERE 条件和参数
 */
export function buildScopeCondition(
  config: DataScopeConfig,
  tableAlias?: string,
): { sql: string; params: Record<string, unknown> } | null {
  const t = tableAlias ? `${tableAlias}.` : '';

  switch (config.scope) {
    case 'ALL':
      return null; // 无限制

    case 'TENANT':
      return { sql: `${t}tenant_id = :__scope_tenant`, params: { __scope_tenant: config.tenantId } };

    case 'SELF':
      return { sql: `${t}create_by = :__scope_user OR ${t}user_id = :__scope_user2`, params: { __scope_user: config.userId, __scope_user2: config.userId } };

    case 'DEPT':
      if (config.deptIds.length === 0) {
        return { sql: '1 = 0', params: {} }; // 无部门 → 看不到任何数据
      }
      return {
        sql: `${t}dept_id IN (${config.deptIds.map(() => `:__scope_dept`).join(',')})`,
        params: Object.fromEntries(config.deptIds.map((id, i) => [`__scope_dept${i === 0 ? '' : i}`, id])),
      };

    case 'DEPT_AND_CHILDREN':
      if (config.deptIds.length === 0) {
        return { sql: '1 = 0', params: {} };
      }
      // 需要先查询所有子部门 ID，这里先做成占位，调用方需传入完整 dept 列表
      return {
        sql: `${t}dept_id IN (${config.deptIds.map(() => `:__scope_dept`).join(',')})`,
        params: Object.fromEntries(config.deptIds.map((id, i) => [`__scope_dept${i === 0 ? '' : i}`, id])),
      };

    case 'CUSTOM':
      return config.customCondition
        ? { sql: config.customCondition, params: {} }
        : null;

    default:
      return null;
  }
}

/**
 * 根据用户角色列表解析最高数据权限范围
 */
export function resolveMaxScope(roles: { dataScope?: DataScopeType }[]): DataScopeType {
  const priority: Record<DataScopeType, number> = {
    ALL: 0, CUSTOM: 1, TENANT: 2, DEPT_AND_CHILDREN: 3, DEPT: 4, SELF: 5,
  };
  let max: DataScopeType = 'SELF';
  for (const r of roles) {
    const s = r.dataScope ?? 'TENANT';
    if (priority[s] < priority[max]) max = s;
  }
  return max;
}
