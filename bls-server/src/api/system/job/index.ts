/**
 * Job API — 异步任务提交与查询
 *
 * POST   /api/system/jobs        提交任务
 * GET    /api/system/jobs/:jobId 查询状态
 * GET    /api/system/jobs        任务列表
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { enqueue, getJob, listJobs } from '../../../queue/queue';
import { jwtAuth } from '../../../middleware/auth';
import { getCurrentTenantId } from '../../../middleware/tenant';

const router = new Router({ prefix: '/system/jobs' });

/** 提交异步任务 */
router.post('/', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const body = ctx.request.body as any;
  const { jobType, jobData } = body ?? {};
  if (!jobType || !jobData) {
    ctx.body = { code: 400, message: '缺少 jobType 或 jobData' };
    return;
  }
  const job = await enqueue({ tenantId: tid, userId: ctx.state.user?.userId, jobType, jobData });
  ctx.body = { code: 200, data: { jobId: job.jobId, status: job.status } };
});

/** 查询单个任务 */
router.get('/:jobId', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const job = await getJob(tid, ctx.params.jobId);
  ctx.body = job
    ? { code: 200, data: job }
    : { code: 404, message: '任务不存在' };
});

/** 任务列表 */
router.get('/', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId() ?? '000000';
  const q = ctx.query as any;
  const jobs = await listJobs(tid, { status: q.status, limit: 50 });
  ctx.body = { code: 200, data: jobs };
});

export default router;
