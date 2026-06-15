import { execute, query, queryOne } from "../../../core/database";
import { eqCondition, joinConditions, likeCondition } from "../../../core/sql";
import { getCurrentTenantId, tenantWhere } from "../../../middleware/tenant";
import {
  isPlatformTenantId,
  normalizeTenantId,
  PLATFORM_TENANT_ID,
} from "../../../shared/constants/tenant";
import { getPageParams, PageParams } from "../../../shared/utils/pagination";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import {
  ConfigQuery,
  CreateConfigInput,
  SysConfig,
  UpdateConfigInput,
} from "./config.model";

export class ConfigRepository {
  private resolveTenantId(tenantId?: string | null): string {
    if (tenantId && !isPlatformTenantId(tenantId)) {
      return normalizeTenantId(tenantId);
    }

    const currentTenantId = getCurrentTenantId();
    if (currentTenantId && !isPlatformTenantId(currentTenantId)) {
      return normalizeTenantId(currentTenantId);
    }

    return PLATFORM_TENANT_ID;
  }

  private buildTenantFallbackIds(tenantId?: string | null): string[] {
    const primaryTenantId = this.resolveTenantId(tenantId);
    if (isPlatformTenantId(primaryTenantId)) {
      return [PLATFORM_TENANT_ID];
    }
    return [primaryTenantId, PLATFORM_TENANT_ID];
  }

  async list(
    filters: ConfigQuery,
    page: PageParams = getPageParams(filters),
  ): Promise<{ rows: SysConfig[]; total: number }> {
    const tenant = tenantWhere("sys_config");
    const where = joinConditions([
      tenant,
      likeCondition("config_key", "configKey", filters.configKey),
      likeCondition("config_name", "configName", filters.configName),
      eqCondition("config_type", "configType", filters.configType),
      { sql: "deleted = 0", params: {} },
    ]);
    const params = {
      ...where.params,
      offset: page.offset,
      pageSize: page.pageSize,
    };
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(1) AS total FROM sys_config ${where.sql}`,
      where.params,
    );
    const rows = await query<SysConfig>(
      `SELECT config_id AS configId, config_key AS configKey, config_value AS configValue,
              config_name AS configName, config_type AS configType, remark, status,
              tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_config
       ${where.sql}
       ORDER BY config_id DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    return { rows, total: totalRow?.total ?? 0 };
  }

  findById(configId: string): Promise<SysConfig | null> {
    const tenant = tenantWhere("sys_config");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    return queryOne<SysConfig>(
      `SELECT config_id AS configId, config_key AS configKey, config_value AS configValue,
              config_name AS configName, config_type AS configType, remark, status,
              tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_config
       WHERE config_id = :configId AND deleted = 0${tenantSql}
       LIMIT 1`,
      { configId, ...tenant.params },
    );
  }

  async findByKey(tenantId: string | null | undefined, configKey: string): Promise<SysConfig | null> {
    const tenantIds = this.buildTenantFallbackIds(tenantId);
    const placeholders = tenantIds.map((_, index) => `:tenantId${index}`).join(", ");
    const tenantParams = Object.fromEntries(
      tenantIds.map((value, index) => [`tenantId${index}`, value]),
    );

    return queryOne<SysConfig>(
      `SELECT config_id AS configId, config_key AS configKey, config_value AS configValue,
              config_name AS configName, config_type AS configType, remark, status,
              tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_config
       WHERE tenant_id IN (${placeholders}) AND config_key = :configKey AND deleted = 0
       ORDER BY FIELD(tenant_id, ${placeholders})
       LIMIT 1`,
      {
        ...tenantParams,
        configKey,
      },
    );
  }

  async create(input: CreateConfigInput): Promise<string> {
    const tenantId = normalizeTenantId(getCurrentTenantId());
    const configId = input.configId ?? generateSnowflakeId();
    await execute(
      `INSERT INTO sys_config (config_id, tenant_id, config_key, config_value, config_name, config_type, remark, status)
       VALUES (:configId, :tenantId, :configKey, :configValue, :configName, :configType, :remark, :status)`,
      {
        configId,
        tenantId,
        configKey: input.configKey,
        configValue: input.configValue,
        configName: input.configName,
        configType: input.configType,
        remark: input.remark ?? null,
        status: input.status ?? "0",
      },
    );
    return configId;
  }

  async update(input: UpdateConfigInput): Promise<void> {
    const tenant = tenantWhere("sys_config");
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : "";
    await execute(
      `UPDATE sys_config
       SET config_key = :configKey, config_value = :configValue,
           config_name = :configName, config_type = :configType, remark = :remark, status = :status
       WHERE config_id = :configId AND deleted = 0${tenantSql}`,
      {
        configId: input.configId,
        configKey: input.configKey,
        configValue: input.configValue,
        configName: input.configName,
        configType: input.configType,
        remark: input.remark ?? null,
        status: input.status ?? "0",
        ...tenant.params,
      },
    );
  }
}
