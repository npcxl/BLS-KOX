import Router from 'koa-router';
import { Context } from 'koa';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm, isPlatformSuperAdmin } from '../../../middleware/permission';
import { ForbiddenError, ValidationError } from '../../../core/errors';
import { success } from '../../../core/response';
import { getRequestContext } from '../../../core/request-context';
import { entitlementService } from '../../../services/entitlement-service';
import { quotaService } from '../../../services/quota-service';
import { FEATURE_LABELS, QUOTA_LABELS } from '../../../shared/constants/entitlements';

const router = new Router({ prefix: '/system/quota' });

async function buildQuotaView(tenantId: string) {
  const entitlements = await entitlementService.getEntitlements(tenantId);
  const quotas = await quotaService.snapshot(tenantId);
  return {
    tenantId,
    packageId: entitlements.packageId,
    features: Object.entries(entitlements.features).map(([key, enabled]) => ({
      featureKey: key,
      label: FEATURE_LABELS[key] ?? key,
      enabled,
    })),
    quotas: quotas.map((q) => ({
      quotaKey: q.quotaKey,
      label: QUOTA_LABELS[q.quotaKey] ?? q.quotaKey,
      limit: q.limit,
      used: q.used,
      remaining: q.remaining,
      unlimited: q.unlimited,
      period: q.period,
      periodKey: q.periodKey,
    })),
  };
}

/**
 * GET /system/quota/my — 当前租户的套餐权益与配额用量
 * 前端用它显示“已用量 / 剩余额度”。
 */
router.get('/my', jwtAuth(), hasPerm('system:quota:list'), async (ctx: Context) => {
  const reqCtx = getRequestContext();
  const tenantId = reqCtx?.tenantId;
  if (!tenantId) throw new ValidationError('缺少租户上下文');
  success(ctx, await buildQuotaView(tenantId), '查询成功');
});

/**
 * GET /system/quota/tenant/:tenantId — 指定租户的配额（仅平台超级管理员或该租户自身）
 */
router.get('/tenant/:tenantId', jwtAuth(), hasPerm('system:quota:list'), async (ctx: Context) => {
  const target = String(ctx.params.tenantId ?? '').trim();
  if (!target) throw new ValidationError('缺少 tenantId');

  const user = ctx.state.user as any;
  if (String(user?.tenantId) !== target && !isPlatformSuperAdmin(user)) {
    throw new ForbiddenError('无权查看其他租户的配额');
  }

  success(ctx, await buildQuotaView(target), '查询成功');
});

export default router;
