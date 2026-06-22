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

export type GlobalSearchSyncStrategyTable = keyof typeof GLOBAL_SEARCH_SYNC_STRATEGIES;

export function getGlobalSearchSyncStrategy(table: string) {
  return GLOBAL_SEARCH_SYNC_STRATEGIES[table as GlobalSearchSyncStrategyTable];
}

export async function syncFromTable(repo: GlobalSearchRepository, table: string, row: Record<string, unknown>) {
  const strategy = getGlobalSearchSyncStrategy(table);
  if (!strategy) return;
  if (table === 'sys_user') {
    await strategy(repo, {
      userId: String(row.userId ?? row.user_id),
      tenantId: String(row.tenantId ?? row.tenant_id ?? '000000'),
      username: String(row.username ?? ''),
      nickname: String(row.nickname ?? ''),
      realName: (row.realName ?? row.real_name ?? null) as string | null,
      phone: (row.phone ?? null) as string | null,
      email: (row.email ?? null) as string | null,
      deptId: (row.deptId ?? row.dept_id ?? null) as string | null,
      createBy: (row.createBy ?? row.create_by ?? null) as string | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_role') {
    await strategy(repo, {
      roleId: String(row.roleId ?? row.role_id),
      tenantId: String(row.tenantId ?? row.tenant_id ?? '000000'),
      roleName: String(row.roleName ?? row.role_name ?? ''),
      roleKey: String(row.roleKey ?? row.role_key ?? ''),
      remark: (row.remark ?? null) as string | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_menu') {
    await strategy(repo, {
      menuId: String(row.menuId ?? row.menu_id),
      tenantId: (row.tenantId ?? row.tenant_id ?? '000000') as string | null,
      menuName: String(row.menuName ?? row.menu_name ?? ''),
      path: (row.path ?? null) as string | null,
      component: (row.component ?? null) as string | null,
      perms: (row.perms ?? null) as string | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_dept') {
    await strategy(repo, {
      deptId: String(row.deptId ?? row.dept_id),
      tenantId: String(row.tenantId ?? row.tenant_id ?? '000000'),
      parentId: (row.parentId ?? row.parent_id ?? null) as string | null,
      deptName: String(row.deptName ?? row.dept_name ?? ''),
      sortNum: (row.sortNum ?? row.sort_num ?? null) as number | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_config') {
    await strategy(repo, {
      configId: String(row.configId ?? row.config_id),
      tenantId: String(row.tenantId ?? row.tenant_id ?? '000000'),
      configKey: String(row.configKey ?? row.config_key ?? ''),
      configName: String(row.configName ?? row.config_name ?? ''),
      configValue: (row.configValue ?? row.config_value ?? null) as string | null,
      configType: (row.configType ?? row.config_type ?? null) as string | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_tenant') {
    await strategy(repo, {
      tenantId: String(row.tenantId ?? row.tenant_id),
      tenantName: String(row.tenantName ?? row.tenant_name ?? ''),
      packageId: (row.packageId ?? row.package_id ?? null) as string | null,
      domainName: (row.domainName ?? row.domain_name ?? null) as string | null,
      contactUser: (row.contactUser ?? row.contact_user ?? null) as string | null,
      contactPhone: (row.contactPhone ?? row.contact_phone ?? null) as string | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_package') {
    await strategy(repo, {
      packageId: String(row.packageId ?? row.package_id),
      packageName: String(row.packageName ?? row.package_name ?? ''),
      status: (row.status ?? '0') as string,
      remark: (row.remark ?? null) as string | null,
      deleted: Number(row.deleted ?? 0),
    });
    return;
  }
  if (table === 'sys_theme_config') {
    await strategy(repo, {
      themeId: String(row.themeId ?? row.theme_id),
      tenantId: String(row.tenantId ?? row.tenant_id ?? '000000'),
      title: (row.title ?? null) as string | null,
      navTheme: (row.navTheme ?? row.nav_theme ?? null) as string | null,
      colorPrimary: (row.colorPrimary ?? row.color_primary ?? null) as string | null,
      status: (row.status ?? '0') as string,
      deleted: Number(row.deleted ?? 0),
    });
  }
}
