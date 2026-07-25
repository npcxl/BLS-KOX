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
import { VALID_TRANSITIONS } from './release.constants';

const router = new Router({ prefix: '/ops' });

function getTenantId(ctx: Context) { return (ctx.state.user as any)?.tenantId || '000000'; }
function getUserId(ctx: Context) { return (ctx.state.user as any)?.userId || ''; }
function getUserName(ctx: Context): string | null { const u = ctx.state.user as any; return u?.username || u?.nickName || null; }

// ========== 回调（内部签名） ==========

router.post('/releases/callback', async (ctx: Context) => {
  const body = (ctx.request as any).body;
  const result = await validateCallback(ctx.headers as Record<string, string>, JSON.stringify(body));
  if (!result.valid) { ctx.status = 403; ctx.body = { code: 403, message: result.error || '回调验证失败' }; return; }
  const parsed = releaseCallbackSchema.safeParse(body);
  if (!parsed.success) { ctx.status = 400; ctx.body = { code: 400, message: parsed.error.errors[0]?.message || '参数错误' }; return; }
  try {
    const r = await releaseService.handleCallback(parsed.data);
    if (r.error) { ctx.status = 400; ctx.body = { code: 400, message: r.error }; return; }
    success(ctx, r);
  } catch (err: any) { logger.error('[OpsRelease] callback error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

router.post('/releases/build-callback', async (ctx: Context) => {
  const body = (ctx.request as any).body;
  const result = await validateCallback(ctx.headers as Record<string, string>, JSON.stringify(body));
  if (!result.valid) { ctx.status = 403; ctx.body = { code: 403, message: result.error || '回调验证失败' }; return; }
  try {
    const { version, status, commitHash, services } = body;
    if (!version || !status) { ctx.status = 400; ctx.body = { code: 400, message: '缺少 version/status' }; return; }
    await releaseRepository.upsertVersionRecord(version, status, commitHash, services);
    success(ctx, { version, status });
  } catch (err: any) { logger.error('[OpsRelease] build-callback error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// ========== JWT 认证接口 ==========
const authRouter = new Router();
authRouter.use(jwtAuth());

// GET /releases/versions
authRouter.get('/releases/versions', releasePermission('versions'), async (ctx: Context) => {
  try { success(ctx, await releaseService.getDeployableVersions()); }
  catch (err: any) { logger.error('[OpsRelease] versions error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases/current — 当前线上成功版本
authRouter.get('/releases/current', releasePermission('current'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const env = (ctx.query.environment as string) || 'production';
    const last = await releaseRepository.getLastSuccessfulVersion(env, tenantId);
    success(ctx, {
      environment: env,
      version: last?.target_version || null,
      deployedAt: last?.finished_at || null,
      deployedBy: last?.triggered_by_name || null,
      previousVersion: last?.from_version || null,
      status: 'healthy',
    });
  } catch (err: any) { logger.error('[OpsRelease] current error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases/running — 运行中任务
authRouter.get('/releases/running', releasePermission('current'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const env = (ctx.query.environment as string) || 'production';
    const task = await releaseRepository.findRunningTask(env, tenantId);
    success(ctx, task);
  } catch (err: any) { logger.error('[OpsRelease] running error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases/services/status
authRouter.get('/releases/services/status', releasePermission('services'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const env = (ctx.query.environment as string) || 'production';
    const last = await releaseRepository.getLastSuccessfulVersion(env, tenantId);
    const running = await releaseRepository.findRunningTask(env, tenantId);
    success(ctx, {
      environment: env,
      currentVersion: last?.target_version || null,
      checkedAt: new Date().toISOString(),
      runningTask: running ? { taskId: running.task_id, status: running.status, progress: running.progress } : null,
    });
  } catch (err: any) { logger.error('[OpsRelease] services/status error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases — 列表
authRouter.get('/releases', releasePermission('list'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const pageNum = Math.max(1, Number(ctx.query.pageNum) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.pageSize) || 10));
    const { rows, total } = await releaseRepository.listTasks(tenantId, pageNum, pageSize);
    pageSuccess(ctx, rows, total);
  } catch (err: any) { logger.error('[OpsRelease] list error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases/:taskId — 详情（租户隔离）
authRouter.get('/releases/:taskId', releasePermission('detail'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const task = await releaseRepository.getTaskById(ctx.params.taskId, tenantId);
    if (!task) { ctx.status = 404; ctx.body = { code: 404, message: '任务不存在' }; return; }
    success(ctx, task);
  } catch (err: any) { logger.error('[OpsRelease] detail error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases/:taskId/steps — 步骤（先验证任务归属）
authRouter.get('/releases/:taskId/steps', releasePermission('steps'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const task = await releaseRepository.getTaskById(ctx.params.taskId, tenantId);
    if (!task) { ctx.status = 404; ctx.body = { code: 404, message: '任务不存在' }; return; }
    const steps = await releaseRepository.getSteps(ctx.params.taskId);
    success(ctx, steps);
  } catch (err: any) { logger.error('[OpsRelease] steps error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// GET /releases/:taskId/logs — 日志（先验证任务归属）
authRouter.get('/releases/:taskId/logs', releasePermission('logs'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const task = await releaseRepository.getTaskById(ctx.params.taskId, tenantId);
    if (!task) { ctx.status = 404; ctx.body = { code: 404, message: '任务不存在' }; return; }
    const limit = Math.min(500, Math.max(1, Number(ctx.query.limit) || 100));
    success(ctx, await releaseRepository.getLogs(ctx.params.taskId, limit));
  } catch (err: any) { logger.error('[OpsRelease] logs error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// POST /releases — 创建
authRouter.post('/releases', releasePermission('create'), async (ctx: Context) => {
  const parsed = createReleaseSchema.safeParse((ctx.request as any).body);
  if (!parsed.success) { ctx.status = 400; ctx.body = { code: 400, message: parsed.error.errors[0]?.message || '参数错误' }; return; }
  try {
    const result = await releaseService.createRelease(parsed.data, getTenantId(ctx), getUserId(ctx), getUserName(ctx));
    if (result.error) { ctx.status = 409; ctx.body = { code: 409, message: result.error }; return; }
    success(ctx, result.task, '发布任务已创建');
  } catch (err: any) { logger.error('[OpsRelease] create error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

// POST /releases/:taskId/rollback — 回滚（租户隔离）
authRouter.post('/releases/:taskId/rollback', releasePermission('rollback'), async (ctx: Context) => {
  try {
    const tenantId = getTenantId(ctx);
    const task = await releaseRepository.getTaskById(ctx.params.taskId, tenantId);
    if (!task) { ctx.status = 404; ctx.body = { code: 404, message: '任务不存在' }; return; }
    const result = await releaseService.rollback(ctx.params.taskId, tenantId);
    if (result.error) { ctx.status = 400; ctx.body = { code: 400, message: result.error }; return; }
    success(ctx, result, '回滚任务已触发');
  } catch (err: any) { logger.error('[OpsRelease] rollback error: %s', err.message); ctx.status = 500; ctx.body = { code: 500, message: err.message }; }
});

router.use(authRouter.routes());
router.use(authRouter.allowedMethods());
export default router;
