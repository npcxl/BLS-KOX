import { queryOne } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';

export const config = {
  table: 'sys_theme_config',
  pkField: 'theme_id',
  // sys_theme_config 实际列名（旧配置的 theme_name/theme_key 会生成非法 SQL）
  searchFields: ['title'],
  filterFields: ['status'],
  createFields: [
    'nav_theme', 'color_primary', 'layout', 'content_width',
    'fixed_header', 'fix_siderbar', 'color_weak', 'split_menus', 'sider_menu_type',
    'title', 'logo', 'iconfont_url', 'token_json', 'status', 'remark',
  ],
  updateFields: [
    'nav_theme', 'color_primary', 'layout', 'content_width',
    'fixed_header', 'fix_siderbar', 'color_weak', 'split_menus', 'sider_menu_type',
    'title', 'logo', 'iconfont_url', 'token_json', 'status', 'remark',
  ],
  name: '主题',
  permPrefix: 'system:theme',
};

export const current = async () => {
  const tid = getCurrentTenantId() ?? PLATFORM_TENANT_ID;
  const row = await queryOne<any>(
    `SELECT * FROM sys_theme_config WHERE tenant_id = :tid AND deleted = 0 AND status = '0' LIMIT 1`,
    { tid },
  );
  return row ?? queryOne<any>(
    `SELECT * FROM sys_theme_config WHERE tenant_id = :pid AND deleted = 0 AND status = '0' LIMIT 1`,
    { pid: PLATFORM_TENANT_ID },
  );
};
