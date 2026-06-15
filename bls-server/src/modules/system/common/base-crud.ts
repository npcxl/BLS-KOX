import { execute, query, queryOne } from "../../../core/database";
import {
  eqCondition,
  joinConditions,
  likeCondition,
  SqlFragment,
} from "../../../core/sql";
import { getCurrentTenantId, tenantWhere } from "../../../middleware/tenant";
import { PageParams } from "../../../shared/utils/pagination";

export interface BaseListOptions {
  table: string;
  alias?: string;
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
  async list<T>(
    options: BaseListOptions,
    page: PageParams,
  ): Promise<{ rows: T[]; total: number }> {
    const tenant =
      options.tenantScoped === false
        ? { sql: "", params: {} }
        : tenantWhere(options.table, options.alias);

    const where = joinConditions([
      tenant,
      options.keywordColumn
        ? likeCondition(
            options.alias ? `${options.alias}.${options.keywordColumn}` : options.keywordColumn,
            "keyword",
            options.keyword,
          )
        : { sql: "", params: {} },
      eqCondition(
        options.alias ? `${options.alias}.status` : "status",
        "status",
        options.status,
      ),
      ...(options.extraConditions ?? []),
    ]);

    const orderBy = options.orderBy ?? `${options.idColumn} DESC`;
    const params = {
      ...where.params,
      offset: page.offset,
      pageSize: page.pageSize,
    };

    const fromTable = options.alias ? `${options.table} ${options.alias}` : options.table;
    const rowsSql = `
      ${options.selectSql}
      ${where.sql}
      ORDER BY ${orderBy}
      LIMIT :offset, :pageSize
    `;
    const totalSql = `
      SELECT COUNT(*) AS total
      FROM ${fromTable}
      ${where.sql}
    `;

    console.log("[BaseCrudRepository.list] table:", options.table);
    console.log("[BaseCrudRepository.list] tenantScoped:", options.tenantScoped);
    console.log("[BaseCrudRepository.list] currentTenantId:", getCurrentTenantId());
    console.log("[BaseCrudRepository.list] where.sql:", where.sql);
    console.log("[BaseCrudRepository.list] where.params:", where.params);
    console.log("[BaseCrudRepository.list] rowsSql:", rowsSql);
    console.log("[BaseCrudRepository.list] totalSql:", totalSql);

    const rows = await query<T>(rowsSql, params);
    const total = await queryOne<{ total: number }>(totalSql, where.params);

    return { rows, total: total?.total ?? 0 };
  }

  async insert(
    table: string,
    data: Record<string, unknown>,
  ): Promise<{ insertId: number }> {
    const keys = Object.keys(data);
    const columns = keys.map((key) =>
      key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`),
    );
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${keys.map((key) => `:${key}`).join(", ")})`;
    const result = await execute(sql, data);
    return { insertId: result.insertId };
  }

  update(
    table: string,
    idColumn: string,
    id: string,
    data: Record<string, unknown>,
    tenantScoped = true,
  ): Promise<unknown> {
    const keys = Object.keys(data);
    const sets = keys.map(
      (key) =>
        `${key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)} = :${key}`,
    );
    const tenant = tenantScoped ? tenantWhere(table) : { sql: "", params: {} };
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    return execute(
      `UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = :id${tenantSql}`,
      { ...data, id, ...tenant.params },
    );
  }

  softDelete(
    table: string,
    idColumn: string,
    ids: string[],
    tenantScoped = true,
  ): Promise<unknown> {
    const tenant = tenantScoped ? tenantWhere(table) : { sql: "", params: {} };
    const idParams = Object.fromEntries(
      ids.map((id, index) => [`id${index}`, id]),
    );
    const idPlaceholders = ids.map((_, index) => `:id${index}`).join(", ");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    return execute(
      `UPDATE ${table} SET deleted = 1 WHERE ${idColumn} IN (${idPlaceholders})${tenantSql}`,
      { ...idParams, ...tenant.params },
    );
  }
}
