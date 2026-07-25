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

// ========== 回调接口（内部签名验证） ==========
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

// ========== 构建记录回调（GitHub Actions 构建完成后调用） ==========
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

// GET /releases/versions — 可发布版本（优先数据库构建记录）
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

// GET /releases/current — 当前任务
authRouter.get('/releases/current', releasePermission('current'), async (ctx: Context) => {
  try {
    const tenantId = (ctx.state.user as any)?.tenantId || '000000';
    const env = (ctx.query.environment as string) || 'production';
    const task = await releaseRepository.findRunningTask(env, tenantId);
    success(ctx, task);
  } catch (err: any) {
    logger.error('[OpsRelease] current error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases — 任务列表
authRouter.get('/releases', releasePermission('list'), async (ctx: Context) => {
  try {
    const tenantId = (ctx.state.user as any)?.tenantId || '000000';
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

// GET /releases/:taskId — 任务详情
authRouter.get('/releases/:taskId', releasePermission('detail'), async (ctx: Context) => {
  try {
    const task = await releaseRepository.getTaskById(ctx.params.taskId);
    if (!task) { ctx.status = 404; ctx.body = { code: 404, message: '任务不存在' }; return; }
    success(ctx, task);
  } catch (err: any) {
    logger.error('[OpsRelease] detail error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/:taskId/steps — 任务步骤
authRouter.get('/releases/:taskId/steps', releasePermission('steps'), async (ctx: Context) => {
  try {
    const steps = await releaseRepository.getSteps(ctx.params.taskId);
    success(ctx, steps);
  } catch (err: any) {
    logger.error('[OpsRelease] steps error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// GET /releases/:taskId/logs — 任务日志
authRouter.get('/releases/:taskId/logs', releasePermission('logs'), async (ctx: Context) => {
  try {
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
    const user = (ctx.state as any).user;
    const result = await releaseService.createRelease(
      parsed.data, user?.tenantId || '000000',
      user?.userId || '', user?.username || user?.nickName || null,
    );
    if (result.error) { ctx.status = 409; ctx.body = { code: 409, message: result.error }; return; }
    success(ctx, result.task, '发布任务已创建');
  } catch (err: any) {
    logger.error('[OpsRelease] create error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

// POST /releases/:taskId/rollback — 回滚
authRouter.post('/releases/:taskId/rollback', releasePermission('rollback'), async (ctx: Context) => {
  try {
    const tenantId = (ctx.state.user as any)?.tenantId || '000000';
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
