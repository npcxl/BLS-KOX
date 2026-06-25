import { GlobalSearchRepository } from './global-search.repository';

export async function syncUserSearchIndex(repo: GlobalSearchRepository, user: {
  userId: string;
  tenantId: string;
  username: string;
  nickname: string;
  realName?: string | null;
  phone?: string | null;
  email?: string | null;
  deptId?: string | null;
  createBy?: string | null;
  status?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: user.tenantId,
    moduleKey: 'user',
    moduleName: '用户管理',
    bizId: user.userId,
    title: user.username,
    subtitle: user.nickname,
    content: [user.username, user.nickname, user.realName, user.phone, user.email].filter(Boolean).join(','),
    permission: 'system:user:search',
    routePath: '/system/user',
    deptId: user.deptId,
    createdBy: user.createBy ?? null,
    status: user.status ?? '0',
    deleted: user.deleted ?? 0,
    sourceTable: 'sys_user',
  });
}

export async function syncRoleSearchIndex(repo: GlobalSearchRepository, role: {
  roleId: string;
  tenantId: string;
  roleName: string;
  roleKey: string;
  remark?: string | null;
  status?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: role.tenantId,
    moduleKey: 'role',
    moduleName: '角色管理',
    bizId: role.roleId,
    title: role.roleName,
    subtitle: role.roleKey,
    content: [role.roleName, role.roleKey, role.remark].filter(Boolean).join(','),
    permission: 'system:role:search',
    routePath: '/system/role',
    status: role.status ?? '0',
    deleted: role.deleted ?? 0,
    sourceTable: 'sys_role',
  });
}

export async function syncMenuSearchIndex(repo: GlobalSearchRepository, menu: {
  menuId?: string;
  tenantId?: string | null;
  menuName: string;
  path?: string | null;
  component?: string | null;
  perms?: string | null;
  status?: string | null;
  deleted?: number;
}) {
  const tenantId = menu.tenantId ?? '000000';
  await repo.upsertSearchIndex({
    tenantId,
    moduleKey: 'menu',
    moduleName: '菜单管理',
    bizId: menu.menuId ?? '',
    title: menu.menuName,
    subtitle: menu.perms ?? null,
    content: [menu.menuName, menu.path, menu.component, menu.perms].filter(Boolean).join(','),
    permission: 'system:menu:search',
    routePath: '/system/menu',
    status: menu.status ?? '0',
    deleted: menu.deleted ?? 0,
    sourceTable: 'sys_menu',
  });
}

export async function syncDeptSearchIndex(repo: GlobalSearchRepository, dept: {
  deptId: string;
  tenantId: string;
  parentId?: string | null;
  deptName: string;
  sortNum?: number | null;
  status?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: dept.tenantId,
    moduleKey: 'dept',
    moduleName: '部门管理',
    bizId: dept.deptId,
    title: dept.deptName,
    subtitle: dept.parentId ?? null,
    content: [dept.deptName, dept.parentId, dept.sortNum].filter(Boolean).join(','),
    permission: 'system:dept:search',
    routePath: '/system/dept',
    status: dept.status ?? '0',
    deleted: dept.deleted ?? 0,
    sourceTable: 'sys_dept',
  });
}

export async function syncConfigSearchIndex(repo: GlobalSearchRepository, config: {
  configId: string;
  tenantId: string;
  configKey: string;
  configName: string;
  configValue?: string | null;
  configType?: string | null;
  status?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: config.tenantId,
    moduleKey: 'config',
    moduleName: '系统参数',
    bizId: config.configId,
    title: config.configName,
    subtitle: config.configKey,
    content: [config.configName, config.configKey, config.configValue, config.configType].filter(Boolean).join(','),
    permission: 'system:config:search',
    routePath: '/system/config',
    status: config.status ?? '0',
    deleted: config.deleted ?? 0,
    sourceTable: 'sys_config',
  });
}

export async function syncTenantSearchIndex(repo: GlobalSearchRepository, tenant: {
  tenantId: string;
  tenantName: string;
  packageId?: string | null;
  domainName?: string | null;
  contactUser?: string | null;
  contactPhone?: string | null;
  status?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: tenant.tenantId,
    moduleKey: 'tenant',
    moduleName: '租户管理',
    bizId: tenant.tenantId,
    title: tenant.tenantName,
    subtitle: tenant.domainName ?? null,
    content: [tenant.tenantName, tenant.packageId, tenant.domainName, tenant.contactUser, tenant.contactPhone].filter(Boolean).join(','),
    permission: 'system:tenant:search',
    routePath: '/system/tenant',
    status: tenant.status ?? '0',
    deleted: tenant.deleted ?? 0,
    sourceTable: 'sys_tenant',
  });
}

export async function syncPackageSearchIndex(repo: GlobalSearchRepository, pkg: {
  packageId: string;
  packageName: string;
  status?: string | null;
  remark?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: '000000',
    moduleKey: 'package',
    moduleName: '套餐管理',
    bizId: pkg.packageId,
    title: pkg.packageName,
    subtitle: pkg.status ?? null,
    content: [pkg.packageName, pkg.remark].filter(Boolean).join(','),
    permission: 'system:package:search',
    routePath: '/system/package',
    status: pkg.status ?? '0',
    deleted: pkg.deleted ?? 0,
    sourceTable: 'sys_package',
  });
}

export async function syncThemeSearchIndex(repo: GlobalSearchRepository, theme: {
  themeId: string;
  tenantId: string;
  title?: string | null;
  navTheme?: string | null;
  colorPrimary?: string | null;
  status?: string | null;
  deleted?: number;
}) {
  await repo.upsertSearchIndex({
    tenantId: theme.tenantId,
    moduleKey: 'theme',
    moduleName: '主题配置',
    bizId: theme.themeId,
    title: theme.title ?? '主题配置',
    subtitle: theme.colorPrimary ?? null,
    content: [theme.title, theme.navTheme, theme.colorPrimary].filter(Boolean).join(','),
    permission: 'system:theme:search',
    routePath: '/system/theme',
    status: theme.status ?? '0',
    deleted: theme.deleted ?? 0,
    sourceTable: 'sys_theme_config',
  });
}
