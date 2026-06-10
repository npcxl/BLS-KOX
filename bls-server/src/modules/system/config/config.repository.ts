import { query, queryOne } from '../../../core/database';
import { joinConditions } from '../../../core/sql';
import { ConfigQuery, CreateConfigInput, SysConfig, UpdateConfigInput } from './config.model';
import { PageParams } from '../../../shared/utils/pagination';

export class ConfigRepository {
  async list(filters: ConfigQuery, page: PageParams): Promise<{ rows: SysConfig[]; total: number }> {
    const where = joinConditions([
      filters.configKey ? 'config_key LIKE :configKey' : '',
      filters.configName ? 'config_name LIKE :configName' : '',
      filters.configType ? 'config_type = :configType' : '',
      filters.tenantId !== undefined && filters.tenantId !== '' ? 'tenant_id = :tenantId' : '',
    ]);
    const params = {
      configKey: filters.configKey ? `%${filters.configKey}%` : undefined,
      configName: filters.configName ? `%${filters.configName}%` : undefined,
      configType: filters.configType,
      tenantId: filters.tenantId === '' ? undefined : Number(filters.tenantId ?? 0),
    };
    const baseSql = `FROM sys_config ${where ? `WHERE ${where}` : ''}`;
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(1) AS total ${baseSql}`, params);
    const rows = await query<SysConfig>(
      `SELECT config_id AS configId, config_key AS configKey, config_value AS configValue,
              config_name AS configName, config_type AS configType, remark, status,
              tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       ${baseSql}
       ORDER BY config_id DESC
       LIMIT :offset, :limit`,
      { ...params, offset: page.offset, limit: page.limit },
    );
    return { rows, total: totalRow?.total ?? 0 };
  }

  findById(configId: number): Promise<SysConfig | null> {
    return queryOne<SysConfig>(
      `SELECT config_id AS configId, config_key AS configKey, config_value AS configValue,
              config_name AS configName, config_type AS configType, remark, status,
              tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_config
       WHERE config_id = :configId AND deleted = 0
       LIMIT 1`,
      { configId },
    );
  }

  findByKey(tenantId: number, configKey: string): Promise<SysConfig | null> {
    return queryOne<SysConfig>(
      `SELECT config_id AS configId, config_key AS configKey, config_value AS configValue,
              config_name AS configName, config_type AS configType, remark, status,
              tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_config
       WHERE tenant_id = :tenantId AND config_key = :configKey AND deleted = 0
       LIMIT 1`,
      { tenantId, configKey },
    );
  }

  create(input: CreateConfigInput): Promise<number> {
    return queryOne<{ insertId: number }>(
      `INSERT INTO sys_config (tenant_id, config_key, config_value, config_name, config_type, remark, status)
       VALUES (:tenantId, :configKey, :configValue, :configName, :configType, :remark, :status)`,
      { tenantId: input.tenantId ?? 0, status: input.status ?? '0', ...input },
    ).then((r) => r?.insertId ?? 0);
  }

  update(input: UpdateConfigInput): Promise<void> {
    return query(
      `UPDATE sys_config
       SET tenant_id = :tenantId, config_key = :configKey, config_value = :configValue,
           config_name = :configName, config_type = :configType, remark = :remark, status = :status
       WHERE config_id = :configId`,
      { tenantId: input.tenantId ?? 0, status: input.status ?? '0', ...input },
    ).then(() => undefined);
  }
}
