/**
 * Security Event Center API
 *
 * GET /api/system/security/stats    安全事件统计
 * GET /api/system/security/rules    风险规则列表
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { getSecurityStats } from '../../../security/event-center/event-center';
import { DEFAULT_RULES } from '../../../security/event-center/risk-rules';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { getCurrentTenantId } from '../../../middleware/tenant';

const router = new Router({ prefix: '/system/security' });

/** 安全事件统计 */
router.get('/stats', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const stats = await getSecurityStats(tid);
  ctx.body = { code: 200, data: stats };
});

/** 风险规则列表 */
router.get('/rules', jwtAuth(), hasPerm('system:security:stats'), async (ctx: Context) => {
  ctx.body = {
    code: 200,
    data: DEFAULT_RULES.map((r) => ({
      id: r.id,
      name: r.name,
      eventTypes: r.eventTypes,
      threshold: r.threshold,
      riskLevel: r.riskLevel,
      actions: r.actions,
    })),
  };
});

export default router;
