import { GlobalSearchRepository } from './global-search.repository';
import { syncFromTable } from './global-search-strategies';

export async function syncSearchIndexForInsert(repo: GlobalSearchRepository, table: string, row: Record<string, unknown>) {
  await syncFromTable(repo, table, row);
}

export async function syncSearchIndexForUpdate(repo: GlobalSearchRepository, table: string, row: Record<string, unknown>) {
  await syncFromTable(repo, table, row);
}

export async function syncSearchIndexForDelete(repo: GlobalSearchRepository, table: string, row: Record<string, unknown>) {
  const tenantId = String(row.tenantId ?? row.tenant_id ?? '000000');
  if (table === 'sys_user') {
    await repo.deleteSearchIndex(tenantId, 'user', String(row.userId ?? row.user_id));
  }
  if (table === 'sys_role') {
    await repo.deleteSearchIndex(tenantId, 'role', String(row.roleId ?? row.role_id));
  }
  if (table === 'sys_menu') {
    await repo.deleteSearchIndex(tenantId, 'menu', String(row.menuId ?? row.menu_id));
  }
  if (table === 'sys_dept') {
    await repo.deleteSearchIndex(tenantId, 'dept', String(row.deptId ?? row.dept_id));
  }
  if (table === 'sys_config') {
    await repo.deleteSearchIndex(tenantId, 'config', String(row.configId ?? row.config_id));
  }
  if (table === 'sys_tenant') {
    await repo.deleteSearchIndex(tenantId, 'tenant', String(row.tenantId ?? row.tenant_id));
  }
  if (table === 'sys_package') {
    await repo.deleteSearchIndex('000000', 'package', String(row.packageId ?? row.package_id));
  }
  if (table === 'sys_theme_config') {
    await repo.deleteSearchIndex(tenantId, 'theme', String(row.themeId ?? row.theme_id));
  }
}
