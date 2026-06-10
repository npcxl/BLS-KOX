import { execute, query, queryOne } from '../../../core/database';
import { eqCondition, joinConditions, likeCondition } from '../../../core/sql';
import { PageParams } from '../../../shared/utils/pagination';
import { CreateTenantInput, Tenant, TenantQuery, UpdateTenantInput } from './tenant.model';

export class TenantRepository {
  listEnabledOptions(): Promise<Pick<Tenant, 'tenantId' | 'tenantName'>[]> {
    return query<Pick<Tenant, 'tenantId' | 'tenantName'>>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName
       FROM sys_tenant
       WHERE status = '0'
       ORDER BY tenant_id ASC`,
    );
  }

  async list(filters: TenantQuery, page: PageParams): Promise<{ rows: Tenant[]; total: number }> {
    const where = joinConditions([
      likeCondition('tenant_name', 'tenantName', filters.tenantName),
      eqCondition('status', 'status', filters.status),
    ]);
    const params = { ...where.params, offset: page.offset, pageSize: page.pageSize };
    const rows = await query<Tenant>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, contact_user AS contactUser,
              contact_phone AS contactPhone, status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_tenant
       ${where.sql}
       ORDER BY tenant_id DESC
       LIMIT :offset, :pageSize`,
      params,
    );
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM sys_tenant ${where.sql}`, where.params);
    return { rows, total: totalRow?.total ?? 0 };
  }

  findById(tenantId: number): Promise<Tenant | null> {
    return queryOne<Tenant>(
      `SELECT tenant_id AS tenantId, tenant_name AS tenantName, contact_user AS contactUser,
              contact_phone AS contactPhone, status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_tenant WHERE tenant_id = :tenantId`,
      { tenantId },
    );
  }

  async create(input: CreateTenantInput): Promise<number> {
    const result = await execute(
      `INSERT INTO sys_tenant (tenant_name, contact_user, contact_phone, status, remark)
       VALUES (:tenantName, :contactUser, :contactPhone, :status, :remark)`,
      {
        tenantName: input.tenantName,
        contactUser: input.contactUser ?? null,
        contactPhone: input.contactPhone ?? null,
        status: input.status ?? '0',
        remark: input.remark ?? null,
      },
    );
    return result.insertId;
  }

  update(input: UpdateTenantInput): Promise<unknown> {
    return execute(
      `UPDATE sys_tenant
       SET tenant_name = :tenantName, contact_user = :contactUser, contact_phone = :contactPhone,
           status = :status, remark = :remark
       WHERE tenant_id = :tenantId`,
      {
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        contactUser: input.contactUser ?? null,
        contactPhone: input.contactPhone ?? null,
        status: input.status ?? '0',
        remark: input.remark ?? null,
      },
    );
  }

  remove(ids: number[]): Promise<unknown> {
    return execute(`DELETE FROM sys_tenant WHERE tenant_id IN (${ids.map(() => '?').join(',')}) AND tenant_id <> 0`, ids);
  }

  changeStatus(tenantId: number, status: '0' | '1'): Promise<unknown> {
    return execute('UPDATE sys_tenant SET status = :status WHERE tenant_id = :tenantId AND tenant_id <> 0', { tenantId, status });
  }
}
