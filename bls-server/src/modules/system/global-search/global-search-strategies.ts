import { GlobalSearchRepository } from './global-search.repository';
import {
  syncConfigSearchIndex,
  syncDeptSearchIndex,
  syncMenuSearchIndex,
  syncPackageSearchIndex,
  syncRoleSearchIndex,
  syncTenantSearchIndex,
  syncThemeSearchIndex,
  syncUserSearchIndex,
} from './global-search-sync';

export const GLOBAL_SEARCH_SYNC_STRATEGIES = {
  sys_user: syncUserSearchIndex,
  sys_role: syncRoleSearchIndex,
  sys_menu: syncMenuSearchIndex,
  sys_dept: syncDeptSearchIndex,
  sys_config: syncConfigSearchIndex,
  sys_tenant: syncTenantSearchIndex,
  sys_package: syncPackageSearchIndex,
  sys_theme_config: syncThemeSearchIndex,
};

export type GlobalSearchSyncStrategyTable =
  keyof typeof GLOBAL_SEARCH_SYNC_STRATEGIES;

export function getGlobalSearchSyncStrategy(table: string) {
  return GLOBAL_SEARCH_SYNC_STRATEGIES[
    table as GlobalSearchSyncStrategyTable
  ];
}

export async function syncFromTable(
  repo: GlobalSearchRepository,
  table: string,
  row: Record<string, unknown>,
) {
  if (table === 'sys_user') {
    await syncUserSearchIndex(repo, {
      userId: toStringValue(row.userId ?? row.user_id),
      tenantId: toStringValue(row.tenantId ?? row.tenant_id ?? '000000'),
      username: toStringValue(row.username),
      nickname: toStringValue(row.nickname),
      realName: toNullableString(row.realName ?? row.real_name),
      phone: toNullableString(row.phone),
      email: toNullableString(row.email),
      deptId: toNullableString(row.deptId ?? row.dept_id),
      createBy: toNullableString(row.createBy ?? row.create_by),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_role') {
    await syncRoleSearchIndex(repo, {
      roleId: toStringValue(row.roleId ?? row.role_id),
      tenantId: toStringValue(row.tenantId ?? row.tenant_id ?? '000000'),
      roleName: toStringValue(row.roleName ?? row.role_name),
      roleKey: toStringValue(row.roleKey ?? row.role_key),
      remark: toNullableString(row.remark),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_menu') {
    await syncMenuSearchIndex(repo, {
      menuId: toStringValue(row.menuId ?? row.menu_id),
      tenantId: toNullableString(row.tenantId ?? row.tenant_id ?? '000000'),
      menuName: toStringValue(row.menuName ?? row.menu_name),
      path: toNullableString(row.path),
      component: toNullableString(row.component),
      perms: toNullableString(row.perms),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_dept') {
    await syncDeptSearchIndex(repo, {
      deptId: toStringValue(row.deptId ?? row.dept_id),
      tenantId: toStringValue(row.tenantId ?? row.tenant_id ?? '000000'),
      parentId: toNullableString(row.parentId ?? row.parent_id),
      deptName: toStringValue(row.deptName ?? row.dept_name),
      sortNum: toNullableNumber(row.sortNum ?? row.sort_num),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_config') {
    await syncConfigSearchIndex(repo, {
      configId: toStringValue(row.configId ?? row.config_id),
      tenantId: toStringValue(row.tenantId ?? row.tenant_id ?? '000000'),
      configKey: toStringValue(row.configKey ?? row.config_key),
      configName: toStringValue(row.configName ?? row.config_name),
      configValue: toNullableString(row.configValue ?? row.config_value),
      configType: toNullableString(row.configType ?? row.config_type),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_tenant') {
    await syncTenantSearchIndex(repo, {
      tenantId: toStringValue(row.tenantId ?? row.tenant_id),
      tenantName: toStringValue(row.tenantName ?? row.tenant_name),
      packageId: toNullableString(row.packageId ?? row.package_id),
      domainName: toNullableString(row.domainName ?? row.domain_name),
      contactUser: toNullableString(row.contactUser ?? row.contact_user),
      contactPhone: toNullableString(row.contactPhone ?? row.contact_phone),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_package') {
    await syncPackageSearchIndex(repo, {
      packageId: toStringValue(row.packageId ?? row.package_id),
      packageName: toStringValue(row.packageName ?? row.package_name),
      status: toStringValue(row.status ?? '0'),
      remark: toNullableString(row.remark),
      deleted: toNumberValue(row.deleted ?? 0),
    });
    return;
  }

  if (table === 'sys_theme_config') {
    await syncThemeSearchIndex(repo, {
      themeId: toStringValue(row.themeId ?? row.theme_id),
      tenantId: toStringValue(row.tenantId ?? row.tenant_id ?? '000000'),
      title: toNullableString(row.title),
      navTheme: toNullableString(row.navTheme ?? row.nav_theme),
      colorPrimary: toNullableString(row.colorPrimary ?? row.color_primary),
      status: toStringValue(row.status ?? '0'),
      deleted: toNumberValue(row.deleted ?? 0),
    });
  }
}

function toStringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function toNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function toNumberValue(value: unknown): number {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}