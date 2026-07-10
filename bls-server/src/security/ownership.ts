/**
 * 对象所有权校验工具
 *
 * 防止同租户内不同用户越权访问数据
 */

import { getDb } from '../core/database';
import { getCurrentTenantId } from '../core/request-context';
import { ForbiddenError, NotFoundError } from '../core/errors';

interface OwnershipCheck {
  /** 表名 */
  table: string;
  /** 主键字段 */
  idField: string;
  /** 记录 ID */
  id: string;
  /** 租户字段，默认 tenant_id */
  tenantField?: string;
  /** 所有者字段（可选，如 user_id / created_by） */
  ownerField?: string;
  /** 预期所有者 ID（未传则不检查） */
  ownerId?: string;
}

/**
 * 断言资源属于当前租户（及可选所有者）
 * 跨租户 → NotFound，同租户但不同所有者 → Forbidden
 */
export async function assertOwnership(check: OwnershipCheck): Promise<void> {
  const tenantId = getCurrentTenantId();
  if (!tenantId) throw new ForbiddenError('未获取到租户上下文');

  const db = (await getDb()) as any;
  const tenantField = check.tenantField ?? 'tenant_id';

  const row = await db.selectFrom(check.table)
    .select([check.idField, tenantField, check.ownerField].filter(Boolean) as string[])
    .where(check.idField as any, '=', check.id)
    .executeTakeFirst();

  // 记录不存在 → NotFound（不暴露是否因跨租户）
  if (!row) throw new NotFoundError();

  // 跨租户 → NotFound（同上策略，不区分）
  if (String(row[tenantField]) !== tenantId) throw new NotFoundError();

  // 所有者校验
  if (check.ownerField && check.ownerId) {
    if (String(row[check.ownerField]) !== check.ownerId) throw new ForbiddenError();
  }
}

/**
 * 断言多租户表数据存在并属于当前租户
 * 简化版：只检查表的存在性和租户归属
 */
export async function assertTenantResource(table: string, idField: string, id: string): Promise<void> {
  await assertOwnership({ table, idField, id });
}
