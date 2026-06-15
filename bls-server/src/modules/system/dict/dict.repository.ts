import { execute, query, queryOne } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition } from '../../../core/sql';
import { getCurrentTenantId, tenantWhere } from '../../../middleware/tenant';
import { getPageParams } from '../../../shared/utils/pagination';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { DictData, DictDataInput, DictDataQuery, DictType, DictTypeInput, DictTypeQuery } from './dict.model';

function buildIdParams(ids: string[]) {
  return {
    params: Object.fromEntries(ids.map((id, index) => [`id${index}`, id])),
    placeholders: ids.map((_, index) => `:id${index}`).join(', '),
  };
}

export class DictRepository {
  async listTypes(filters: DictTypeQuery): Promise<{ rows: DictType[]; total: number }> {
    const page = getPageParams(filters);
    const tenant = tenantWhere('sys_dict_type');
    const where = joinConditions([
      tenant,
      likeCondition('dict_name', 'dictName', filters.dictName),
      likeCondition('dict_type', 'dictType', filters.dictType),
      eqCondition('status', 'status', filters.status),
      { sql: 'deleted = 0', params: {} },
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const rows = await query<DictType>(
      `SELECT dict_type_id AS dictTypeId, dict_name AS dictName, dict_type AS dictType,
              status, remark, tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_dict_type
       ${where.sql}
       ORDER BY dict_type_id DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM sys_dict_type ${where.sql}`, where.params);
    return { rows, total: total?.total ?? 0 };
  }

  findTypeById(dictTypeId: string): Promise<DictType | null> {
    const tenant = tenantWhere('sys_dict_type');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return queryOne<DictType>(
      `SELECT dict_type_id AS dictTypeId, dict_name AS dictName, dict_type AS dictType,
              status, remark, tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_dict_type
       WHERE dict_type_id = :dictTypeId AND deleted = 0${tenantSql}
       LIMIT 1`,
      { dictTypeId, ...tenant.params },
    );
  }

  findTypeByCode(dictType: string): Promise<DictType | null> {
    const tenant = tenantWhere('sys_dict_type');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return queryOne<DictType>(
      `SELECT dict_type_id AS dictTypeId, dict_name AS dictName, dict_type AS dictType,
              status, remark, tenant_id AS tenantId, create_time AS createTime, update_time AS updateTime
       FROM sys_dict_type
       WHERE dict_type = :dictType AND deleted = 0${tenantSql}
       LIMIT 1`,
      { dictType, ...tenant.params },
    );
  }

  async createType(input: DictTypeInput): Promise<string> {
    const dictTypeId = input.dictTypeId ?? generateSnowflakeId();
    await execute(
      `INSERT INTO sys_dict_type (dict_type_id, tenant_id, dict_name, dict_type, status, remark, deleted)
       VALUES (:dictTypeId, :tenantId, :dictName, :dictType, :status, :remark, 0)`,
      {
        dictTypeId,
        tenantId: getCurrentTenantId(),
        dictName: input.dictName,
        dictType: input.dictType,
        status: input.status ?? '0',
        remark: input.remark ?? null,
      },
    );
    return dictTypeId;
  }

  updateType(input: DictTypeInput & { dictTypeId: string }): Promise<unknown> {
    const tenant = tenantWhere('sys_dict_type');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(
      `UPDATE sys_dict_type
       SET dict_name = :dictName, dict_type = :dictType, status = :status, remark = :remark
       WHERE dict_type_id = :dictTypeId AND deleted = 0${tenantSql}`,
      {
        dictTypeId: input.dictTypeId,
        dictName: input.dictName,
        dictType: input.dictType,
        status: input.status ?? '0',
        remark: input.remark ?? null,
        ...tenant.params,
      },
    );
  }

  removeTypes(ids: string[]): Promise<unknown> {
    const tenant = tenantWhere('sys_dict_type');
    const { params, placeholders } = buildIdParams(ids);
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(`UPDATE sys_dict_type SET deleted = 1 WHERE dict_type_id IN (${placeholders})${tenantSql}`, {
      ...params,
      ...tenant.params,
    });
  }

  async listDataByType(dictType: string): Promise<DictData[]> {
    const tenant = tenantWhere('sys_dict_data');
    const where = joinConditions([
      tenant,
      { sql: 'dict_type_id IN (SELECT dict_type_id FROM sys_dict_type WHERE dict_type = :dictType)', params: { dictType } },
      eqCondition('status', 'status', '0'),
      { sql: 'deleted = 0', params: {} },
    ]);
    return query<DictData>(
      `SELECT dict_data_id AS dictDataId, dict_type_id AS dictTypeId, dict_label AS dictLabel,
              dict_value AS dictValue, dict_sort AS dictSort, status, remark, tenant_id AS tenantId,
              create_time AS createTime, update_time AS updateTime
       FROM sys_dict_data
       ${where.sql}
       ORDER BY dict_sort ASC, dict_data_id ASC`,
      where.params,
    );
  }

  async listData(filters: DictDataQuery): Promise<{ rows: DictData[]; total: number }> {
    const page = getPageParams(filters);
    const tenant = tenantWhere('sys_dict_data');
    const dictTypeFilter = filters.dictType
      ? { sql: 'dict_type_id IN (SELECT dict_type_id FROM sys_dict_type WHERE dict_type = :dictType)', params: { dictType: filters.dictType } }
      : { sql: '', params: {} };
    const where = joinConditions([
      tenant,
      eqCondition('dict_type_id', 'dictTypeId', filters.dictTypeId),
      dictTypeFilter,
      likeCondition('dict_label', 'dictLabel', filters.dictLabel),
      eqCondition('status', 'status', filters.status),
      { sql: 'deleted = 0', params: {} },
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const rows = await query<DictData>(
      `SELECT dict_data_id AS dictDataId, dict_type_id AS dictTypeId, dict_label AS dictLabel,
              dict_value AS dictValue, dict_sort AS dictSort, status, remark, tenant_id AS tenantId,
              create_time AS createTime, update_time AS updateTime
       FROM sys_dict_data
       ${where.sql}
       ORDER BY dict_sort ASC, dict_data_id ASC
       LIMIT :offset, :pageSize`,
      params,
    );
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM sys_dict_data ${where.sql}`, where.params);
    return { rows, total: total?.total ?? 0 };
  }

  async createData(input: DictDataInput): Promise<string> {
    const dictDataId = input.dictDataId ?? generateSnowflakeId();
    await execute(
      `INSERT INTO sys_dict_data (dict_data_id, tenant_id, dict_type_id, dict_label, dict_value, dict_sort, status, remark, deleted)
       VALUES (:dictDataId, :tenantId, :dictTypeId, :dictLabel, :dictValue, :dictSort, :status, :remark, 0)`,
      {
        dictDataId,
        tenantId: getCurrentTenantId(),
        dictTypeId: input.dictTypeId,
        dictLabel: input.dictLabel,
        dictValue: input.dictValue,
        dictSort: input.dictSort ?? 0,
        status: input.status ?? '0',
        remark: input.remark ?? null,
      },
    );
    return dictDataId;
  }

  updateData(input: DictDataInput & { dictDataId: string }): Promise<unknown> {
    const tenant = tenantWhere('sys_dict_data');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(
      `UPDATE sys_dict_data
       SET dict_type_id = :dictTypeId, dict_label = :dictLabel, dict_value = :dictValue,
           dict_sort = :dictSort, status = :status, remark = :remark
       WHERE dict_data_id = :dictDataId AND deleted = 0${tenantSql}`,
      {
        dictDataId: input.dictDataId,
        dictTypeId: input.dictTypeId,
        dictLabel: input.dictLabel,
        dictValue: input.dictValue,
        dictSort: input.dictSort ?? 0,
        status: input.status ?? '0',
        remark: input.remark ?? null,
        ...tenant.params,
      },
    );
  }

  removeData(ids: string[]): Promise<unknown> {
    const tenant = tenantWhere('sys_dict_data');
    const { params, placeholders } = buildIdParams(ids);
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(`UPDATE sys_dict_data SET deleted = 1 WHERE dict_data_id IN (${placeholders})${tenantSql}`, {
      ...params,
      ...tenant.params,
    });
  }
}
