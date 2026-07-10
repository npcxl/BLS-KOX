import { query } from '../../../core/database';
import { registerExcelMetas } from './excel.registry';

/** Excel 元配置：metaKey 映射到数据表和页面列配置 */
export interface ExcelMetaConfig {
  metaKey: string;
  tableName: string;
  pageCode: string;
  tenantAware?: boolean;
}

export const excelMetas: ExcelMetaConfig[] = [
  { metaKey: 'system-user', tableName: 'sys_user', pageCode: 'system_user', tenantAware: true },
  { metaKey: 'system-config', tableName: 'sys_config', pageCode: 'system_config', tenantAware: true },
  { metaKey: 'system-role', tableName: 'sys_role', pageCode: 'system_role', tenantAware: true },
  { metaKey: 'system-dept', tableName: 'sys_dept', pageCode: 'system_dept', tenantAware: true },
  { metaKey: 'system-tenant', tableName: 'sys_tenant', pageCode: 'system_tenant', tenantAware: true },
  { metaKey: 'system-package', tableName: 'sys_package', pageCode: 'system_package', tenantAware: true },
];

// 自动注册
registerExcelMetas(excelMetas);

export async function loadExcelMetasFromDb() {
  await query('SELECT 1');
  return excelMetas;
}
