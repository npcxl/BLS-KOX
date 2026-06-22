import { execute, query, queryOne } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import {
  GlobalSearchResultRow,
  SearchConfigInput,
  SearchConfigRecord,
  SearchConfigQuery,
} from './global-search.model';

function safeIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`非法字段或表名：${value}`);
  }
  return value;
}

export class GlobalSearchRepository {
  async searchIndex(params: {
    tenantId: string;
    keyword: string;
    permissions: string[];
    userId: string;
    limit: number;
  }): Promise<GlobalSearchResultRow[]> {
    console.log('[global-search] repository.searchIndex start', {
      tenantId: params.tenantId,
      keyword: params.keyword,
      permissionsCount: params.permissions.length,
      userId: params.userId,
      limit: params.limit,
    });
    const permissionSql = params.permissions.length
      ? `AND permission IN (${params.permissions.map((_, index) => `:permission${index}`).join(', ')})`
      : '';
    const permissionParams = Object.fromEntries(params.permissions.map((value, index) => [`permission${index}`, value]));
    const sql = `SELECT biz_id AS id, module_key AS moduleKey, module_name AS moduleName,
              title, subtitle, route_path AS routePath
       FROM sys_search_index
       WHERE (tenant_id = :tenantId OR tenant_id = '000000')
         AND deleted = 0
         AND status = '0'
         ${permissionSql}
         AND (title LIKE :keyword OR subtitle LIKE :keyword OR content LIKE :keyword)
       ORDER BY update_time DESC
       LIMIT :limit`;
    console.log('[global-search] repository.searchIndex sql', {
      tenantId: params.tenantId,
      keyword: params.keyword,
      permissions: params.permissions,
      permissionSql,
      sql,
      params: {
        tenantId: params.tenantId,
        keyword: `%${params.keyword}%`,
        limit: params.limit,
        ...permissionParams,
      },
    });
    const baseParams = {
      tenantId: params.tenantId,
      keyword: `%${params.keyword}%`,
      limit: params.limit,
      ...permissionParams,
    };
    const rows = await query<GlobalSearchResultRow>(sql, baseParams);
    if (rows.length === 0) {
      const [totalRows, keywordRows, permissionKeywordRows] = await Promise.all([
        query<{ count: number }>(
          `SELECT COUNT(1) AS count FROM sys_search_index WHERE (tenant_id = :tenantId OR tenant_id = '000000') AND deleted = 0 AND status = '0'`,
          { tenantId: params.tenantId },
        ),
        query<{ count: number }>(
          `SELECT COUNT(1) AS count FROM sys_search_index WHERE (tenant_id = :tenantId OR tenant_id = '000000') AND deleted = 0 AND status = '0' AND (title LIKE :keyword OR subtitle LIKE :keyword OR content LIKE :keyword)`,
          { tenantId: params.tenantId, keyword: `%${params.keyword}%` },
        ),
        query<{ count: number }>(
          `SELECT COUNT(1) AS count FROM sys_search_index WHERE (tenant_id = :tenantId OR tenant_id = '000000') AND deleted = 0 AND status = '0' ${permissionSql} AND (title LIKE :keyword OR subtitle LIKE :keyword OR content LIKE :keyword)`,
          baseParams,
        ),
      ]);
      console.log('[global-search] repository.searchIndex debug counts', {
        tenantId: params.tenantId,
        keyword: params.keyword,
        totalCount: totalRows[0]?.count ?? 0,
        keywordCount: keywordRows[0]?.count ?? 0,
        permissionKeywordCount: permissionKeywordRows[0]?.count ?? 0,
      });
    }
    console.log('[global-search] repository.searchIndex rows', {
      tenantId: params.tenantId,
      keyword: params.keyword,
      rowCount: rows.length,
    });
    return rows;
  }

  async listConfigs(filters: SearchConfigQuery): Promise<{ rows: SearchConfigRecord[]; total: number }> {
    const where: string[] = ['deleted = 0'];
    const params: Record<string, unknown> = {};
    if (filters.moduleKey) {
      where.push('module_key LIKE :moduleKey');
      params.moduleKey = `%${filters.moduleKey}%`;
    }
    if (filters.enabled !== undefined && filters.enabled !== '') {
      where.push('enabled = :enabled');
      params.enabled = Number(filters.enabled);
    }
    if (filters.keyword) {
      where.push('(module_name LIKE :keyword OR permission LIKE :keyword OR source_table LIKE :keyword)');
      params.keyword = `%${filters.keyword}%`;
    }
    const pageNum = Number(filters.pageNum ?? 1);
    const pageSize = Number(filters.pageSize ?? 10);
    const offset = (pageNum - 1) * pageSize;
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await queryOne<{ total: number }>(
      `SELECT COUNT(1) AS total FROM sys_global_search_config ${sqlWhere}`,
      params,
    );
    const rows = await query<SearchConfigRecord>(
      `SELECT search_id AS searchId, module_key AS moduleKey, module_name AS moduleName,
              permission, route_path AS routePath, source_table AS sourceTable,
              biz_id_field AS bizIdField, title_field AS titleField,
              subtitle_field AS subtitleField, content_fields AS contentFields,
              tenant_field AS tenantField, owner_field AS ownerField, dept_field AS deptField,
              created_by_field AS createdByField, status_field AS statusField,
              deleted_field AS deletedField, enabled, sort, remark,
              create_time AS createTime, update_time AS updateTime
       FROM sys_global_search_config
       ${sqlWhere}
       ORDER BY sort ASC, update_time DESC
       LIMIT :offset, :pageSize`,
      { ...params, offset, pageSize },
    );
    return { rows, total: total?.total ?? 0 };
  }

  async listEnabled(): Promise<SearchConfigRecord[]> {
    return query<SearchConfigRecord>(
      `SELECT search_id AS searchId, module_key AS moduleKey, module_name AS moduleName,
              permission, route_path AS routePath, source_table AS sourceTable,
              biz_id_field AS bizIdField, title_field AS titleField,
              subtitle_field AS subtitleField, content_fields AS contentFields,
              tenant_field AS tenantField, owner_field AS ownerField, dept_field AS deptField,
              created_by_field AS createdByField, status_field AS statusField,
              deleted_field AS deletedField, enabled, sort, remark,
              create_time AS createTime, update_time AS updateTime
       FROM sys_global_search_config
       WHERE deleted = 0 AND enabled = 1
       ORDER BY sort ASC, update_time DESC`,
    );
  }

  async saveConfig(input: SearchConfigInput): Promise<string> {
    const searchId = input.searchId ?? generateSnowflakeId();
    await execute(
      `REPLACE INTO sys_global_search_config
       (search_id, module_key, module_name, permission, route_path, source_table,
        biz_id_field, title_field, subtitle_field, content_fields, tenant_field,
        owner_field, dept_field, created_by_field, status_field, deleted_field,
        enabled, sort, remark)
       VALUES
       (:searchId, :moduleKey, :moduleName, :permission, :routePath, :sourceTable,
        :bizIdField, :titleField, :subtitleField, :contentFields, :tenantField,
        :ownerField, :deptField, :createdByField, :statusField, :deletedField,
        :enabled, :sort, :remark)`,
      {
        searchId,
        moduleKey: input.moduleKey,
        moduleName: input.moduleName,
        permission: input.permission,
        routePath: input.routePath ?? null,
        sourceTable: input.sourceTable ?? null,
        bizIdField: input.bizIdField ?? null,
        titleField: input.titleField ?? null,
        subtitleField: input.subtitleField ?? null,
        contentFields: input.contentFields ?? null,
        tenantField: input.tenantField ?? null,
        ownerField: input.ownerField ?? null,
        deptField: input.deptField ?? null,
        createdByField: input.createdByField ?? null,
        statusField: input.statusField ?? null,
        deletedField: input.deletedField ?? null,
        enabled: input.enabled ?? 1,
        sort: input.sort ?? 0,
        remark: input.remark ?? null,
      },
    );
    return searchId;
  }

  async deleteConfig(searchId: string): Promise<void> {
    await execute('UPDATE sys_global_search_config SET deleted = 1 WHERE search_id = :searchId', { searchId });
  }

  async findConfig(searchId: string): Promise<SearchConfigRecord | null> {
    return queryOne<SearchConfigRecord>(
      `SELECT search_id AS searchId, module_key AS moduleKey, module_name AS moduleName,
              permission, route_path AS routePath, source_table AS sourceTable,
              biz_id_field AS bizIdField, title_field AS titleField,
              subtitle_field AS subtitleField, content_fields AS contentFields,
              tenant_field AS tenantField, owner_field AS ownerField, dept_field AS deptField,
              created_by_field AS createdByField, status_field AS statusField,
              deleted_field AS deletedField, enabled, sort, remark,
              create_time AS createTime, update_time AS updateTime
       FROM sys_global_search_config WHERE search_id = :searchId AND deleted = 0 LIMIT 1`,
      { searchId },
    );
  }

  async upsertSearchIndex(input: {
    tenantId: string;
    moduleKey: string;
    moduleName: string;
    bizId: string;
    title: string;
    subtitle?: string | null;
    content?: string | null;
    permission: string;
    routePath?: string | null;
    ownerId?: string | null;
    deptId?: string | null;
    createdBy?: string | null;
    status?: string | null;
    deleted?: number;
    sourceTable?: string | null;
  }): Promise<void> {
    const indexId = `${input.tenantId}:${input.moduleKey}:${input.bizId}`;
    await execute(
      `REPLACE INTO sys_search_index
       (index_id, tenant_id, module_key, module_name, biz_id, title, subtitle, content,
        permission, route_path, owner_id, dept_id, created_by, status, deleted, source_table)
       VALUES
       (:indexId, :tenantId, :moduleKey, :moduleName, :bizId, :title, :subtitle, :content,
        :permission, :routePath, :ownerId, :deptId, :createdBy, :status, :deleted, :sourceTable)`,
      {
        indexId,
        tenantId: input.tenantId,
        moduleKey: input.moduleKey,
        moduleName: input.moduleName,
        bizId: input.bizId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        content: input.content ?? null,
        permission: input.permission,
        routePath: input.routePath ?? null,
        ownerId: input.ownerId ?? null,
        deptId: input.deptId ?? null,
        createdBy: input.createdBy ?? null,
        status: input.status ?? '0',
        deleted: input.deleted ?? 0,
        sourceTable: input.sourceTable ?? null,
      },
    );
  }

  async deleteSearchIndex(tenantId: string, moduleKey: string, bizId: string): Promise<void> {
    await execute(
      'DELETE FROM sys_search_index WHERE tenant_id = :tenantId AND module_key = :moduleKey AND biz_id = :bizId',
      { tenantId, moduleKey, bizId },
    );
  }

  async rebuildSearchIndex(moduleKey?: string, tenantId?: string): Promise<number> {
    const configs = await this.listEnabled();
    const filtered = configs.filter((item) => !moduleKey || item.moduleKey === moduleKey);
    let affected = 0;
    for (const config of filtered) {
      const targetTenantId = tenantId ?? getCurrentTenantId();
      if (!targetTenantId) continue;
      if (!config.sourceTable || !config.bizIdField || !config.titleField) continue;
      safeIdentifier(config.sourceTable);
      safeIdentifier(config.bizIdField);
      safeIdentifier(config.titleField);
      if (config.subtitleField) safeIdentifier(config.subtitleField);
      const contentFields = (config.contentFields ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map(safeIdentifier);
      const tenantField = config.tenantField ? safeIdentifier(config.tenantField) : null;
      const statusField = config.statusField ? safeIdentifier(config.statusField) : null;
      const deletedField = config.deletedField ? safeIdentifier(config.deletedField) : null;
      const ownerField = config.ownerField ? safeIdentifier(config.ownerField) : null;
      const deptField = config.deptField ? safeIdentifier(config.deptField) : null;
      const createdByField = config.createdByField ? safeIdentifier(config.createdByField) : null;
      const table = safeIdentifier(config.sourceTable);
      const bizIdField = safeIdentifier(config.bizIdField);
      const titleField = safeIdentifier(config.titleField);
      const subtitleSelect = config.subtitleField ? `, ${safeIdentifier(config.subtitleField)} AS subtitle` : ', NULL AS subtitle';
      const contentSelect = contentFields.length ? `, CONCAT_WS(',', ${contentFields.join(', ')}) AS content` : ', NULL AS content';
      const whereParts = [`1 = 1`];
      const params: Record<string, unknown> = {};
      if (tenantField) {
        whereParts.push(`${tenantField} = :tenantId`);
        params.tenantId = targetTenantId;
      }
      if (statusField) whereParts.push(`${statusField} = '0'`);
      if (deletedField) whereParts.push(`${deletedField} = 0`);
      const sourceSql = `SELECT ${bizIdField} AS bizId, ${titleField} AS title${subtitleSelect}${contentSelect}
         ${ownerField ? `, ${ownerField} AS ownerId` : ', NULL AS ownerId'}
         ${deptField ? `, ${deptField} AS deptId` : ', NULL AS deptId'}
         ${createdByField ? `, ${createdByField} AS createdBy` : ', NULL AS createdBy'}
         ${statusField ? `, ${statusField} AS status` : ", '0' AS status"}
         ${deletedField ? `, ${deletedField} AS deleted` : ', 0 AS deleted'}
         FROM ${table}
         WHERE ${whereParts.join(' AND ')}`;
    console.log('[global-search] repository.rebuildSearchIndex source sql', {
      moduleKey: config.moduleKey,
      targetTenantId,
      table,
      whereParts,
      params,
      sourceSql,
    });
    const rows = await query<{
        bizId: string;
        title: string;
        subtitle: string | null;
        content: string | null;
        ownerId: string | null;
        deptId: string | null;
        createdBy: string | null;
        status: string | null;
        deleted: number | null;
      }>(sourceSql, params);
      await execute('DELETE FROM sys_search_index WHERE tenant_id = :tenantId AND module_key = :moduleKey', {
        tenantId: targetTenantId,
        moduleKey: config.moduleKey,
      });
      for (const row of rows) {
        await this.upsertSearchIndex({
          tenantId: targetTenantId,
          moduleKey: config.moduleKey,
          moduleName: config.moduleName,
          bizId: row.bizId,
          title: row.title,
          subtitle: row.subtitle,
          content: row.content,
          permission: config.permission,
          routePath: config.routePath,
          ownerId: row.ownerId,
          deptId: row.deptId,
          createdBy: row.createdBy,
          status: row.status,
          deleted: row.deleted ?? 0,
          sourceTable: config.sourceTable,
        });
        affected += 1;
      }
    }
    return affected;
  }
}
