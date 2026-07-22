import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { logger } from '../../../core/logger';

const router = new Router({ prefix: '/system/ai-model' });

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

function checkInternal(ctx: Context): boolean {
  return ctx.get('X-Internal-Secret') === INTERNAL_SECRET;
}

function getTenantId(ctx: Context): string {
  return getCurrentTenantId() ?? '000000';
}

function getUserId(ctx: Context): string {
  return (ctx.state as any).user?.userId ?? '';
}

/** GET /api/system/ai-model/list (内部调用豁免 + JWT) */
router.get('/list', async (ctx: Context, next) => {
  // 内部调用直接放行
  if (ctx.get('X-Internal-Secret') === INTERNAL_SECRET && INTERNAL_SECRET) {
    return next();
  }
  // 外部调用走 JWT
  return jwtAuth()(ctx, next);
}, async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const pageNum = Math.max(1, Number(ctx.query.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 10));
  const offset = (pageNum - 1) * pageSize;
  try {
    const db = (await getDb()) as any;
    const base = db.selectFrom('ai_model_config').where('tenant_id', '=', tid).where('deleted', '=', 0);
    const rows = await base.selectAll().orderBy('sort_num', 'asc').orderBy('create_time', 'desc').limit(pageSize).offset(offset).execute();
    const allRows = await base.select('config_id').execute();
    const total = allRows.length;
    // 脱敏 api_key
    const safeRows = rows.map((r: any) => ({
      ...r,
      api_key: r.api_key ? r.api_key.slice(0, 4) + '****' + r.api_key.slice(-4) : null,
    }));
    ctx.body = { code: 200, data: safeRows, total, message: '操作成功' };
  } catch (err: any) {
    logger.error('[AI-Model] list error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** GET /api/system/ai-model/:id */
router.get('/:id', jwtAuth(), async (ctx: Context) => {
  try {
    const db = (await getDb()) as any;
    const row = await db.selectFrom('ai_model_config')
      .selectAll()
      .where('config_id', '=', ctx.params.id)
      .where('deleted', '=', 0)
      .executeTakeFirst();
    ctx.body = { code: 200, data: row ?? null, message: '操作成功' };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** POST /api/system/ai-model/add */
router.post('/add', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const uid = getUserId(ctx);
  const body = ctx.request.body as Record<string, any>;
  try {
    const db = (await getDb()) as any;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const configId = generateSnowflakeId();

    // 如果设为默认，先取消其他默认
    if (body.isDefault === '1') {
      await db.updateTable('ai_model_config')
        .set({ is_default: '0' })
        .where('tenant_id', '=', tid)
        .where('deleted', '=', 0)
        .execute();
    }

    await db.insertInto('ai_model_config').values({
      config_id: configId,
      tenant_id: tid,
      model_name: body.modelName ?? '',
      model_type: body.modelType ?? 'api',
      provider: body.provider ?? 'openai',
      model_id: body.modelId ?? '',
      api_key: body.apiKey ?? null,
      base_url: body.baseUrl ?? null,
      temperature: body.temperature ?? 0.3,
      max_tokens: body.maxTokens ?? 4096,
      timeout_ms: body.timeoutMs ?? 60000,
      is_default: body.isDefault ?? '0',
      status: body.status ?? '0',
      sort_num: body.sortNum ?? 0,
      remark: body.remark ?? null,
      create_by: uid,
      create_time: now,
      update_by: uid,
      update_time: now,
    }).execute();

    ctx.body = { code: 200, data: { configId }, message: '新增成功' };
  } catch (err: any) {
    logger.error('[AI-Model] add error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** PUT /api/system/ai-model/edit */
router.put('/edit', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const uid = getUserId(ctx);
  const body = ctx.request.body as Record<string, any>;
  if (!body.configId) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '缺少 configId' };
    return;
  }
  try {
    const db = (await getDb()) as any;

    if (body.isDefault === '1') {
      await db.updateTable('ai_model_config')
        .set({ is_default: '0' })
        .where('tenant_id', '=', tid)
        .where('deleted', '=', 0)
        .execute();
    }

    const updateData: Record<string, any> = {
      model_name: body.modelName,
      model_type: body.modelType,
      provider: body.provider,
      model_id: body.modelId,
      api_key: body.apiKey ?? null,
      base_url: body.baseUrl ?? null,
      temperature: body.temperature ?? 0.3,
      max_tokens: body.maxTokens ?? 4096,
      timeout_ms: body.timeoutMs ?? 60000,
      is_default: body.isDefault ?? '0',
      status: body.status ?? '0',
      sort_num: body.sortNum ?? 0,
      remark: body.remark ?? null,
      update_by: uid,
      update_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };

    await db.updateTable('ai_model_config')
      .set(updateData)
      .where('config_id', '=', body.configId)
      .where('tenant_id', '=', tid)
      .execute();

    ctx.body = { code: 200, message: '修改成功' };
  } catch (err: any) {
    logger.error('[AI-Model] edit error: %s', err.message);
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** DELETE /api/system/ai-model/remove */
router.delete('/remove', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const body = ctx.request.body as { ids?: string[] };
  if (!body.ids?.length) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '缺少 ids' };
    return;
  }
  try {
    const db = (await getDb()) as any;
    await db.updateTable('ai_model_config')
      .set({ deleted: 1 })
      .where('config_id', 'in', body.ids)
      .where('tenant_id', '=', tid)
      .execute();
    ctx.body = { code: 200, message: '删除成功' };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

/** PUT /api/system/ai-model/status */
router.put('/status', jwtAuth(), async (ctx: Context) => {
  const tid = getTenantId(ctx);
  const body = ctx.request.body as { configId?: string; status?: string };
  if (!body.configId) {
    ctx.status = 400;
    ctx.body = { code: 400, message: '缺少 configId' };
    return;
  }
  try {
    const db = (await getDb()) as any;
    await db.updateTable('ai_model_config')
      .set({ status: body.status ?? '0' })
      .where('config_id', '=', body.configId)
      .where('tenant_id', '=', tid)
      .execute();
    ctx.body = { code: 200, message: '状态更新成功' };
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = { code: 500, message: err.message };
  }
});

export default router;
