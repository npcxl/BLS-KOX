import { AsyncLocalStorage } from 'async_hooks';
import { Context, Next } from 'koa';

interface TenantStore {
  tenantId: number;
}

export const TenantStorage = new AsyncLocalStorage<TenantStore>();

export function getCurrentTenantId(): number {
  return TenantStorage.getStore()?.tenantId ?? 0;
}

export function setCurrentTenantId(tenantId: number): void {
  const store = TenantStorage.getStore();
  if (store) {
    store.tenantId = tenantId;
  }
}

export async function tenantMiddleware(ctx: Context, next: Next): Promise<void> {
  await TenantStorage.run({ tenantId: 0 }, async () => {
    if (ctx.state.user?.tenantId !== undefined) {
      setCurrentTenantId(ctx.state.user.tenantId);
    }
    await next();
  });
}

export function tenantWhere(table: string, alias?: string): { sql: string; params: Record<string, unknown> } {
  const tenantId = getCurrentTenantId();
  const ignoreTables = ['sys_tenant', 'sys_menu'];
  if (tenantId === 0 || ignoreTables.includes(table)) {
    return { sql: '', params: {} };
  }
  const column = alias ? `${alias}.tenant_id` : 'tenant_id';
  return { sql: `${column} = :tenantId`, params: { tenantId } };
}

export function appendTenantCondition(
  baseSql: string,
  table: string,
  alias?: string,
  connector: 'WHERE' | 'AND' = 'WHERE',
): { sql: string; params: Record<string, unknown> } {
  const where = tenantWhere(table, alias);
  if (!where.sql) return { sql: baseSql, params: {} };
  return { sql: `${baseSql} ${connector} ${where.sql}`, params: where.params };
}
