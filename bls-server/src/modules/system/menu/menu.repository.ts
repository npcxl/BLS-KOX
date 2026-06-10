import { execute, query } from '../../../core/database';
import { MenuTreeItem } from '../../../shared/types/current-user';
import { MenuInput } from './menu.model';

export class MenuRepository {
  listMenus(): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT menu_id AS menuId, parent_id AS parentId, menu_name AS menuName,
              path, component, perms, menu_type AS menuType, sort_num AS sortNum
       FROM sys_menu
       WHERE status = '0'
       ORDER BY sort_num ASC`,
    );
  }

  async create(input: MenuInput): Promise<number> {
    const result = await execute(
      `INSERT INTO sys_menu (parent_id, menu_name, path, component, perms, menu_type, sort_num, status)
       VALUES (:parentId, :menuName, :path, :component, :perms, :menuType, :sortNum, :status)`,
      {
        parentId: input.parentId,
        menuName: input.menuName,
        path: input.path ?? null,
        component: input.component ?? null,
        perms: input.perms ?? null,
        menuType: input.menuType,
        sortNum: input.sortNum ?? 0,
        status: input.status ?? '0',
      },
    );
    return result.insertId;
  }

  update(input: MenuInput & { menuId: number }): Promise<unknown> {
    return execute(
      `UPDATE sys_menu SET parent_id = :parentId, menu_name = :menuName, path = :path, component = :component,
       perms = :perms, menu_type = :menuType, sort_num = :sortNum, status = :status WHERE menu_id = :menuId`,
      {
        menuId: input.menuId,
        parentId: input.parentId,
        menuName: input.menuName,
        path: input.path ?? null,
        component: input.component ?? null,
        perms: input.perms ?? null,
        menuType: input.menuType,
        sortNum: input.sortNum ?? 0,
        status: input.status ?? '0',
      },
    );
  }

  remove(ids: number[]): Promise<unknown> {
    return execute(`DELETE FROM sys_menu WHERE menu_id IN (${ids.map(() => '?').join(',')})`, ids);
  }
}
