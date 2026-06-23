import { execute, query } from "../../../core/database";
import { getCurrentTenantId } from "../../../middleware/tenant";
import { MenuTreeItem } from "../../../shared/types/current-user";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import { GlobalSearchRepository } from "../global-search/global-search.repository";
import { syncMenuSearchIndex } from "../global-search/global-search-sync";
import { MenuInput } from "./menu.model";

export class MenuRepository {
  private readonly searchRepo = new GlobalSearchRepository();

  listMenus(): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT menu_id AS menuId, parent_id AS parentId, menu_name AS menuName,
              icon, path, component, perms, status, menu_type AS menuType, sort_num AS sortNum
       FROM sys_menu
       ORDER BY sort_num ASC, menu_id ASC`,
    );
  }

  listPackageMenus(packageId: string): Promise<MenuTreeItem[]> {
    return query<MenuTreeItem>(
      `SELECT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
              m.icon, m.path, m.component, m.perms, m.status, m.menu_type AS menuType, m.sort_num AS sortNum
       FROM sys_menu m
       INNER JOIN sys_package_menu pm ON pm.menu_id = m.menu_id
       WHERE pm.package_id = :packageId
       ORDER BY m.sort_num ASC, m.menu_id ASC`,
      { packageId },
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
    await syncMenuSearchIndex(this.searchRepo, {
      menuId,
      tenantId: getCurrentTenantId(),
      menuName: input.menuName,
      path: input.path ?? null,
      component: input.component ?? null,
      perms: input.perms ?? null,
      status: input.status ?? "0",
      deleted: 0,
    });
    return menuId;
  }

  async update(input: MenuInput & { menuId: string }): Promise<unknown> {
    const result = await execute(
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
    await syncMenuSearchIndex(this.searchRepo, {
      menuId: input.menuId,
      tenantId: getCurrentTenantId(),
      menuName: input.menuName,
      path: input.path ?? null,
      component: input.component ?? null,
      perms: input.perms ?? null,
      status: input.status ?? "0",
      deleted: 0,
    });
    return result;
  }

  async remove(ids: string[]): Promise<unknown> {
    const result = await execute(
      `DELETE FROM sys_menu WHERE menu_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    for (const menuId of ids) {
      await this.searchRepo.deleteSearchIndex(getCurrentTenantId() ?? '000000', 'menu', menuId);
    }
    return result;
  }
}
