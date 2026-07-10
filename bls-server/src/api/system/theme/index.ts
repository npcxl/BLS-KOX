import { queryOne } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';

export const config = {
  table: 'sys_theme_config',
  pkField: 'theme_id',
  searchFields: ['theme_name', 'theme_key'],
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
