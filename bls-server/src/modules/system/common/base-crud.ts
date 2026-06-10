import { execute, query, queryOne } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition, SqlFragment } from '../../../core/sql';
import { tenantWhere } from '../../../middleware/tenant';
import { PageParams } from '../../../shared/utils/pagination';

export interface BaseListOptions {
  table: string;
  idColumn: string;
  selectSql: string;
  orderBy?: string;
  tenantScoped?: boolean;
  keywordColumn?: string;
  keyword?: unknown;
  status?: unknown;
  extraConditions?: SqlFragment[];
}

export class BaseCrudRepository {
  async list<T>(options: BaseListOptions, page: PageParams): Promise<{ rows: T[]; total: number }> {
    const tenant = options.tenantScoped === false ? { sql: '', params: {} } : tenantWhere(options.table);
    const where = joinConditions([
      tenant,
      options.keywordColumn ? likeCondition(options.keywordColumn, 'keyword', options.keyword) : { sql: '', params: {} },
      eqCondition('status', 'status', options.status),
      ...(options.extraConditions ?? []),
    ]);
    const orderBy = options.orderBy ?? `${options.idColumn} DESC`;
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const rows = await query<T>(`${options.selectSql} ${where.sql} ORDER BY ${orderBy} LIMIT :offset, :pageSize`, params);
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM ${options.table} ${where.sql}`, where.params);
    return { rows, total: total?.total ?? 0 };
  }

  insert(table: string, data: Record<string, unknown>): Promise<{ insertId: number }> {
    const keys = Object.keys(data);
    const columns = keys.map((key) => key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`));
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${keys.map((key) => `:${key}`).join(', ')})`;
    return execute(sql, data).then((result) => ({ insertId: result.insertId }));
  }

  update(table: string, idColumn: string, id: number, data: Record<string, unknown>, tenantScoped = true): Promise<unknown> {
    const keys = Object.keys(data);
    const sets = keys.map((key) => `${key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)} = :${key}`);
    const tenant = tenantScoped ? tenantWhere(table) : { sql: '', params: {} };
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${idColumn} = :id${tenantSql}`, { ...data, id, ...tenant.params });
  }

  softDelete(table: string, idColumn: string, ids: number[], tenantScoped = true): Promise<unknown> {
    const tenant = tenantScoped ? tenantWhere(table) : { sql: '', params: {} };
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(`UPDATE ${table} SET deleted = 1 WHERE ${idColumn} IN (${ids.map(() => '?').join(',')})${tenantSql}`, [
      ...ids,
      ...Object.values(tenant.params),
    ]);
  }
}
