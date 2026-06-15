import { execute, query, queryOne, transaction } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition } from '../../../core/sql';
import { getPageParams } from '../../../shared/utils/pagination';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { PackageInput, PackageQuery, PackageRecord } from './package.model';

function buildIds(ids: string[]) {
  return {
    params: Object.fromEntries(ids.map((id, index) => [`id${index}`, id])),
    placeholders: ids.map((_, index) => `:id${index}`).join(', '),
  };
}

export class PackageRepository {
  async list(filters: PackageQuery): Promise<{ rows: PackageRecord[]; total: number }> {
    const page = getPageParams(filters);
    const where = joinConditions([
      likeCondition('package_name', 'packageName', filters.packageName),
      eqCondition('status', 'status', filters.status),
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const rows = await query<PackageRecord>(
      `SELECT package_id AS packageId, package_name AS packageName, status, remark,
              create_time AS createTime, update_time AS updateTime
       FROM sys_package
       ${where.sql}
       ORDER BY create_time DESC, package_id DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM sys_package ${where.sql}`, where.params);
    return { rows, total: total?.total ?? 0 };
  }

  findById(packageId: string): Promise<PackageRecord | null> {
    return queryOne<PackageRecord>(
      `SELECT package_id AS packageId, package_name AS packageName, status, remark,
              create_time AS createTime, update_time AS updateTime
       FROM sys_package
       WHERE package_id = :packageId
       LIMIT 1`,
      { packageId },
    );
  }

  listOptions(): Promise<Pick<PackageRecord, 'packageId' | 'packageName'>[]> {
    return query<Pick<PackageRecord, 'packageId' | 'packageName'>>(
      `SELECT package_id AS packageId, package_name AS packageName
       FROM sys_package
       WHERE status = '0'
       ORDER BY create_time DESC`
    );
  }

  async create(input: PackageInput): Promise<string> {
    const packageId = input.packageId ?? generateSnowflakeId();
    await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO sys_package (package_id, package_name, status, remark)
         VALUES (?, ?, ?, ?)`,
        [packageId, input.packageName, input.status ?? '0', input.remark ?? null],
      );
      if (input.menuIds?.length) {
        await conn.query('INSERT INTO sys_package_menu (package_id, menu_id) VALUES ?', [
          input.menuIds.map((menuId) => [packageId, menuId]),
        ]);
      }
    });
    return packageId;
  }

  async update(input: PackageInput & { packageId: string }): Promise<void> {
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE sys_package
         SET package_name = ?, status = ?, remark = ?
         WHERE package_id = ?`,
        [input.packageName, input.status ?? '0', input.remark ?? null, input.packageId],
      );
      if (input.menuIds) {
        await conn.execute('DELETE FROM sys_package_menu WHERE package_id = ?', [input.packageId]);
        if (input.menuIds.length) {
          await conn.query('INSERT INTO sys_package_menu (package_id, menu_id) VALUES ?', [
            input.menuIds.map((menuId) => [input.packageId, menuId]),
          ]);
        }
      }
    });
  }

  remove(ids: string[]): Promise<unknown> {
    const built = buildIds(ids);
    return execute(`DELETE FROM sys_package WHERE package_id IN (${built.placeholders})`, built.params);
  }

  async listMenuIds(packageId: string): Promise<string[]> {
    const rows = await query<{ menuId: string }>(
      `SELECT menu_id AS menuId FROM sys_package_menu WHERE package_id = :packageId`,
      { packageId },
    );
    return rows.map((row) => row.menuId);
  }

  async assignMenus(packageId: string, menuIds: string[]): Promise<void> {
    await transaction(async (conn) => {
      await conn.execute('DELETE FROM sys_package_menu WHERE package_id = ?', [packageId]);
      if (menuIds.length) {
        await conn.query('INSERT INTO sys_package_menu (package_id, menu_id) VALUES ?', [
          menuIds.map((menuId) => [packageId, menuId]),
        ]);
      }
    });
  }

  async countBoundTenants(packageIds: string[]): Promise<number> {
    if (!packageIds.length) return 0;
    const built = buildIds(packageIds);
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sys_tenant WHERE package_id IN (${built.placeholders})`,
      built.params,
    );
    return row?.total ?? 0;
  }
}
