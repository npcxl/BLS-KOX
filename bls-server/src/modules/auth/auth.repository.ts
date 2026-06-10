import { query, queryOne } from '../../core/database';
import { MenuTreeItem } from '../../shared/types/current-user';

export interface UserRecord {
  userId: number;
  username: string;
  password: string;
  nickname: string;
  avatar: string | null;
  tenantId: number;
  isAdmin: '0' | '1';
  status: '0' | '1';
}

export class AuthRepository {
  findUserByTenantAndUsername(tenantId: number, username: string): Promise<UserRecord | null> {
    return queryOne<UserRecord>(
      `SELECT user_id AS userId, username, password, nickname, avatar, tenant_id AS tenantId, is_admin AS isAdmin, status
       FROM sys_user
       WHERE tenant_id = :tenantId AND username = :username AND deleted = 0
       LIMIT 1`,
      { tenantId, username },
    );
  }

  findUserById(userId: number): Promise<UserRecord | null> {
    return queryOne<UserRecord>(
      `SELECT user_id AS userId, username, password, nickname, avatar, tenant_id AS tenantId, is_admin AS isAdmin, status
       FROM sys_user
       WHERE user_id = :userId AND deleted = 0
       LIMIT 1`,
      { userId },
    );
  }

  async listRoleKeys(userId: number): Promise<string[]> {
    const rows = await query<{ roleKey: string }>(
      `SELECT r.role_key AS roleKey
       FROM sys_role r
       INNER JOIN sys_user_role ur ON ur.role_id = r.role_id
       WHERE ur.user_id = :userId AND r.deleted = 0 AND r.status = '0'`,
      { userId },
    );
    return rows.map((row) => row.roleKey);
  }

  async listPerms(userId: number): Promise<string[]> {
    const rows = await query<{ perms: string | null }>(
      `SELECT DISTINCT m.perms
       FROM sys_menu m
       INNER JOIN sys_role_menu rm ON rm.menu_id = m.menu_id
       INNER JOIN sys_user_role ur ON ur.role_id = rm.role_id
       INNER JOIN sys_role r ON r.role_id = ur.role_id
       WHERE ur.user_id = :userId AND m.status = '0' AND r.status = '0' AND r.deleted = 0`,
      { userId },
    );
    return rows.map((row) => row.perms).filter((perm): perm is string => Boolean(perm));
  }

  listMenus(userId: number): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT DISTINCT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
              m.path, m.component, m.perms, m.menu_type AS menuType, m.sort_num AS sortNum
       FROM sys_menu m
       INNER JOIN sys_role_menu rm ON rm.menu_id = m.menu_id
       INNER JOIN sys_user_role ur ON ur.role_id = rm.role_id
       INNER JOIN sys_role r ON r.role_id = ur.role_id
       WHERE ur.user_id = :userId AND m.status = '0' AND r.status = '0' AND r.deleted = 0
       ORDER BY m.sort_num ASC`,
      { userId },
    );
  }

  listAllMenus(): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT menu_id AS menuId, parent_id AS parentId, menu_name AS menuName,
              path, component, perms, menu_type AS menuType, sort_num AS sortNum
       FROM sys_menu
       WHERE status = '0'
       ORDER BY sort_num ASC`,
    );
  }
}
