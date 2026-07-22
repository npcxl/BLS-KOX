import Router from 'koa-router';
import type { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { logger } from '../../../core/logger';

const router = new Router({ prefix: '/system/ai-usage' });

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

function getTenantId(ctx: Context): string {
  return getCurrentTenantId() ?? '000000';
}

function getUserId(ctx: Context): string {
  return (ctx.state as any).user?.userId ?? '';
}

/** POST /api/system/ai-usage/report — 内部调用：AI 服务上报用量 */
router.post('/report', async (ctx: Context) => {
  if (ctx.get('X-Internal-Secret') !== INTERNAL_SECRET || !INTERNAL_SECRET) {
    ctx.status = 403;
    ctx.body = { code: 403, message: 'Forbidden' };
    return;
  }

  const body = ctx.request.body as Record<string, any>;
  try {
    const db = (await getDb()) as any;
    const usageId = generateSnowflakeId();
    await db.insertInto('sys_ai_usage').values({
      usage_id: usageId,
      tenant_id: body.tenantId || '000000',
      user_id: body.userId || null,
      username: body.username || null,
      model_name: body.modelName || 'unknown',
      provider: body.provider || 'unknown',
      endpoint: body.endpoint || 'chat',
      prompt_tokens: body.promptTokens || 0,
      completion_tokens: body.completionTokens || 0,
      total_tokens: body.totalTokens || 0,
      estimated_cost: body.estimatedCost ?? 0,
      elapsed_ms: body.elapsedMs || 0,
      success: body.success !== false ? 1 : 0,
      error_msg: body.errorMsg || null,
      stream_mode: body.streamMode ? 1 : 0,
    }).execute();
    ctx.body = { code: 200, data: { usageId }, message: '操作成功' };
  } catch (err: any) {
    logger.error('[AI-Usage] report error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** GET /api/system/ai-usage/list — 用量明细分页 */
router.get('/list', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const pageNum = Math.max(1, Number(ctx.query.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 10));
  const offset = (pageNum - 1) * pageSize;
  const { modelName, endpoint, username, startDate, endDate } = ctx.query as Record<string, string>;
  try {
    const db = (await getDb()) as any;
    let query = db.selectFrom('sys_ai_usage').where('tenant_id', '=', tid);
    if (modelName) query = query.where('model_name', '=', modelName);
    if (endpoint) query = query.where('endpoint', '=', endpoint);
    if (username) query = query.where('username', 'like', `%${username}%`);
    if (startDate) query = query.where('created_at', '>=', startDate);
    if (endDate) query = query.where('created_at', '<=', endDate + ' 23:59:59');

    const [rows, countResult] = await Promise.all([
      query.selectAll().orderBy('created_at', 'desc').limit(pageSize).offset(offset).execute(),
      query.select(db.fn.count('usage_id').as('total')).executeTakeFirst(),
    ]);
    ctx.body = { code: 200, data: rows, total: Number(countResult?.total ?? 0), message: '操作成功' };
  } catch (err: any) {
    logger.error('[AI-Usage] list error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** GET /api/system/ai-usage/stats — 统计概览 */
router.get('/stats', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const { days } = ctx.query as Record<string, string>;
  const dayRange = Math.min(90, Math.max(1, Number(days) || 7));
  const startDate = new Date(Date.now() - dayRange * 86400000).toISOString().slice(0, 10);
  try {
    const db = (await getDb()) as any;

    // 今日概览
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = await db.selectFrom('sys_ai_usage')
      .select([
        db.fn.count('usage_id').as('count'),
        db.fn.sum('total_tokens').as('totalTokens'),
        db.fn.sum('estimated_cost').as('totalCost'),
        db.fn.avg('elapsed_ms').as('avgElapsedMs'),
      ])
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', today)
      .where('success', '=', 1)
      .executeTakeFirst();

    // 按天趋势
    const dailyTrend = await db.selectFrom('sys_ai_usage')
      .select([
        db.fn.date('created_at').as('date'),
        db.fn.count('usage_id').as('count'),
        db.fn.sum('total_tokens').as('totalTokens'),
        db.fn.sum('estimated_cost').as('totalCost'),
      ])
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', startDate)
      .groupBy(db.fn.date('created_at'))
      .orderBy('date', 'asc')
      .execute();

    // 按模型统计
    const modelStats = await db.selectFrom('sys_ai_usage')
      .select([
        'model_name',
        db.fn.count('usage_id').as('count'),
        db.fn.sum('total_tokens').as('totalTokens'),
        db.fn.sum('estimated_cost').as('totalCost'),
        db.fn.avg('elapsed_ms').as('avgElapsedMs'),
      ])
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', startDate)
      .where('success', '=', 1)
      .groupBy('model_name')
      .orderBy('totalTokens', 'desc')
      .execute();

    // 按端点统计
    const endpointStats = await db.selectFrom('sys_ai_usage')
      .select([
        'endpoint',
        db.fn.count('usage_id').as('count'),
        db.fn.sum('total_tokens').as('totalTokens'),
        db.fn.sum('estimated_cost').as('totalCost'),
      ])
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', startDate)
      .where('success', '=', 1)
      .groupBy('endpoint')
      .orderBy('totalTokens', 'desc')
      .execute();

    // 按用户统计 Top 10
    const userStats = await db.selectFrom('sys_ai_usage')
      .select([
        'username',
        'user_id',
        db.fn.count('usage_id').as('count'),
        db.fn.sum('total_tokens').as('totalTokens'),
        db.fn.sum('estimated_cost').as('totalCost'),
      ])
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', startDate)
      .where('success', '=', 1)
      .groupBy(['username', 'user_id'])
      .orderBy('totalTokens', 'desc')
      .limit(10)
      .execute();

    ctx.body = {
      code: 200,
      data: {
        today: todayStats ? {
          count: Number(todayStats.count ?? 0),
          totalTokens: Number(todayStats.totalTokens ?? 0),
          totalCost: Number(todayStats.totalCost ?? 0),
          avgElapsedMs: Math.round(Number(todayStats.avgElapsedMs ?? 0)),
        } : { count: 0, totalTokens: 0, totalCost: 0, avgElapsedMs: 0 },
        dailyTrend: (dailyTrend as any[]).map(d => ({
          date: d.date,
          count: Number(d.count ?? 0),
          totalTokens: Number(d.totalTokens ?? 0),
          totalCost: Number(d.totalCost ?? 0),
        })),
        modelStats: (modelStats as any[]).map(m => ({
          modelName: m.model_name,
          count: Number(m.count ?? 0),
          totalTokens: Number(m.totalTokens ?? 0),
          totalCost: Number(m.totalCost ?? 0),
          avgElapsedMs: Math.round(Number(m.avgElapsedMs ?? 0)),
        })),
        endpointStats: (endpointStats as any[]).map(e => ({
          endpoint: e.endpoint,
          count: Number(e.count ?? 0),
          totalTokens: Number(e.totalTokens ?? 0),
          totalCost: Number(e.totalCost ?? 0),
        })),
        userStats: (userStats as any[]).map(u => ({
          username: u.username || '未知',
          userId: u.user_id,
          count: Number(u.count ?? 0),
          totalTokens: Number(u.totalTokens ?? 0),
          totalCost: Number(u.totalCost ?? 0),
        })),
      },
      message: '操作成功',
    };
  } catch (err: any) {
    logger.error('[AI-Usage] stats error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

export default router;
