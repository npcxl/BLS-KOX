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
 *
 * FIX-01: 修复 IN 占位符重名 Bug，改用 Kysely 原生 where 回调
 * FIX-02: 支持列名映射，不再硬编码 dept_id / user_id / create_by
 */

export type DataScopeType = 'ALL' | 'TENANT' | 'DEPT' | 'DEPT_AND_CHILDREN' | 'SELF' | 'CUSTOM';

export interface DataScopeConfig {
  userId: string;
  tenantId: string;
  /** 递归后的完整部门 ID 列表（含所有子部门） */
  deptIds: string[];
  scope: DataScopeType;
  customCondition?: string;
}

/** 列名映射——不同表可能有不同的字段名 */
export interface DataScopeColumnMapping {
  /** SELF scope 用的字段，默认 'create_by' */
  selfField?: string;
  /** SELF scope 用的第二个字段（如 'user_id'），默认不设 */
  userField?: string;
  /** DEPT scope 用的字段，默认 'dept_id' */
  deptField?: string;
}

/**
 * 根据配置生成 Kysely 兼容的 WHERE 条件回调
 *
 * @returns WHERE 表达式回调，或 null（表示无限制）
 */
export function buildScopeWhere(
  config: DataScopeConfig,
  columnMapping?: DataScopeColumnMapping,
): ((eb: any) => any) | null {
  const selfField = columnMapping?.selfField ?? 'create_by';
  const userField = columnMapping?.userField;
  const deptField = columnMapping?.deptField ?? 'dept_id';

  switch (config.scope) {
    case 'ALL':
      return null;

    case 'TENANT':
      return null; // tenant_id 由租户中间件统一注入

    case 'SELF': {
      if (userField) {
        return (eb: any) => eb.or([eb(selfField, '=', config.userId), eb(userField, '=', config.userId)]);
      }
      return (eb: any) => eb(selfField, '=', config.userId);
    }

    case 'DEPT': {
      if (config.deptIds.length === 0) {
        return () => false; // 无部门 → 无数据
      }
      return (eb: any) => eb(deptField, 'in', config.deptIds);
    }

    case 'DEPT_AND_CHILDREN': {
      if (config.deptIds.length === 0) {
        return () => false;
      }
      return (eb: any) => eb(deptField, 'in', config.deptIds);
    }

    case 'CUSTOM':
      // CUSTOM 暂未实现可视化编辑器，先放行
      return null;

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
