import Router from 'koa-router';
import type { Context } from 'koa';
import { jwtAuth } from '../../../../middleware/auth';
import { success, pageSuccess } from '../../../../core/response';
import { logger } from '../../../../core/logger';
import { releaseService } from './release.service';
import { releaseRepository } from './release.repository';
import { createReleaseSchema, releaseCallbackSchema } from './release.schema';
import { releasePermission } from './release-permission';
import { validateCallback } from './release-callback.service';

const router = new Router({ prefix: '/ops' });

// ========== 辅助函数 ==========

function getTenantId(ctx: Context): string {
  return (ctx.state.user as any)?.tenantId || '000000';
}

function getUserId(ctx: Context): string {
  return (ctx.state.user as any)?.userId || '';
}

function getUserName(ctx: Context): string | null {
  const u = ctx.state.user as any;
  return u?.username || u?.nickName || null;
}

/** 校验任务归属租户 */
async function ensureTaskOwnership(taskId: string, tenantId: string): Promise<{ task: any } | { error: string; status: number }> {
  const task = await releaseRepository.getTaskById(taskId);
  if (!task) return { error: '任务不存在', status: 404 };
  if (task.tenant_id !== tenantId) return { error: '无权限访问该任务', status: 403 };
  return { task };
}

// ========== 回调接口（内部签名验证，不走 JWT） ==========

router.post('/releases/callback', async (ctx: Context) => {
  const body = (ctx.request as any).body;
  const rawBody = JSON.stringify(body);

  const result = await validateCallback(ctx.headers as Record<string, string>, rawBody);
  if (!result.valid) {
    ctx.status = 403;
    ctx.body = { code: 403, message: result.error || '回调验证失败' };
    return;
  }

  const parsed = releaseCallbackSchema.safeParse(body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { code: 400, message: parsed.error.errors[0]?.message || '参数错误' };
    return;
  }

  try {
    const r = await releaseService.handleCallback(parsed.data);
    if (r.error) { ctx.status = 400; ctx.body = { code: 400, message: r.error }; return; }
    success(ctx, r);
  } catch (err: any) {
    logger.error('[OpsRelease] callback error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

router.post('/releases/build-callback', async (ctx: Context) => {
  const body = (ctx.request as any).body;
  const rawBody = JSON.stringify(body);

  const result = await validateCallback(ctx.headers as Record<string, string>, rawBody);
  if (!result.valid) {
    ctx.status = 403;
    ctx.body = { code: 403, message: result.error || '回调验证失败' };
    return;
  }

  try {
    const { version, status, commitHash, services } = body;
    if (!version || !status) {
      ctx.status = 400;
      ctx.body = { code: 400, message: '缺少 version/status' };
      return;
    }
    await releaseRepository.upsertVersionRecord(version, status, commitHash, services);
    success(ctx, { version, status });
  } catch (err: any) {
    logger.error('[OpsRelease] build-callback error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// ========== 需要 JWT 认证的接口 ==========
const authRouter = new Router();
authRouter.use(jwtAuth());

// GET /releases/versions
authRouter.get('/releases/versions', releasePermission('versions'), async (ctx: Context) => {
  try {
    const versions = await releaseService.getDeployableVersions();
    success(ctx, versions);
  } catch (err: any) {
    logger.error('[OpsRelease] versions error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/current
authRouter.get('/releases/current', releasePermission('current'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const env = (ctx.query.environment as string) || 'production';
    const task = await releaseRepository.findRunningTask(env, tenantId);
    success(ctx, task);
  } catch (err: any) {
    logger.error('[OpsRelease] current error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/services/status — 当前线上服务状态
authRouter.get('/releases/services/status', releasePermission('services'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const env = (ctx.query.environment as string) || 'production';
    const lastSuccess = await releaseRepository.getLastSuccessfulVersion(env, tenantId);
    const running = await releaseRepository.findRunningTask(env, tenantId);

    success(ctx, {
      currentVersion: lastSuccess,
      runningTask: running ? { taskId: running.task_id, status: running.status, progress: running.progress } : null,
      environment: env,
    });
  } catch (err: any) {
    logger.error('[OpsRelease] services/status error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases — 任务列表（租户隔离）
authRouter.get('/releases', releasePermission('list'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const pageNum = Math.max(1, Number(ctx.query.pageNum) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.pageSize) || 10));
    const { rows, total } = await releaseRepository.listTasks(tenantId, pageNum, pageSize);
    pageSuccess(ctx, rows, total);
  } catch (err: any) {
    logger.error('[OpsRelease] list error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/:taskId — 任务详情（租户隔离）
authRouter.get('/releases/:taskId', releasePermission('detail'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const ownership = await ensureTaskOwnership(ctx.params.taskId, tenantId);
    if ('error' in ownership) { ctx.status = ownership.status; ctx.body = { code: ownership.status, message: ownership.error }; return; }
    success(ctx, ownership.task);
  } catch (err: any) {
    logger.error('[OpsRelease] detail error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/:taskId/steps — 任务步骤（租户隔离）
authRouter.get('/releases/:taskId/steps', releasePermission('steps'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const ownership = await ensureTaskOwnership(ctx.params.taskId, tenantId);
    if ('error' in ownership) { ctx.status = ownership.status; ctx.body = { code: ownership.status, message: ownership.error }; return; }
    const steps = await releaseRepository.getSteps(ctx.params.taskId);
    success(ctx, steps);
  } catch (err: any) {
    logger.error('[OpsRelease] steps error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/:taskId/logs — 任务日志（租户隔离）
authRouter.get('/releases/:taskId/logs', releasePermission('logs'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const ownership = await ensureTaskOwnership(ctx.params.taskId, tenantId);
    if ('error' in ownership) { ctx.status = ownership.status; ctx.body = { code: ownership.status, message: ownership.error }; return; }
    const limit = Math.min(500, Math.max(1, Number(ctx.query.limit) || 100));
    const logs = await releaseRepository.getLogs(ctx.params.taskId, limit);
    success(ctx, logs);
  } catch (err: any) {
    logger.error('[OpsRelease] logs error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// POST /releases — 创建发布任务
authRouter.post('/releases', releasePermission('create'), async (ctx: Context) => {
  const body = (ctx.request as any).body;
  const parsed = createReleaseSchema.safeParse(body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { code: 400, message: parsed.error.errors[0]?.message || '参数错误' };
    return;
  }

  try {
    const result = await releaseService.createRelease(
      parsed.data, getTenantId(ctx), getUserId(ctx), getUserName(ctx),
    );
    if (result.error) { ctx.status = 409; ctx.body = { code: 409, message: result.error }; return; }
    success(ctx, result.task, '发布任务已创建');
  } catch (err: any) {
    logger.error('[OpsRelease] create error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// POST /releases/:taskId/rollback — 回滚（租户隔离）
authRouter.post('/releases/:taskId/rollback', releasePermission('rollback'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const ownership = await ensureTaskOwnership(ctx.params.taskId, tenantId);
    if ('error' in ownership) { ctx.status = ownership.status; ctx.body = { code: ownership.status, message: ownership.error }; return; }
    const result = await releaseService.rollback(ctx.params.taskId, tenantId);
    if (result.error) { ctx.status = 400; ctx.body = { code: 400, message: result.error }; return; }
    success(ctx, result, '回滚任务已触发');
  } catch (err: any) {
    logger.error('[OpsRelease] rollback error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

router.use(authRouter.routes());
router.use(authRouter.allowedMethods());

export default router;
