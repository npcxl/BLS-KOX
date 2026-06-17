import { query, queryOne } from "../../core/database";
import { MenuTreeItem, TenantInfo } from "../../shared/types/current-user";

export interface UserRecord {
  userId: string;
  username: string;
  password: string;
  nickname: string;
  realName: string | null;
  avatar: string | null;
  gender: "0" | "1" | "2" | null;
  email: string | null;
  phone: string | null;
  deptId: string | null;
  deptName: string | null;
  tenantId: string;
  isAdmin: "0" | "1";
  status: "0" | "1";
  remark: string | null;
}

export interface LoginTenantRecord extends TenantInfo {}

export class AuthRepository {
  findTenantByDomain(domainName: string): Promise<LoginTenantRecord | null> {
    return queryOne<LoginTenantRecord>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, package_id AS packageId,
              expire_time AS expireTime, domain_name AS domainName, status
       FROM sys_tenant
       WHERE LOWER(domain_name) = LOWER(:domainName)
       LIMIT 1`,
      { domainName },
    );
  }

  findTenantById(tenantId: string): Promise<LoginTenantRecord | null> {
    return queryOne<LoginTenantRecord>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, package_id AS packageId,
              expire_time AS expireTime, domain_name AS domainName, status
       FROM sys_tenant
       WHERE tenant_id = :tenantId
       LIMIT 1`,
      { tenantId },
    );
  }

  findUserByTenantAndUsername(
    tenantId: string,
    username: string,
  ): Promise<UserRecord | null> {
    return queryOne<UserRecord>(
      `SELECT u.user_id AS userId, u.username, u.password, u.nickname, u.real_name AS realName, u.avatar,
              u.gender, u.email, u.phone, u.dept_id AS deptId, d.dept_name AS deptName, u.is_admin AS isAdmin, u.status, u.remark,
              u.tenant_id AS tenantId
       FROM sys_user u
       LEFT JOIN sys_dept d ON d.dept_id = u.dept_id AND d.deleted = 0
       WHERE u.tenant_id = :tenantId AND u.username = :username AND u.deleted = 0
       LIMIT 1`,
      { tenantId, username },
    );
  }

  findUserById(userId: string, tenantId: string): Promise<UserRecord | null> {
    return queryOne<UserRecord>(
      `SELECT u.user_id AS userId, u.username, u.password, u.nickname, u.real_name AS realName, u.avatar,
              u.gender, u.email, u.phone, u.dept_id AS deptId, d.dept_name AS deptName, u.is_admin AS isAdmin, u.status, u.remark,
              u.tenant_id AS tenantId
       FROM sys_user u
       LEFT JOIN sys_dept d ON d.dept_id = u.dept_id AND d.deleted = 0
       WHERE u.user_id = :userId AND u.tenant_id = :tenantId AND u.deleted = 0
       LIMIT 1`,
      { userId, tenantId },
    );
  }

  async listRoleKeys(userId: string, tenantId: string): Promise<string[]> {
    const rows = await query<{ roleKey: string }>(
      `SELECT r.role_key AS roleKey
       FROM sys_role r
       INNER JOIN sys_user_role ur ON ur.role_id = r.role_id
       WHERE ur.user_id = :userId
         AND r.tenant_id = :tenantId
         AND r.deleted = 0
         AND r.status = '0'`,
      { userId, tenantId },
    );
    return rows.map((row) => row.roleKey);
  }

  async listPerms(userId: string, tenantId: string): Promise<string[]> {
    const rows = await query<{ perms: string | null }>(
      `SELECT DISTINCT m.perms
       FROM sys_menu m
       INNER JOIN sys_package_menu pm ON pm.menu_id = m.menu_id
       INNER JOIN sys_tenant t ON t.package_id = pm.package_id AND t.tenant_id = :tenantId
       INNER JOIN sys_role_menu rm ON rm.menu_id = m.menu_id
       INNER JOIN sys_user_role ur ON ur.role_id = rm.role_id
       INNER JOIN sys_role r ON r.role_id = ur.role_id AND r.tenant_id = :tenantId
       WHERE ur.user_id = :userId
         AND m.status = '0'
         AND r.status = '0'
         AND r.deleted = 0`,
      { userId, tenantId },
    );
    return rows
      .map((row) => row.perms)
      .filter((perm): perm is string => Boolean(perm));
  }

  listMenus(userId: string, tenantId: string): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT DISTINCT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
              m.icon, m.path, m.component, m.perms, m.menu_type AS menuType, m.sort_num AS sortNum
       FROM sys_menu m
       INNER JOIN sys_package_menu pm ON pm.menu_id = m.menu_id
       INNER JOIN sys_tenant t ON t.package_id = pm.package_id AND t.tenant_id = :tenantId
       INNER JOIN sys_role_menu rm ON rm.menu_id = m.menu_id
       INNER JOIN sys_user_role ur ON ur.role_id = rm.role_id
       INNER JOIN sys_role r ON r.role_id = ur.role_id AND r.tenant_id = :tenantId
       WHERE ur.user_id = :userId
         AND m.status = '0'
         AND r.status = '0'
         AND r.deleted = 0
       ORDER BY m.sort_num ASC`,
      { userId, tenantId },
    );
  }

  listPackageMenus(tenantId: string): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT DISTINCT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
              m.icon, m.path, m.component, m.perms, m.menu_type AS menuType, m.sort_num AS sortNum
       FROM sys_menu m
       INNER JOIN sys_package_menu pm ON pm.menu_id = m.menu_id
       INNER JOIN sys_tenant t ON t.package_id = pm.package_id AND t.tenant_id = :tenantId
       WHERE m.status = '0'
       ORDER BY m.sort_num ASC`,
      { tenantId },
    );
  }
}
