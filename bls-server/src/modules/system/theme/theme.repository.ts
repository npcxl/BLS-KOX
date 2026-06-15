import { execute, query, queryOne } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition } from '../../../core/sql';
import { getCurrentTenantId, tenantWhere } from '../../../middleware/tenant';
import { normalizeTenantId } from '../../../shared/constants/tenant';
import { getPageParams } from '../../../shared/utils/pagination';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { ThemeConfig, ThemeInput, ThemeQuery } from './theme.model';

function idParams(ids: string[]) {
  return {
    params: Object.fromEntries(ids.map((id, index) => [`id${index}`, id])),
    placeholders: ids.map((_, index) => `:id${index}`).join(', '),
  };
}

export class ThemeRepository {
  async list(filters: ThemeQuery): Promise<{ rows: ThemeConfig[]; total: number }> {
    const page = getPageParams(filters);
    const tenant = tenantWhere('sys_theme_config');
    const where = joinConditions([
      tenant,
      likeCondition('title', 'title', filters.title),
      eqCondition('status', 'status', filters.status),
      { sql: 'deleted = 0', params: {} },
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const rows = await query<ThemeConfig>(
      `SELECT theme_id AS themeId, tenant_id AS tenantId, nav_theme AS navTheme, color_primary AS colorPrimary,
              layout, content_width AS contentWidth, fixed_header AS fixedHeader, fix_siderbar AS fixSiderbar,
              color_weak AS colorWeak, title, logo, iconfont_url AS iconfontUrl, token_json AS tokenJson,
              status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_theme_config
       ${where.sql}
       ORDER BY theme_id DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    const total = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM sys_theme_config ${where.sql}`, where.params);
    return { rows, total: total?.total ?? 0 };
  }

  findById(themeId: string): Promise<ThemeConfig | null> {
    const tenant = tenantWhere('sys_theme_config');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return queryOne<ThemeConfig>(
      `SELECT theme_id AS themeId, tenant_id AS tenantId, nav_theme AS navTheme, color_primary AS colorPrimary,
              layout, content_width AS contentWidth, fixed_header AS fixedHeader, fix_siderbar AS fixSiderbar,
              color_weak AS colorWeak, title, logo, iconfont_url AS iconfontUrl, token_json AS tokenJson,
              status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_theme_config
       WHERE theme_id = :themeId AND deleted = 0${tenantSql}
       LIMIT 1`,
      { themeId, ...tenant.params },
    );
  }

  findByTenant(tenantId: string): Promise<ThemeConfig | null> {
    return queryOne<ThemeConfig>(
      `SELECT theme_id AS themeId, tenant_id AS tenantId, nav_theme AS navTheme, color_primary AS colorPrimary,
              layout, content_width AS contentWidth, fixed_header AS fixedHeader, fix_siderbar AS fixSiderbar,
              color_weak AS colorWeak, title, logo, iconfont_url AS iconfontUrl, token_json AS tokenJson,
              status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_theme_config
       WHERE tenant_id = :tenantId AND deleted = 0 AND status = '0'
       LIMIT 1`,
      { tenantId: normalizeTenantId(tenantId) },
    );
  }

  async create(input: ThemeInput): Promise<string> {
    const tenantId = normalizeTenantId(input.tenantId ?? getCurrentTenantId());
    const themeId = input.themeId ?? generateSnowflakeId();
    await execute(
      `INSERT INTO sys_theme_config (theme_id, tenant_id, nav_theme, color_primary, layout, content_width,
        fixed_header, fix_siderbar, color_weak, title, logo, iconfont_url, token_json, status, remark, deleted)
       VALUES (:themeId, :tenantId, :navTheme, :colorPrimary, :layout, :contentWidth,
        :fixedHeader, :fixSiderbar, :colorWeak, :title, :logo, :iconfontUrl, :tokenJson, :status, :remark, 0)`,
      { ...this.toParams(themeId, input), tenantId },
    );
    return themeId;
  }

  update(input: ThemeInput & { themeId: string }): Promise<unknown> {
    const tenant = tenantWhere('sys_theme_config');
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(
      `UPDATE sys_theme_config
       SET nav_theme = :navTheme, color_primary = :colorPrimary, layout = :layout, content_width = :contentWidth,
           fixed_header = :fixedHeader, fix_siderbar = :fixSiderbar, color_weak = :colorWeak, title = :title,
           logo = :logo, iconfont_url = :iconfontUrl, token_json = :tokenJson, status = :status, remark = :remark
       WHERE theme_id = :themeId AND deleted = 0${tenantSql}`,
      { ...this.toParams(input.themeId, input), ...tenant.params },
    );
  }
  
  remove(ids: string[]): Promise<unknown> {
    const tenant = tenantWhere('sys_theme_config');
    const built = idParams(ids);
    const tenantSql = tenant.sql ? ` AND ${tenant.sql}` : '';
    return execute(`UPDATE sys_theme_config SET deleted = 1 WHERE theme_id IN (${built.placeholders})${tenantSql}`, {
      ...built.params,
      ...tenant.params,
    });
  }

  private toParams(themeId: string, input: ThemeInput) {
    return {
      themeId,
      navTheme: input.navTheme ?? 'light',
      colorPrimary: input.colorPrimary ?? '#1677ff',
      layout: input.layout ?? 'mix',
      contentWidth: input.contentWidth ?? 'Fluid',
      fixedHeader: input.fixedHeader ?? 0,
      fixSiderbar: input.fixSiderbar ?? 1,
      colorWeak: input.colorWeak ?? 0,
      title: input.title,
      logo: input.logo ?? null,
      iconfontUrl: input.iconfontUrl ?? '',
      tokenJson: input.tokenJson ?? '{}',
      status: input.status ?? '0',
      remark: input.remark ?? null,
    };
  }
}
