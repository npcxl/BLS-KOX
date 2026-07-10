import { Context, Next } from "koa";
import { parseBearerToken, verifyToken } from "../shared/utils/jwt";
import { normalizeTenantId, TENANT_ID_FIELD } from "../shared/constants/tenant";
import { getRequestContext, setAuthContext } from "../core/request-context";

export function getCurrentTenantId(): string | null {
  return getRequestContext()?.tenantId ?? null;
}

export async function tenantMiddleware(ctx: Context, next: Next): Promise<void> {
  const rawToken = parseBearerToken(ctx.headers.authorization);
  let tenantId: string | null = null;

  if (rawToken) {
    try {
      const payload = verifyToken(rawToken);
      tenantId = payload.tenantId;
      // 将 JWT 信息写入请求上下文
      setAuthContext({ userId: payload.userId, tenantId: payload.tenantId, username: payload.username });
    } catch {
      // JWT 解析失败，tenantId 保持 null
    }
  }

  // 更新上下文中的 tenantId
  const ctx2 = getRequestContext();
  if (ctx2) ctx2.tenantId = tenantId;

  await next();
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
    params: { tenantId },
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
