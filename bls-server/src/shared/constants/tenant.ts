export const PLATFORM_TENANT_ID = "000000";
export const TENANT_ID_FIELD = "tenant_id";

export function isPlatformTenantId(
  tenantId: string | number | null | undefined,
): boolean {
  return String(tenantId ?? "") === PLATFORM_TENANT_ID;
}

export function normalizeTenantId(
  tenantId: string | number | null | undefined,
): string {
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    throw new Error("缺少 tenantId");
  }

  return String(tenantId);
}
