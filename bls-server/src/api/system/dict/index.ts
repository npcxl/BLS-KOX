import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { requireTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { extractIds } from '../../../core/crud';

const router = new Router({ prefix: '/system/dict' });
const T = 'sys_dict_type', D = 'sys_dict_data';

// ====== Zod 校验 ======

const typeCreateSchema = z.object({
  dictName: z.string().trim().min(1, 'dictName 不能为空').max(100),
  dictType: z.string().trim().min(1, 'dictType 不能为空').max(100),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).nullish(),
});

const typeUpdateSchema = typeCreateSchema.partial().extend({
  dictTypeId: z.string().trim().min(1).max(32),
});

const dataCreateSchema = z.object({
  dictTypeId: z.string().trim().min(1, 'dictTypeId 不能为空').max(32),
  dictLabel: z.string().trim().min(1, 'dictLabel 不能为空').max(100),
  dictValue: z.string().trim().min(1, 'dictValue 不能为空').max(100),
  dictSort: z.number().int().min(0).max(100000).optional(),
  tag: z.string().max(30).nullish(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).nullish(),
});

const dataUpdateSchema = dataCreateSchema.partial().extend({
  dictDataId: z.string().trim().min(1).max(32),
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

function pageArgs(ctx: Context): { page: number; size: number; offset: number } {
  const q: any = ctx.query;
  const page = Math.max(1, Number(q.pageNum) || 1);
  const size = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  return { page, size, offset: (page - 1) * size };
}

// ================= 字典类型 =================

router.get('/type/list', jwtAuth(), hasPerm('system:dict:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const { size, offset } = pageArgs(ctx);

  let b = db.selectFrom(T).selectAll().where('deleted', '=', 0).where('tenant_id', '=', tid);
  if (q.dictName) b = b.where('dict_name', 'like', `%${q.dictName}%`);
  if (q.dictType) b = b.where('dict_type', 'like', `%${q.dictType}%`);
  const cr = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('dict_type_id', 'desc').limit(size).offset(offset).execute();

  pageSuccess(ctx, rows, Number(cr?.total ?? 0));
});

router.post('/type/add', jwtAuth(), hasPerm('system:dict:add'), async (ctx: Context) => {
  const tid = requireTenantId();
  const b = parseOrThrow(typeCreateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;
  const id = generateSnowflakeId();

  // 租户内 dictType 唯一（uk_dict_type_tenant）
  const dup = await db.selectFrom(T).select('dict_type_id')
    .where('dict_type', '=', b.dictType).where('tenant_id', '=', tid)
    .executeTakeFirst();
  if (dup) throw new ConflictError(`字典类型已存在：${b.dictType}`);

  await db.insertInto(T).values({
    dict_type_id: id,
    dict_name: b.dictName,
    dict_type: b.dictType,
    status: b.status ?? '0',
    remark: b.remark ?? null,
    tenant_id: tid,
    deleted: 0,
  }).execute();

  success(ctx, { dictTypeId: id }, '新增成功');
});

router.put('/type/edit', jwtAuth(), hasPerm('system:dict:edit'), async (ctx: Context) => {
  const tid = requireTenantId();
  const b = parseOrThrow(typeUpdateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const existing = await db.selectFrom(T).select(['dict_type_id'])
    .where('dict_type_id', '=', b.dictTypeId)
    .where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (!existing) throw new NotFoundError();

  await db.updateTable(T).set({
    dict_name: b.dictName,
    dict_type: b.dictType,
    status: b.status,
    remark: b.remark,
  })
    .where('dict_type_id', '=', b.dictTypeId)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .execute();

  success(ctx, null, '修改成功');
});

router.delete('/type/remove', jwtAuth(), hasPerm('system:dict:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  const db = (await getDb()) as any;

  // 级联逻辑删除字典数据（同一事务）
  await db.transaction().execute(async (trx: any) => {
    const visible: any[] = await trx.selectFrom(T).select('dict_type_id')
      .where('dict_type_id', 'in', ids)
      .where('tenant_id', '=', tid).where('deleted', '=', 0)
      .execute();
    if (visible.length !== ids.length) throw new NotFoundError();

    await trx.updateTable(D).set({ deleted: 1 })
      .where('dict_type_id', 'in', ids)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .execute();

    await trx.updateTable(T).set({ deleted: 1 })
      .where('dict_type_id', 'in', ids)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .execute();
  });

  success(ctx, { deleted: ids.length }, '删除成功');
});

// ================= 字典数据 =================

router.get('/data/list', jwtAuth(), hasPerm('system:dict:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const { size, offset } = pageArgs(ctx);

  let b = db.selectFrom(D).selectAll().where('deleted', '=', 0).where('tenant_id', '=', tid);
  if (q.dictTypeId) b = b.where('dict_type_id', '=', q.dictTypeId);
  if (q.dictLabel) b = b.where('dict_label', 'like', `%${q.dictLabel}%`);
  const cr = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('dict_sort', 'asc').limit(size).offset(offset).execute();

  pageSuccess(ctx, rows, Number(cr?.total ?? 0));
});

/**
 * GET /data/type — 前端 useDict 使用（需登录）
 *
 * 租户来源安全：
 *  - 优先当前租户自己的字典类型
 *  - 当前租户没有同名 dict_type 时回退平台租户（000000）的内置字典
 *  - 绝不读取其他租户数据；只返回必要字段（label/value/tag/sort/status）
 */
router.get('/data/type', jwtAuth(), async (ctx: Context) => {
  const tid = requireTenantId();
  const dictType = String(ctx.query.dictType ?? '').trim();
  if (!dictType) throw new ValidationError('缺少 dictType');

  const db = (await getDb()) as any;
  const selectFields = ['dict_data_id', 'dict_type_id', 'dict_label', 'dict_value', 'dict_sort', 'tag', 'status'];

  const ownType = await db.selectFrom(T).select('dict_type_id')
    .where('dict_type', '=', dictType).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  const sourceType = ownType ?? await db.selectFrom(T).select('dict_type_id')
    .where('dict_type', '=', dictType).where('tenant_id', '=', PLATFORM_TENANT_ID).where('deleted', '=', 0)
    .executeTakeFirst();
  if (!sourceType) {
    success(ctx, [], '查询成功');
    return;
  }

  const rows = await db.selectFrom(D).select(selectFields)
    .where('dict_type_id', '=', sourceType.dict_type_id)
    .where('tenant_id', '=', ownType ? tid : PLATFORM_TENANT_ID)
    .where('deleted', '=', 0)
    .orderBy('dict_sort', 'asc')
    .execute();

  success(ctx, rows, '查询成功');
});

router.post('/data/add', jwtAuth(), hasPerm('system:dict:add'), async (ctx: Context) => {
  const tid = requireTenantId();
  const b = parseOrThrow(dataCreateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  // dictTypeId 必须属于当前租户
  const type = await db.selectFrom(T).select('dict_type_id')
    .where('dict_type_id', '=', b.dictTypeId)
    .where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (!type) throw new NotFoundError('字典类型不存在');

  const id = generateSnowflakeId();
  await db.insertInto(D).values({
    dict_data_id: id,
    dict_type_id: b.dictTypeId,
    dict_label: b.dictLabel,
    dict_value: b.dictValue,
    dict_sort: b.dictSort ?? 0,
    tag: b.tag ?? '',
    status: b.status ?? '0',
    remark: b.remark ?? null,
    tenant_id: tid,
    deleted: 0,
  }).execute();

  success(ctx, { dictDataId: id }, '新增成功');
});

router.put('/data/edit', jwtAuth(), hasPerm('system:dict:edit'), async (ctx: Context) => {
  const tid = requireTenantId();
  const b = parseOrThrow(dataUpdateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const existing = await db.selectFrom(D).select('dict_data_id')
    .where('dict_data_id', '=', b.dictDataId)
    .where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (!existing) throw new NotFoundError();

  await db.updateTable(D).set({
    dict_label: b.dictLabel,
    dict_value: b.dictValue,
    dict_sort: b.dictSort,
    tag: b.tag,
    status: b.status,
    remark: b.remark,
  })
    .where('dict_data_id', '=', b.dictDataId)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .execute();

  success(ctx, null, '修改成功');
});

router.delete('/data/remove', jwtAuth(), hasPerm('system:dict:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  const db = (await getDb()) as any;

  const visible: any[] = await db.selectFrom(D).select('dict_data_id')
    .where('dict_data_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .execute();
  if (visible.length !== ids.length) throw new NotFoundError();

  await db.updateTable(D).set({ deleted: 1 })
    .where('dict_data_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .execute();

  success(ctx, { deleted: ids.length }, '删除成功');
});

export default router;
