import { execute, query } from "../../../core/database";
import { MenuTreeItem } from "../../../shared/types/current-user";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import { MenuInput } from "./menu.model";

export class MenuRepository {
  listMenus(): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT menu_id AS menuId, parent_id AS parentId, menu_name AS menuName,
              icon, path, component, perms,status, menu_type AS menuType, sort_num AS sortNum
       FROM sys_menu
       WHERE status = '0'
       ORDER BY sort_num ASC`,
    );
  }

  async create(input: MenuInput): Promise<string> {
    const menuId = input.menuId ?? generateSnowflakeId();
    await execute(
      `INSERT INTO sys_menu (menu_id, parent_id, menu_name, icon, path, component, perms, menu_type, sort_num, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        menuId,
        input.parentId,
        input.menuName,
        input.icon ?? null,
        input.path ?? null,
        input.component ?? null,
        input.perms ?? null,
        input.menuType,
        input.sortNum ?? 0,
        input.status ?? "0",
      ],
    );
    return menuId;
  }

  update(input: MenuInput & { menuId: string }): Promise<unknown> {
    return execute(
      `UPDATE sys_menu SET parent_id = ?, menu_name = ?, icon = ?, path = ?, component = ?,
       perms = ?, menu_type = ?, sort_num = ?, status = ? WHERE menu_id = ?`,
      [
        input.parentId,
        input.menuName,
        input.icon ?? null,
        input.path ?? null,
        input.component ?? null,
        input.perms ?? null,
        input.menuType,
        input.sortNum ?? 0,
        input.status ?? "0",
        input.menuId,
      ],
    );
  }

  remove(ids: string[]): Promise<unknown> {
    return execute(
      `DELETE FROM sys_menu WHERE menu_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
  }
}
