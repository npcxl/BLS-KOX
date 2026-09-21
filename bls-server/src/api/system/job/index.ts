/**
 * Job API
 * POST /api/system/jobs — 提交任务 (hasPerm + 类型白名单)
 * GET  /api/system/jobs/:jobId — 查询状态
 * GET  /api/system/jobs — 列表
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { enqueue, getJob, listJobs } from '../../../queue/queue';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { getCurrentTenantId, requireTenantId } from '../../../middleware/tenant';
import { quotaService } from '../../../services/quota-service';
import { QUOTA_KEYS } from '../../../shared/constants/entitlements';

/** 允许异步提交的 Job 类型白名单 */
const ALLOWED_JOB_TYPES = new Set(['export', 'import', 'notification', 'webhook']);

const router = new Router({ prefix: '/system/jobs' });

router.post('/', jwtAuth(), hasPerm('system:job:create'), async (ctx: Context) => {
  const tid = requireTenantId();
  const body = ctx.request.body as any;
  const { jobType, jobData } = body ?? {};
  if (!jobType || !jobData) {
    ctx.body = { code: 400, message: '缺少 jobType 或 jobData' };
    return;
  }
  if (!ALLOWED_JOB_TYPES.has(jobType)) {
    ctx.body = { code: 400, message: `不允许的 Job 类型: ${jobType}` };
    return;
  }
  // 阶段三：并发任务配额（任务进入终态时由 queue 归还）
  await quotaService.consume(tid, QUOTA_KEYS.MAX_CONCURRENT_JOBS, 1, {
    idempotencyKey: String(ctx.get('Idempotency-Key') ?? '').trim() || undefined,
    reason: 'job.create',
  });

  let job;
  try {
    job = await enqueue({ tenantId: tid, userId: ctx.state.user?.userId, jobType, jobData });
  } catch (error) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_CONCURRENT_JOBS, 1).catch(() => {});
    throw error;
  }
  ctx.body = { code: 200, data: { jobId: job.jobId, status: job.status } };
});

router.get('/:jobId', jwtAuth(), hasPerm('system:job:read'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const job = await getJob(tid, ctx.params.jobId);
  ctx.body = job ? { code: 200, data: job } : { code: 404, message: '任务不存在' };
});

router.get('/', jwtAuth(), hasPerm('system:job:read'), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const q = ctx.query as any;
  const jobs = await listJobs(tid, { status: q.status, limit: 50 });
  ctx.body = { code: 200, data: jobs };
});

export default router;
