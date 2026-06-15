import { execute, query, queryOne } from "../../../core/database";
import { eqCondition, joinConditions, likeCondition } from "../../../core/sql";
import { getCurrentTenantId, tenantWhere } from "../../../middleware/tenant";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import { Dept, DeptInput, DeptQuery } from "./dept.model";

export class DeptRepository {
  list(filters: DeptQuery): Promise<Dept[]> {
    const where = joinConditions([
      tenantWhere("sys_dept"),
      likeCondition("dept_name", "deptName", filters.deptName),
      eqCondition("status", "status", filters.status),
      { sql: "deleted = 0", params: {} },
    ]);
    return query<Dept>(
      `SELECT dept_id AS deptId, tenant_id AS tenantId, parent_id AS parentId, dept_name AS deptName,
              sort_num AS sortNum, status, create_time AS createTime, update_time AS updateTime
       FROM sys_dept
       ${where.sql}
       ORDER BY parent_id ASC, sort_num ASC, dept_id ASC`,
      where.params,
    );
  }

  findById(deptId: string): Promise<Dept | null> {
    const tenant = tenantWhere("sys_dept");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    return queryOne<Dept>(
      `SELECT dept_id AS deptId, tenant_id AS tenantId, parent_id AS parentId, dept_name AS deptName,
              sort_num AS sortNum, status, create_time AS createTime, update_time AS updateTime
       FROM sys_dept
       WHERE dept_id = :deptId AND deleted = 0${tenantSql}`,
      { deptId, ...tenant.params },
    );
  }

  async create(input: DeptInput): Promise<string> {
    const tenantId = getCurrentTenantId();
    const deptId = input.deptId ?? generateSnowflakeId();
    await execute(
      `INSERT INTO sys_dept (dept_id, tenant_id, parent_id, dept_name, sort_num, status)
       VALUES (:deptId, :tenantId, :parentId, :deptName, :sortNum, :status)`,
      {
        deptId,
        tenantId,
        parentId: input.parentId ?? "000000",
        deptName: input.deptName,
        sortNum: input.sortNum ?? 0,
        status: input.status ?? "0",
      },
    );
    return deptId;
  }

  update(input: DeptInput & { deptId: string }): Promise<unknown> {
    const tenant = tenantWhere("sys_dept");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    return execute(
      `UPDATE sys_dept
       SET parent_id = :parentId, dept_name = :deptName, sort_num = :sortNum, status = :status
       WHERE dept_id = :deptId AND deleted = 0${tenantSql}`,
      {
        deptId: input.deptId,
        parentId: input.parentId ?? "000000",
        deptName: input.deptName,
        sortNum: input.sortNum ?? 0,
        status: input.status ?? "0",
        ...tenant.params,
      },
    );
  }

  async hasChildren(deptId: string): Promise<boolean> {
    const tenant = tenantWhere("sys_dept");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sys_dept WHERE parent_id = :deptId AND deleted = 0${tenantSql}`,
      { deptId, ...tenant.params },
    );
    return (row?.total ?? 0) > 0;
  }

  remove(deptIds: string[]): Promise<unknown> {
    const tenant = tenantWhere("sys_dept");
    const idParams = Object.fromEntries(
      deptIds.map((id, index) => [`id${index}`, id]),
    );
    const idPlaceholders = deptIds.map((_, index) => `:id${index}`).join(", ");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    return execute(
      `UPDATE sys_dept SET deleted = 1 WHERE dept_id IN (${idPlaceholders})${tenantSql}`,
      { ...idParams, ...tenant.params },
    );
  }
}
