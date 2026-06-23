import { execute, query, queryOne, transaction } from "../../../core/database";
import { eqCondition, joinConditions, likeCondition } from "../../../core/sql";
import {
  PLATFORM_TENANT_ID,
  isPlatformTenantId,
  normalizeTenantId,
} from "../../../shared/constants/tenant";
import { PageParams } from "../../../shared/utils/pagination";
import { hashPassword } from "../../../shared/utils/password";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import {
  CreateTenantInput,
  Tenant,
  TenantQuery,
  UpdateTenantInput,
} from "./tenant.model";

const DEFAULT_TENANT_CONFIGS = [
  {
    configKey: 'sys.user.defaultPassword',
    configName: '默认密码',
    configValue: '123456',
    configType: 'sys' as const,
    remark: '新建租户默认管理员初始密码',
  },
  {
    configKey: 'sys.app.name',
    configName: '系统名称',
    configValue: 'BLS 管理系统',
    configType: 'sys' as const,
    remark: '新建租户默认系统名称',
  },
  {
    configKey: 'sys.demo.enabled',
    configName: '演示模式',
    configValue: '0',
    configType: 'sys' as const,
    remark: '新建租户默认是否启用演示模式',
  },
  {
    configKey: 'sys.upload.maxSize',
    configName: '上传大小限制',
    configValue: '20',
    configType: 'sys' as const,
    remark: '新建租户默认上传限制，单位 MB',
  },
  {
    configKey: 'sys.version',
    configName: '系统版本',
    configValue: '1.0.0',
    configType: 'sys' as const,
    remark: '新建租户默认系统版本',
  },
  {
    configKey: 'sys.app.logo',
    configName: '系统 Logo',
    configValue: '',
    configType: 'sys' as const,
    remark: '新建租户默认系统 Logo',
  },
  {
    configKey: 'sys.user.defaultAvatar',
    configName: '默认头像',
    configValue: '',
    configType: 'sys' as const,
    remark: '新建租户默认用户头像',
  },
  {
    configKey: 'theme.default',
    configName: '默认主题',
    configValue: '{"navTheme":"light","colorPrimary":"#1677ff","layout":"mix","contentWidth":"Fluid"}',
    configType: 'theme' as const,
    remark: '新建租户默认主题配置',
  },
];

export class TenantRepository {
  listEnabledOptions(): Promise<Pick<Tenant, "tenantId" | "tenantName">[]> {
    return query<Pick<Tenant, "tenantId" | "tenantName">>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName
       FROM sys_tenant
       WHERE status = '0'
       ORDER BY tenant_id ASC`,
    );
  }

  findByDomain(domainName: string): Promise<Tenant | null> {
    return queryOne<Tenant>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, package_id AS packageId,
              expire_time AS expireTime, domain_name AS domainName, contact_user AS contactUser,
              contact_phone AS contactPhone, status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_tenant
       WHERE domain_name = :domainName
       LIMIT 1`,
      { domainName: domainName.toLowerCase() },
    );
  }

  async list(
    filters: TenantQuery,
    page: PageParams,
  ): Promise<{ rows: Tenant[]; total: number }> {
    const where = joinConditions([
      likeCondition("tenant_name", "tenantName", filters.tenantName),
      eqCondition("status", "status", filters.status),
    ]);
    const params = {
      ...where.params,
      offset: page.offset,
      pageSize: page.pageSize,
    };
    const rows = await query<Tenant>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, package_id AS packageId,
              expire_time AS expireTime, domain_name AS domainName, contact_user AS contactUser,
              contact_phone AS contactPhone, status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_tenant
       ${where.sql}
       ORDER BY create_time DESC, tenant_id DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    const totalRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sys_tenant ${where.sql}`,
      where.params,
    );
    return { rows, total: totalRow?.total ?? 0 };
  }

  findById(tenantId: string): Promise<Tenant | null> {
    return queryOne<Tenant>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, package_id AS packageId,
              expire_time AS expireTime, domain_name AS domainName, contact_user AS contactUser,
              contact_phone AS contactPhone, status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_tenant WHERE tenant_id = :tenantId`,
      { tenantId: normalizeTenantId(tenantId) },
    );
  }

  async create(input: CreateTenantInput): Promise<string> {
    const tenantId = normalizeTenantId(input.tenantId ?? generateSnowflakeId());
    const rootDeptId = generateSnowflakeId();
    const adminRoleId = generateSnowflakeId();
    const adminUserId = generateSnowflakeId();
    const themeId = generateSnowflakeId();
    let defaultAdminPassword = await hashPassword('123456');

    await transaction(async (conn) => {
      const packageId = input.packageId ?? "P100";
      const defaultPasswordConfig = await queryOne<{ configValue: string }>(
        `SELECT config_value AS configValue
         FROM sys_config
         WHERE tenant_id = :tenantId AND config_key = 'sys.user.defaultPassword' AND deleted = 0
         ORDER BY config_id DESC
         LIMIT 1`,
        { tenantId: PLATFORM_TENANT_ID },
      );
      defaultAdminPassword = await hashPassword(
        defaultPasswordConfig?.configValue?.trim() || '123456',
      );
      await conn.execute(
        `INSERT INTO sys_tenant (tenant_id, tenant_name, package_id, expire_time, domain_name, contact_user, contact_phone, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          input.tenantName,
          packageId,
          input.expireTime ?? null,
          input.domainName?.toLowerCase() ?? null,
          input.contactUser ?? null,
          input.contactPhone ?? null,
          input.status ?? "0",
          input.remark ?? null,
        ],
      );
      await conn.execute(
        `INSERT INTO sys_dept (dept_id, tenant_id, parent_id, dept_name, sort_num, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [rootDeptId, tenantId, "000000", `${input.tenantName}总部`, 1, "0"],
      );
      await conn.execute(
        `INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, sort_num, status, remark, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          adminRoleId,
          tenantId,
          "租户管理员",
          "tenant_admin",
          1,
          "0",
          "租户默认管理员角色",
        ],
      );
      await conn.execute(
        `INSERT INTO sys_user (user_id, tenant_id, username, password, nickname, real_name, dept_id, is_admin, status, remark, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          adminUserId,
          tenantId,
          "admin",
          defaultAdminPassword,
          "租户管理员",
          "租户管理员",
          rootDeptId,
          "1",
          "0",
          "租户默认管理员",
        ],
      );
      await conn.execute(
        `INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)`,
        [adminUserId, adminRoleId],
      );
      await conn.execute(
        `INSERT INTO sys_role_menu (role_id, menu_id)
         SELECT ?, pm.menu_id
         FROM sys_package_menu pm
         INNER JOIN sys_menu m ON m.menu_id = pm.menu_id
         WHERE pm.package_id = ? AND m.status = '0'`,
        [adminRoleId, packageId],
      );
      for (const config of DEFAULT_TENANT_CONFIGS) {
        await conn.execute(
          `INSERT INTO sys_config (config_id, tenant_id, config_key, config_value, config_name, config_type, remark, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateSnowflakeId(),
            tenantId,
            config.configKey,
            config.configValue,
            config.configName,
            config.configType,
            config.remark,
            "0",
          ],
        );
      }
      await conn.execute(
        `INSERT INTO sys_theme_config (theme_id, tenant_id, nav_theme, color_primary, layout, content_width,
          fixed_header, fix_siderbar, color_weak, title, logo, iconfont_url, token_json, status, remark, deleted)
         VALUES (?, ?, 'light', '#1677ff', 'mix', 'Fluid', 0, 1, 0, ?, NULL, '', JSON_OBJECT(), '0', '租户默认主题配置', 0)`,
        [themeId, tenantId, input.tenantName],
      );
    });
    return tenantId;
  }

  update(input: UpdateTenantInput): Promise<unknown> {
    return execute(
      `UPDATE sys_tenant
       SET tenant_name = :tenantName, package_id = :packageId, expire_time = :expireTime, domain_name = :domainName,
           contact_user = :contactUser, contact_phone = :contactPhone, status = :status, remark = :remark
       WHERE tenant_id = :tenantId`,
      {
        tenantId: normalizeTenantId(input.tenantId),
        tenantName: input.tenantName,
        packageId: input.packageId ?? "P100",
        expireTime: input.expireTime ?? null,
        domainName: input.domainName?.toLowerCase() ?? null,
        contactUser: input.contactUser ?? null,
        contactPhone: input.contactPhone ?? null,
        status: input.status ?? "0",
        remark: input.remark ?? null,
      },
    );
  }

  remove(ids: string[]): Promise<unknown> {
    const normalizedIds = ids
      .map(normalizeTenantId)
      .filter((id) => !isPlatformTenantId(id));
    if (normalizedIds.length === 0) return Promise.resolve(undefined);
    const idParams = Object.fromEntries(
      normalizedIds.map((id, index) => [`id${index}`, id]),
    );
    const idPlaceholders = normalizedIds
      .map((_, index) => `:id${index}`)
      .join(", ");
    return execute(
      `DELETE FROM sys_tenant WHERE tenant_id IN (${idPlaceholders}) AND tenant_id <> :platformTenantId`,
      {
        ...idParams,
        platformTenantId: PLATFORM_TENANT_ID,
      },
    );
  }

  changeStatus(tenantId: string, status: "0" | "1"): Promise<unknown> {
    return execute(
      "UPDATE sys_tenant SET status = :status WHERE tenant_id = :tenantId AND tenant_id <> :platformTenantId",
      {
        status,
        tenantId: normalizeTenantId(tenantId),
        platformTenantId: PLATFORM_TENANT_ID,
      },
    );
  }
}
