import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { requireTenantId } from '../../../middleware/tenant';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { ValidationError, NotFoundError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { extractIds } from '../../../core/crud';
import { logger } from '../../../core/logger';

const router = new Router({ prefix: '/system/ai-model' });
const T = 'ai_model_config';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/** 对外统一脱敏 api_key */
function maskKey(key: unknown): string | null {
  if (!key) return null;
  const value = String(key);
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

/** 判断是否为脱敏占位值（编辑时不应写回数据库） */
function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('****');
}

function maskRow(row: Record<string, any>): Record<string, any> {
  return { ...row, api_key: maskKey(row.api_key) };
}

function getUserId(ctx: Context): string {
  return (ctx.state as any).user?.userId ?? '';
}

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ====== Zod 校验 ======

const createSchema = z.object({
  modelName: z.string().trim().min(1, 'modelName 不能为空').max(100),
  modelType: z.enum(['api', 'local']).default('api'),
  provider: z.string().trim().min(1, 'provider 不能为空').max(50),
  modelId: z.string().trim().min(1, 'modelId 不能为空').max(100),
  apiKey: z.string().max(500).nullish(),
  baseUrl: z.string().max(500).nullish(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(2_000_000).optional(),
  timeoutMs: z.number().int().min(1000).max(600_000).optional(),
  isDefault: z.enum(['0', '1']).optional(),
  status: z.enum(['0', '1']).optional(),
  sortNum: z.number().int().min(0).max(100000).optional(),
  remark: z.string().max(500).nullish(),
});

const updateSchema = createSchema.partial().extend({
  configId: z.string().trim().min(1).max(32),
});

const statusSchema = z.object({
  configId: z.string().trim().min(1).max(32),
  status: z.enum(['0', '1']),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  return parsed.data;
}

/**
 * GET /internal-list — 内部服务专用（bls-ai-service）
 *
 * 访问模型（受控）：
 *  - 必须配置 INTERNAL_SECRET，且请求头完全匹配，否则 403
 *  - 可用 tenantId（query 或 X-Tenant-Id 头）限定租户，避免无边界跨租户暴露
 *  - 只返回 AI 服务调用必需字段（含 apiKey，内部调用需要），不返回 remark/create_by 等
 */
router.get('/internal-list', async (ctx: Context) => {
  if (!INTERNAL_SECRET || ctx.get('X-Internal-Secret') !== INTERNAL_SECRET) {
    ctx.status = 403;
    ctx.body = { code: 403, message: 'Forbidden' };
    return;
  }
  const tenantId = String(ctx.query.tenantId ?? ctx.get('X-Tenant-Id') ?? '').trim();

  const db = (await getDb()) as any;
  let q = db.selectFrom(T)
    .select([
      'config_id', 'tenant_id', 'model_name', 'model_type', 'provider', 'model_id',
      'api_key', 'base_url', 'temperature', 'max_tokens', 'timeout_ms',
      'is_default', 'status', 'sort_num',
    ])
    .where('deleted', '=', 0);
  if (tenantId) q = q.where('tenant_id', '=', tenantId);

  const rows = await q.orderBy('sort_num', 'asc').execute();
  ctx.body = { code: 200, data: rows, total: rows.length, message: '操作成功' };
});

/** GET /list — 分页列表（api_key 脱敏） */
router.get('/list', jwtAuth(), hasPerm('system:ai-model:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const pageNum = Math.max(1, Number(ctx.query.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 10));
  const offset = (pageNum - 1) * pageSize;

  const db = (await getDb()) as any;
  const base = db.selectFrom(T).where('tenant_id', '=', tid).where('deleted', '=', 0);
  const rows = await base.selectAll().orderBy('sort_num', 'asc').orderBy('create_time', 'desc')
    .limit(pageSize).offset(offset).execute();
  const countRow = await base.clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();

  pageSuccess(ctx, rows.map(maskRow), Number(countRow?.total ?? 0));
});

/** GET /:id — 详情（租户 + 软删除隔离，api_key 脱敏） */
router.get('/:id', jwtAuth(), hasPerm('system:ai-model:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const row = await (await getDb()).selectFrom(T).selectAll()
    .where('config_id', '=', ctx.params.id)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .executeTakeFirst();
  if (!row) throw new NotFoundError();
  success(ctx, maskRow(row as any), '查询成功');
});

/** POST /add — 新增（设为默认时使用事务保证同租户唯一默认） */
router.post('/add', jwtAuth(), hasPerm('system:ai-model:add'), async (ctx: Context) => {
  const tid = requireTenantId();
  const uid = getUserId(ctx);
  const body = parseOrThrow(createSchema, ctx.request.body ?? {});
  const configId = generateSnowflakeId();
  const db = (await getDb()) as any;

  const values = {
    config_id: configId,
    tenant_id: tid,
    model_name: body.modelName,
    model_type: body.modelType,
    provider: body.provider,
    model_id: body.modelId,
    api_key: body.apiKey ?? null,
    base_url: body.baseUrl ?? null,
    temperature: body.temperature ?? 0.3,
    max_tokens: body.maxTokens ?? 4096,
    timeout_ms: body.timeoutMs ?? 60000,
    is_default: body.isDefault === '1' ? '1' : '0',
    status: body.status ?? '0',
    sort_num: body.sortNum ?? 0,
    remark: body.remark ?? null,
    deleted: 0,
    create_by: uid,
    create_time: now(),
    update_by: uid,
    update_time: now(),
  };

  await db.transaction().execute(async (trx: any) => {
    if (values.is_default === '1') {
      await trx.updateTable(T).set({ is_default: '0' })
        .where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
    }
    await trx.insertInto(T).values(values).execute();
  });

  success(ctx, { configId }, '新增成功');
});

/** PUT /edit — 编辑（未传/传入脱敏 apiKey 时保留原密钥） */
router.put('/edit', jwtAuth(), hasPerm('system:ai-model:edit'), async (ctx: Context) => {
  const tid = requireTenantId();
  const uid = getUserId(ctx);
  const body = parseOrThrow(updateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const existing = await db.selectFrom(T).select(['config_id', 'api_key'])
    .where('config_id', '=', body.configId)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .executeTakeFirst();
  if (!existing) throw new NotFoundError();

  const updateData: Record<string, any> = {
    update_by: uid,
    update_time: now(),
  };
  if (body.modelName !== undefined) updateData.model_name = body.modelName;
  if (body.modelType !== undefined) updateData.model_type = body.modelType;
  if (body.provider !== undefined) updateData.provider = body.provider;
  if (body.modelId !== undefined) updateData.model_id = body.modelId;
  if (body.baseUrl !== undefined) updateData.base_url = body.baseUrl;
  if (body.temperature !== undefined) updateData.temperature = body.temperature;
  if (body.maxTokens !== undefined) updateData.max_tokens = body.maxTokens;
  if (body.timeoutMs !== undefined) updateData.timeout_ms = body.timeoutMs;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.sortNum !== undefined) updateData.sort_num = body.sortNum;
  if (body.remark !== undefined) updateData.remark = body.remark;
  if (body.isDefault !== undefined) updateData.is_default = body.isDefault === '1' ? '1' : '0';

  // 密钥：未传 / 空 / 脱敏占位值 → 保留原值，绝不把脱敏字符串写回库
  const incomingKey = body.apiKey;
  const keepExistingKey = incomingKey === undefined || incomingKey === null
    || incomingKey === '' || isMaskedValue(incomingKey);
  if (!keepExistingKey) updateData.api_key = incomingKey;

  const affected = await db.transaction().execute(async (trx: any) => {
    if (updateData.is_default === '1') {
      await trx.updateTable(T).set({ is_default: '0' })
        .where('tenant_id', '=', tid).where('deleted', '=', 0)
        .where('config_id', '!=', body.configId)
        .execute();
    }
    const result: any = await trx.updateTable(T).set(updateData)
      .where('config_id', '=', body.configId)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  });

  if (affected === 0) throw new NotFoundError();
  success(ctx, null, '修改成功');
});

/** DELETE /remove — 批量逻辑删除 */
router.delete('/remove', jwtAuth(), hasPerm('system:ai-model:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');

  const db = (await getDb()) as any;
  const visible: any[] = await db.selectFrom(T).select('config_id')
    .where('config_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
  if (visible.length !== ids.length) throw new NotFoundError();

  await db.updateTable(T).set({ deleted: 1, update_time: now() })
    .where('config_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .execute();
  success(ctx, { deleted: ids.length }, '删除成功');
});

/** PUT /status — 状态切换 */
router.put('/status', jwtAuth(), hasPerm('system:ai-model:status'), async (ctx: Context) => {
  const tid = requireTenantId();
  const body = parseOrThrow(statusSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const result: any = await db.updateTable(T)
    .set({ status: body.status, update_time: now() })
    .where('config_id', '=', body.configId)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();
  success(ctx, null, '状态修改成功');
});

logger.debug('[AI-Model] module loaded');

export default router;
