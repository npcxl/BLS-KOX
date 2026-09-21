/**
 * 租户生命周期校验（阶段一）
 *
 * 统一入口：登录 / refresh / jwtAuth / 后台任务在执行任何业务操作前，
 * 都必须校验租户可用性：
 *
 *   tenant.deleted = 0
 *   tenant.status  = '0'
 *   tenant.offboard_status = 'none'
 *   tenant.expire_time IS NULL OR tenant.expire_time > NOW()
 *
 * 该模块不做任何缓存，调用方负责在合理的粒度上复用查询结果。
 */
import { queryOne } from '../core/database';
import { UnauthorizedError } from '../core/errors';

export interface TenantAuthRow {
  tenantId: string;
  tenantName: string;
  domainName: string | null;
  packageId: string | null;
  status: string;
  deleted: number;
  offboardStatus: string | null;
  expireTime: string | null;
}

const TENANT_AUTH_COLUMNS = `
  tenant_id AS tenantId,
  tenant_name AS tenantName,
  domain_name AS domainName,
  package_id AS packageId,
  status,
  deleted,
  offboard_status AS offboardStatus,
  expire_time AS expireTime
`;

/** 按主键查询租户（含已删除行，交由 assertTenantUsable 判定） */
export async function findTenantById(tenantId: string): Promise<TenantAuthRow | null> {
  if (!tenantId) return null;
  return queryOne<TenantAuthRow>(
    `SELECT ${TENANT_AUTH_COLUMNS} FROM sys_tenant WHERE tenant_id = :tid LIMIT 1`,
    { tid: tenantId },
  );
}

/** 按域名查询租户（域名已规范化存储） */
export async function findTenantByDomain(domain: string): Promise<TenantAuthRow | null> {
  if (!domain) return null;
  return queryOne<TenantAuthRow>(
    `SELECT ${TENANT_AUTH_COLUMNS} FROM sys_tenant WHERE domain_name = :d LIMIT 1`,
    { d: domain },
  );
}

/**
 * 判断租户是否已过期。
 * 非法时间字符串按“已过期”处理（fail-closed）。
 */
export function isTenantExpired(expireTime: string | null | undefined, now: Date = new Date()): boolean {
  if (!expireTime) return false;
  const text = String(expireTime).trim();
  if (!text) return false;
  const parsed = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= now.getTime();
}

/** 统一的租户可用性断言，失败抛 401（不泄露租户是否存在） */
export function assertTenantUsable(tenant: TenantAuthRow | null): TenantAuthRow {
  if (!tenant || Number(tenant.deleted) !== 0) {
    throw new UnauthorizedError('租户不存在或已停用');
  }
  if (tenant.offboardStatus && tenant.offboardStatus !== 'none') {
    throw new UnauthorizedError('租户已停用');
  }
  if (String(tenant.status) !== '0') {
    throw new UnauthorizedError('租户已停用');
  }
  if (isTenantExpired(tenant.expireTime)) {
    throw new UnauthorizedError('租户已过期');
  }
  return tenant;
}

/** 查询 + 断言：租户存在、未删除、已启用、未过期、未在 offboarding */
export async function assertTenantActive(tenantId: string): Promise<TenantAuthRow> {
  const row = await findTenantById(tenantId);
  return assertTenantUsable(row);
}

/** 布尔版本，便于测试与非关键路径使用 */
export async function isTenantActive(tenantId: string): Promise<boolean> {
  try {
    await assertTenantActive(tenantId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验用户可用性：deleted = 0 且 status = '0'
 */
export function assertUserUsable(user: { deleted?: number | null; status?: string | null } | null): void {
  if (!user || Number(user.deleted ?? 0) !== 0) {
    throw new UnauthorizedError('用户名或密码错误');
  }
  if (String(user.status ?? '0') !== '0') {
    throw new UnauthorizedError('用户已被停用');
  }
}
