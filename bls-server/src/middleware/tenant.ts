import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Next } from "koa";
import { parseBearerToken, verifyToken } from "../shared/utils/jwt";
import { normalizeTenantId, TENANT_ID_FIELD } from "../shared/constants/tenant";

interface TenantStore {
  tenantId: string | null;
}

export const TenantStorage = new AsyncLocalStorage<TenantStore>();

export function getCurrentTenantId(): string | null {
  return TenantStorage.getStore()?.tenantId ?? null;
}

export function setCurrentTenantId(tenantId: string): void {
  const store = TenantStorage.getStore();
  if (store) {
    store.tenantId = normalizeTenantId(tenantId);
  }
}

export async function tenantMiddleware(
  ctx: Context,
  next: Next,
): Promise<void> {
  const rawToken = parseBearerToken(ctx.headers.authorization);
  const rawTenantId = rawToken
    ? (() => {
        try {
          return verifyToken(rawToken).tenantId;
        } catch {
          return null;
        }
      })()
    : null;
  const tenantId =
    rawTenantId === null || rawTenantId === undefined || rawTenantId === ""
      ? null
      : normalizeTenantId(rawTenantId);

  console.log("[tenantMiddleware] user:", ctx.state.user);
  console.log("[tenantMiddleware] tenantId:", tenantId);

  await TenantStorage.run({ tenantId }, async () => {
    await next();
  });
}

export function tenantWhere(
  table: string,
  alias?: string,
): { sql: string; params: Record<string, unknown> } {
  const globalTables = ["sys_menu", "sys_package", "sys_package_menu"];

  if (globalTables.includes(table)) {
    return { sql: "", params: {} };
  }

  const tenantId = getCurrentTenantId();

  if (!tenantId) {
    throw new Error("缺少 tenantId，禁止访问租户数据");
  }

  const column = alias ? `${alias}.${TENANT_ID_FIELD}` : TENANT_ID_FIELD;

  return {
    sql: `${column} = :tenantId`,
    params: {
      tenantId,
    },
  };
}

export function appendTenantCondition(
  baseSql: string,
  table: string,
  alias?: string,
  connector: "WHERE" | "AND" = "WHERE",
): { sql: string; params: Record<string, unknown> } {
  const where = tenantWhere(table, alias);
  if (!where.sql) return { sql: baseSql, params: {} };
  return { sql: `${baseSql} ${connector} ${where.sql}`, params: where.params };
}
