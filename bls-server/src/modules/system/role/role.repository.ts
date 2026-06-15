import { execute, query, queryOne, transaction } from "../../../core/database";
import { getCurrentTenantId } from "../../../middleware/tenant";
import { getPageParams } from "../../../shared/utils/pagination";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import { BaseCrudRepository } from "../common/base-crud";
import { RoleInput, RoleQuery } from "./role.model";

export class RoleRepository extends BaseCrudRepository {
  listRoles(query: RoleQuery) {
    return this.list(
      {
        table: "sys_role",
        idColumn: "role_id",
        selectSql: `
          SELECT 
            role_id AS roleId,
            tenant_id AS tenantId,
            role_name AS roleName,
            role_key AS roleKey,
            sort_num AS sortNum,
            status,
            remark,
            create_time AS createTime,
            update_time AS updateTime
          FROM sys_role
        `,
        keywordColumn: "role_name",
        keyword: query.keyword,
        status: query.status,
        extraConditions: [{ sql: "deleted = 0", params: {} }],
        orderBy: "sort_num ASC, role_id DESC",
      },
      getPageParams(query),
    );
  }

  async countMenusOutsideTenantPackage(menuIds: string[]): Promise<number> {
    if (menuIds.length === 0) return 0;
    const params = Object.fromEntries(
      menuIds.map((id, index) => [`menuId${index}`, id]),
    );
    const placeholders = menuIds.map((_, index) => `:menuId${index}`).join(", ");
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM sys_menu m
       WHERE m.menu_id IN (${placeholders})
         AND NOT EXISTS (
           SELECT 1
           FROM sys_tenant t
           INNER JOIN sys_package_menu pm ON pm.package_id = t.package_id AND pm.menu_id = m.menu_id
           WHERE t.tenant_id = :tenantId
         )`,
      { ...params, tenantId: getCurrentTenantId() },
    );
    return row?.total ?? 0;
  }

  createRole(input: RoleInput): Promise<string> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      throw new Error("缺少 tenantId，无法创建角色");
    }
    const roleId = input.roleId ?? generateSnowflakeId();
    return transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, sort_num, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          roleId,
          tenantId,
          input.roleName,
          input.roleKey,
          input.sortNum ?? 0,
          input.status ?? "0",
          input.remark ?? null,
        ],
      );
      if (input.menuIds?.length) {
        await conn.query(
          "INSERT INTO sys_role_menu (role_id, menu_id) VALUES ?",
          [input.menuIds.map((menuId) => [roleId, menuId])],
        );
      }
      return roleId;
    });
  }

  async updateRole(input: RoleInput & { roleId: string }): Promise<void> {
    await this.update("sys_role", "role_id", input.roleId, {
      roleName: input.roleName,
      roleKey: input.roleKey,
      sortNum: input.sortNum ?? 0,
      status: input.status ?? "0",
      remark: input.remark ?? null,
    });
    if (input.menuIds) {
      await this.assignMenus(input.roleId, input.menuIds);
    }
  }

  async findTenantRole(roleId: string): Promise<{ roleId: string } | null> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("缺少 tenantId，禁止访问租户数据");
    return queryOne<{ roleId: string }>(
      `SELECT role_id AS roleId
       FROM sys_role
       WHERE role_id = :roleId AND tenant_id = :tenantId AND deleted = 0
       LIMIT 1`,
      { roleId, tenantId },
    );
  }

  async listMenuIds(roleId: string): Promise<string[]> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("缺少 tenantId，禁止访问租户数据");
    const rows = await query<{ menuId: string }>(
      `SELECT rm.menu_id AS menuId
       FROM sys_role_menu rm
       INNER JOIN sys_role r ON r.role_id = rm.role_id
       WHERE rm.role_id = :roleId AND r.tenant_id = :tenantId AND r.deleted = 0`,
      { roleId, tenantId },
    );
    return rows.map((row) => row.menuId);
  }

  async assignMenus(roleId: string, menuIds: string[]): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("缺少 tenantId，禁止访问租户数据");
    await execute(
      `DELETE FROM sys_role_menu WHERE role_id = :roleId
       AND EXISTS (
         SELECT 1 FROM sys_role r
         WHERE r.role_id = :roleId
           AND r.tenant_id = :tenantId
           AND r.deleted = 0
       )`,
      { roleId, tenantId },
    );
    if (menuIds.length) {
      await execute(
        `INSERT INTO sys_role_menu (role_id, menu_id) VALUES ${menuIds
          .map((_, index) => `(:roleId, :menuId${index})`)
          .join(", ")}`,
        {
          roleId,
          ...Object.fromEntries(
            menuIds.map((menuId, index) => [`menuId${index}`, menuId]),
          ),
        },
      );
    }
  }
}
