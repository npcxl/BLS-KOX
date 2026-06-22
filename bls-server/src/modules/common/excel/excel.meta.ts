import { query } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import type { ExcelMetaConfig } from './excel.types';

export const excelMetas: ExcelMetaConfig[] = [
  {
    metaKey: 'system-user',
    moduleName: '用户管理',
    tableName: 'sys_user',
    permissionKey: 'system:user',
    tenantAware: true,
    exportColumns: [
      { key: 'userId', title: '用户ID', dbField: 'user_id', readOnly: true },
      { key: 'username', title: '用户名', dbField: 'username', required: true },
      { key: 'nickname', title: '昵称', dbField: 'nickname', required: true },
      { key: 'realName', title: '姓名', dbField: 'real_name' },
      { key: 'phone', title: '手机号', dbField: 'phone' },
      { key: 'email', title: '邮箱', dbField: 'email' },
      { key: 'status', title: '状态', dbField: 'status', dictionaryCode: 'sys_status' },
      { key: 'createTime', title: '创建时间', dbField: 'create_time', readOnly: true },
    ],
    importColumns: [
      { key: 'username', title: '用户名', dbField: 'username', required: true, unique: true },
      { key: 'nickname', title: '昵称', dbField: 'nickname', required: true },
      { key: 'realName', title: '姓名', dbField: 'real_name' },
      { key: 'phone', title: '手机号', dbField: 'phone' },
      { key: 'email', title: '邮箱', dbField: 'email' },
      { key: 'status', title: '状态', dbField: 'status', dictionaryCode: 'sys_status' },
    ],
    importStrategy: { batchSize: 200, rollbackOnError: true, uniqueFields: ['username', 'phone', 'email'] },
    async queryBuilder(queryParam) {
      const keyword = String(queryParam.keyword ?? '').trim();
      const where: string[] = ['deleted = 0'];
      const params: Record<string, any> = {};
      if (keyword) {
        where.push('(username LIKE :keyword OR nickname LIKE :keyword OR real_name LIKE :keyword OR phone LIKE :keyword OR email LIKE :keyword)');
        params.keyword = `%${keyword}%`;
      }
      return {
        sql: `SELECT user_id AS userId, username, nickname, real_name AS realName, phone, email, status, create_time AS createTime FROM sys_user WHERE ${where.join(' AND ')} AND tenant_id = :tenantId ORDER BY create_time DESC`,
        params: { ...params, tenantId: getCurrentTenantId() ?? '000000' },
      };
    },
  },
  {
    metaKey: 'system-config',
    moduleName: '系统配置',
    tableName: 'sys_config',
    permissionKey: 'system:config',
    tenantAware: true,
    exportColumns: [
      { key: 'configId', title: '配置ID', dbField: 'config_id', readOnly: true },
      { key: 'configKey', title: '配置键', dbField: 'config_key' },
      { key: 'configName', title: '配置名称', dbField: 'config_name' },
      { key: 'configValue', title: '配置值', dbField: 'config_value' },
      { key: 'configType', title: '配置类型', dbField: 'config_type' },
    ],
    importColumns: [
      { key: 'configKey', title: '配置键', dbField: 'config_key', required: true, unique: true },
      { key: 'configName', title: '配置名称', dbField: 'config_name', required: true },
      { key: 'configValue', title: '配置值', dbField: 'config_value', required: true },
      { key: 'configType', title: '配置类型', dbField: 'config_type', required: true, enumValues: [
        { label: '系统', value: 'sys' },
        { label: '主题', value: 'theme' },
        { label: '字典', value: 'dict' },
      ] },
    ],
    importStrategy: { batchSize: 200, rollbackOnError: true, uniqueFields: ['configKey'] },
    async queryBuilder(queryParam) {
      const where = ['deleted = 0'];
      const params: Record<string, any> = { tenantId: getCurrentTenantId() ?? '000000' };
      if (queryParam.configKey) {
        where.push('config_key LIKE :configKey');
        params.configKey = `%${String(queryParam.configKey)}%`;
      }
      if (queryParam.configName) {
        where.push('config_name LIKE :configName');
        params.configName = `%${String(queryParam.configName)}%`;
      }
      return {
        sql: `SELECT config_id AS configId, config_key AS configKey, config_name AS configName, config_value AS configValue, config_type AS configType FROM sys_config WHERE ${where.join(' AND ')} AND tenant_id = :tenantId ORDER BY create_time DESC`,
        params,
      };
    },
  },
];

export async function loadExcelMetasFromDb() {
  await query('SELECT 1');
  return excelMetas;
}
