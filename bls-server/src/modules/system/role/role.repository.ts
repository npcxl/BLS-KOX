import { execute, transaction } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getPageParams } from '../../../shared/utils/pagination';
import { BaseCrudRepository } from '../common/base-crud';
import { RoleInput, RoleQuery } from './role.model';

export class RoleRepository extends BaseCrudRepository {
  listRoles(query: RoleQuery) {
    return this.list(
      {
        table: 'sys_role',
        idColumn: 'role_id',
        selectSql: `SELECT role_id AS roleId, tenant_id AS tenantId, role_name AS roleName, role_key AS roleKey,
                    sort_num AS sortNum, status, remark, create_time AS createTime, update_time AS updateTime FROM sys_role`,
        keywordColumn: 'role_name',
        keyword: query.keyword,
        status: query.status,
        extraConditions: [{ sql: 'deleted = 0', params: {} }],
      },
      getPageParams(query),
    );
  }

  createRole(input: RoleInput): Promise<number> {
    const tenantId = getCurrentTenantId();
    return transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO sys_role (tenant_id, role_name, role_key, sort_num, status, remark)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, input.roleName, input.roleKey, input.sortNum ?? 0, input.status ?? '0', input.remark ?? null],
      );
      const roleId = (result as { insertId: number }).insertId;
      if (input.menuIds?.length) {
        await conn.query('INSERT INTO sys_role_menu (role_id, menu_id) VALUES ?', [input.menuIds.map((menuId) => [roleId, menuId])]);
      }
      return roleId;
    });
  }

  async updateRole(input: RoleInput & { roleId: number }): Promise<void> {
    await this.update('sys_role', 'role_id', input.roleId, {
      roleName: input.roleName,
      roleKey: input.roleKey,
      sortNum: input.sortNum ?? 0,
      status: input.status ?? '0',
      remark: input.remark ?? null,
    });
    await execute('DELETE FROM sys_role_menu WHERE role_id = :roleId', { roleId: input.roleId });
    if (input.menuIds?.length) {
      await execute(`INSERT INTO sys_role_menu (role_id, menu_id) VALUES ${input.menuIds.map(() => '(?, ?)').join(',')}`, input.menuIds.flatMap((menuId) => [input.roleId, menuId]));
    }
  }
}
