import { getKyselyRuntime } from "../../shared/utils/kysely-runtime";
import { getDb } from "../../core/database";
import { getCurrentTenantId } from "../../middleware/tenant";
import { generateSnowflakeId } from "../../shared/utils/snowflake";
import { PageQuery, PageResult, TableConfig } from "./business.model";

export class BusinessRepository<
  TRow extends Record<string, unknown>,
  TInput = Record<string, unknown>,
> {
  constructor(private readonly config: TableConfig<TInput>) {}

  private ensureTenantId(): string | null {
    if (!this.config.tenantAware) return null;
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error("缺少 tenantId，禁止访问租户数据");
    return tenantId;
  }

  private async buildQuery() {
    const db = await getDb();
    let builder = db
      .selectFrom(this.config.tableName as any)
      .where("deleted" as any, "=", 0 as any);
    const tenantId = this.ensureTenantId();
    if (tenantId)
      builder = builder.where("tenant_id" as any, "=", tenantId as any);
    return builder;
  }

  async list(filters: PageQuery): Promise<PageResult<TRow>> {
    const { sql } = await getKyselyRuntime();
    const pageNum = Math.max(Number(filters.pageNum ?? 1), 1);
    const pageSize = Math.max(Number(filters.pageSize ?? 20), 1);
    const offset = (pageNum - 1) * pageSize;
    let builder = await this.buildQuery();

    if (filters.keyword) {
      builder = builder.where((eb: any) =>
        eb.or(
          this.config.searchColumns.map((column) =>
            eb(column as any, "like", `%${filters.keyword}%`),
          ),
        ),
      );
    }

    if (this.config.filterColumns) {
      for (const [param, column] of Object.entries(this.config.filterColumns)) {
        const value = filters[param];
        if (value !== undefined && value !== "")
          builder = builder.where(column as any, "=", value as any);
      }
    }

    if (this.config.dateColumn && filters.startDate && filters.endDate) {
      builder = builder
        .where(this.config.dateColumn as any, ">=", filters.startDate as any)
        .where(this.config.dateColumn as any, "<=", filters.endDate as any);
    }

    const rows = (await builder
      .select(
        (this.config.listColumns as any).map((col: string) => sql.raw(col)),
      )
      .orderBy(this.config.idColumn as any, "desc")
      .limit(pageSize)
      .offset(offset)
      .execute()) as unknown as TRow[];
    const totalResult = await (await this.buildQuery())
      .select((eb: any) => eb.fn.countAll().as("total"))
      .executeTakeFirst();
    return { rows, total: Number(totalResult?.total ?? 0) };
  }

  async detail(id: string): Promise<TRow | null> {
    const { sql } = await getKyselyRuntime();
    return (await (
      await this.buildQuery()
    )
      .where(this.config.idColumn as any, "=", id as any)
      .select(
        (this.config.detailColumns as any).map((col: string) => sql.raw(col)),
      )
      .executeTakeFirst()) as TRow | null;
  }

  async create(input: TInput): Promise<string> {
    const tenantId = this.ensureTenantId();
    const id = generateSnowflakeId();
    const data = this.config.mapInput(input);
    const db = await getDb();
    await db
      .insertInto(this.config.tableName as any)
      .values({
        [this.config.idColumn]: id,
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...this.config.defaults,
        ...data,
      } as any)
      .execute();
    return id;
  }

  async update(id: string, input: TInput): Promise<void> {
    const data = this.config.mapInput(input);
    const db = await getDb();
    let builder = db
      .updateTable(this.config.tableName as any)
      .set({ ...this.config.defaults, ...data } as any)
      .where(this.config.idColumn as any, "=", id as any)
      .where("deleted" as any, "=", 0 as any);
    const tenantId = this.ensureTenantId();
    if (tenantId)
      builder = builder.where("tenant_id" as any, "=", tenantId as any);
    await builder.execute();
  }

  async remove(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = await getDb();
    let builder = db
      .updateTable(this.config.tableName as any)
      .set({ deleted: 1 } as any)
      .where(this.config.idColumn as any, "in", ids as any);
    const tenantId = this.ensureTenantId();
    if (tenantId)
      builder = builder.where("tenant_id" as any, "=", tenantId as any);
    await builder.execute();
  }
}
