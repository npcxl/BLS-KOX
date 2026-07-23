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
  const tid = getCurrentTenantId();
  if (!tid) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '无法获取租户信息' };
    throw new Error('tenant_id missing');
  }
  return tid;
}

/** POST /report — 内部调用：AI 服务上报用量 */
router.post('/report', async (ctx: Context) => {
  if (ctx.get('X-Internal-Secret') !== INTERNAL_SECRET || !INTERNAL_SECRET) {
    ctx.status = 403;
    ctx.body = { code: 403, message: 'Forbidden' };
    return;
  }
  const b = ctx.request.body as Record<string, any>;
  try {
    const db = (await getDb()) as any;
    await db.insertInto('sys_ai_usage').values({
      usage_id: generateSnowflakeId(),
      tenant_id: b.tenantId,
      user_id: b.userId || null,
      username: b.username || null,
      model_name: b.modelName || 'unknown',
      provider: b.provider || 'unknown',
      endpoint: b.endpoint || 'chat',
      prompt_tokens: b.promptTokens || 0,
      completion_tokens: b.completionTokens || 0,
      total_tokens: b.totalTokens || 0,
      estimated_cost: b.estimatedCost ?? 0,
      elapsed_ms: b.elapsedMs || 0,
      success: b.success !== false ? 1 : 0,
      error_msg: b.errorMsg || null,
      stream_mode: b.streamMode ? 1 : 0,
    }).execute();
    ctx.body = { code: 200, data: {}, message: 'ok' };
  } catch (err: any) {
    logger.error('[AI-Usage] report error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** GET /list — 用量明细分页 */
router.get('/list', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const pageNum = Math.max(1, Number(ctx.query.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 10));
  const offset = (pageNum - 1) * pageSize;
  try {
    const db = (await getDb()) as any;
    const base = db.selectFrom('sys_ai_usage')
      .selectAll()
      .where('tenant_id', '=', tid)
      .orderBy('created_at', 'desc')
      .limit(pageSize).offset(offset);

    const countQ = db.selectFrom('sys_ai_usage')
      .select((eb: any) => eb.fn.countAll().as('total'))
      .where('tenant_id', '=', tid);

    const [rows, cr] = await Promise.all([base.execute(), countQ.executeTakeFirst()]);
    const data = rows.map((r: any) => ({
      ...r,
      estimatedCost: Number(r.estimated_cost ?? 0),
      promptTokens: Number(r.prompt_tokens ?? 0),
      completionTokens: Number(r.completion_tokens ?? 0),
      totalTokens: Number(r.total_tokens ?? 0),
      elapsedMs: Number(r.elapsed_ms ?? 0),
    }));
    ctx.body = { code: 200, data, total: Number((cr as any)?.total ?? 0), message: '操作成功' };
  } catch (err: any) {
    logger.error('[AI-Usage] list error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** GET /stats — 统计概览 */
router.get('/stats', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const days = Math.min(90, Math.max(1, Number(ctx.query.days) || 7));
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const db = (await getDb()) as any;

    // 今日概览
    const t = await db.selectFrom('sys_ai_usage')
      .select((eb: any) => eb.fn.countAll().as('cnt'))
      .select((eb: any) => eb.fn.sum('total_tokens').as('tk'))
      .select((eb: any) => eb.fn.sum('estimated_cost').as('cost'))
      .select((eb: any) => eb.fn.avg('elapsed_ms').as('avgMs'))
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', today)
      .where('success', '=', 1)
      .executeTakeFirst() as any;

    // 每日趋势（用 LEFT(created_at,10) 截取日期部分）
    const { pool } = require('../../../core/database');
    const daily = await pool.query(
      `SELECT LEFT(created_at,10) AS dt, COUNT(*) AS cnt, COALESCE(SUM(total_tokens),0) AS tk, COALESCE(SUM(estimated_cost),0) AS cost
       FROM sys_ai_usage WHERE tenant_id = ? AND created_at >= ? GROUP BY LEFT(created_at,10) ORDER BY dt ASC`,
      [tid, start],
    ).then(([rows]: any) => rows) as any[];

    // 按模型
    const models = await db.selectFrom('sys_ai_usage')
      .select('model_name')
      .select((eb: any) => eb.fn.countAll().as('cnt'))
      .select((eb: any) => eb.fn.sum('total_tokens').as('tk'))
      .select((eb: any) => eb.fn.sum('estimated_cost').as('cost'))
      .select((eb: any) => eb.fn.avg('elapsed_ms').as('avgMs'))
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', start)
      .where('success', '=', 1)
      .groupBy('model_name')
      .orderBy((eb: any) => eb.fn.sum('total_tokens'), 'desc')
      .execute() as any[];

    // 按端点
    const eps = await db.selectFrom('sys_ai_usage')
      .select('endpoint')
      .select((eb: any) => eb.fn.countAll().as('cnt'))
      .select((eb: any) => eb.fn.sum('total_tokens').as('tk'))
      .select((eb: any) => eb.fn.sum('estimated_cost').as('cost'))
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', start)
      .where('success', '=', 1)
      .groupBy('endpoint')
      .orderBy((eb: any) => eb.fn.sum('total_tokens'), 'desc')
      .execute() as any[];

    // 按用户 Top 10
    const users = await db.selectFrom('sys_ai_usage')
      .select('username')
      .select('user_id')
      .select((eb: any) => eb.fn.countAll().as('cnt'))
      .select((eb: any) => eb.fn.sum('total_tokens').as('tk'))
      .select((eb: any) => eb.fn.sum('estimated_cost').as('cost'))
      .where('tenant_id', '=', tid)
      .where('created_at', '>=', start)
      .where('success', '=', 1)
      .groupBy(['username', 'user_id'])
      .orderBy((eb: any) => eb.fn.sum('total_tokens'), 'desc')
      .limit(10)
      .execute() as any[];

    ctx.body = {
      code: 200,
      data: {
        today: {
          count: Number(t?.cnt ?? 0),
          totalTokens: Number(t?.tk ?? 0),
          totalCost: Number(t?.cost ?? 0),
          avgElapsedMs: Math.round(Number(t?.avgMs ?? 0)),
        },
        dailyTrend: daily.map(d => ({ date: d.dt, count: Number(d.cnt), totalTokens: Number(d.tk), totalCost: Number(d.cost) })),
        modelStats: models.map(m => ({ modelName: m.model_name, count: Number(m.cnt), totalTokens: Number(m.tk), totalCost: Number(m.cost), avgElapsedMs: Math.round(Number(m.avgMs ?? 0)) })),
        endpointStats: eps.map(e => ({ endpoint: e.endpoint, count: Number(e.cnt), totalTokens: Number(e.tk), totalCost: Number(e.cost) })),
        userStats: users.map(u => ({ username: u.username || '未知', userId: u.user_id, count: Number(u.cnt), totalTokens: Number(u.tk), totalCost: Number(u.cost) })),
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
