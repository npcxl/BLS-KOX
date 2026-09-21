/**
 * 租户 offboarding Job（阶段一）
 *
 * 删除租户是**异步**流程：接口只把租户标记为 status='1' / offboard_status='pending'
 * 并吊销全部会话，真正“卸载”租户数据的动作由本 Job 执行。
 *
 * 该 Job **不物理删除业务数据**，只做：
 *   - 软删除该租户的用户 / 角色 / 部门
 *   - 清理 sys_user_role / sys_role_menu 关联（避免孤儿行）
 *   - 释放 domain_name（置 NULL，允许域名被其他租户重新绑定）
 *   - offboard_status → 'completed'
 *
 * 数据物理清理需要运维单独确认后执行（保留审计与恢复窗口）。
 */
import type { JobDefinition } from '../job-types';
import { logger } from '../../core/logger';

export const tenantOffboardJob: JobDefinition = {
  type: 'tenant.offboard',
  maxAttempts: 5,
  timeout: 5 * 60_000,

  async handler(payload: Record<string, unknown>) {
    const tenantId = String(payload?.tenantId ?? '');
    if (!tenantId) throw new Error('[tenant.offboard] tenantId is required in jobData');
    if (tenantId === '000000') throw new Error('[tenant.offboard] 平台租户不允许 offboarding');

    // 延迟 require：单测导入本模块时不应建立真实数据库/Redis 连接
    const { getDb } = require('../../core/database');
    const { sessionCenter } = require('../../security/session/session-center');

    const db = (await getDb()) as any;
    const tenant = await db.selectFrom('sys_tenant')
      .select(['tenant_id', 'offboard_status', 'deleted'])
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!tenant) {
      logger.warn('[tenant.offboard] tenant not found, skip', { tenantId });
      return { skipped: true, reason: 'tenant_not_found' };
    }
    if (tenant.offboard_status === 'completed') {
      return { skipped: true, reason: 'already_completed' };
    }

    const result = await db.transaction().execute(async (trx: any) => {
      const users: any[] = await trx.selectFrom('sys_user').select('user_id')
        .where('tenant_id', '=', tenantId).execute();
      const userIds = users.map((u) => String(u.user_id));

      const roles: any[] = await trx.selectFrom('sys_role').select('role_id')
        .where('tenant_id', '=', tenantId).execute();
      const roleIds = roles.map((r) => String(r.role_id));

      if (userIds.length > 0) {
        await trx.deleteFrom('sys_user_role').where('user_id', 'in', userIds).execute();
      }
      if (roleIds.length > 0) {
        await trx.deleteFrom('sys_role_menu').where('role_id', 'in', roleIds).execute();
      }

      const userRes: any = await trx.updateTable('sys_user').set({ deleted: 1, status: '1' })
        .where('tenant_id', '=', tenantId).where('deleted', '=', 0).executeTakeFirst();
      const roleRes: any = await trx.updateTable('sys_role').set({ deleted: 1, status: '1' })
        .where('tenant_id', '=', tenantId).where('deleted', '=', 0).executeTakeFirst();
      await trx.updateTable('sys_dept').set({ deleted: 1 })
        .where('tenant_id', '=', tenantId).where('deleted', '=', 0).execute();

      await trx.updateTable('sys_tenant')
        .set({ status: '1', offboard_status: 'completed', domain_name: null })
        .where('tenant_id', '=', tenantId).execute();

      return {
        users: Number(userRes?.numUpdatedRows ?? 0),
        roles: Number(roleRes?.numUpdatedRows ?? 0),
      };
    });

    await sessionCenter.revokeAllForTenant(tenantId).catch(() => {});
    logger.info('[tenant.offboard] completed', { tenantId, ...result });
    return result;
  },
};
