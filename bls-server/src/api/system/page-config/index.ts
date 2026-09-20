import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { requireTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { success } from '../../../core/response';
import { NotFoundError, ValidationError } from '../../../core/errors';

const router = new Router({ prefix: '/system/page-config' });
const PT = 'sys_page_config', CT = 'sys_page_column_config';

// ====== 参数校验（Zod） ======

const pageSchema = z.object({
  pageCode: z.string().trim().min(1, 'pageCode 不能为空').max(100),
  pageName: z.string().trim().min(1, 'pageName 不能为空').max(100),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(100000).optional(),
  remark: z.string().max(500).nullish(),
});

const columnSchema = z.object({
  columnId: z.string().trim().min(1).max(32).optional(),
  dataIndex: z.string().trim().min(1, 'dataIndex 不能为空').max(100),
  title: z.string().trim().min(1, 'title 不能为空').max(100),
  orderNum: z.number().int().min(0).max(100000).optional(),
  visible: z.boolean().optional(),
  searchable: z.boolean().optional(),
  editable: z.boolean().optional(),
  copyable: z.boolean().optional(),
  ellipsis: z.boolean().optional(),
  required: z.boolean().optional(),
  valueType: z.string().max(50).nullish(),
  valueEnumCode: z.string().max(100).nullish(), 
  placeholder: z.string().max(200).nullish(),
});

const saveSchema = z.object({
  page: pageSchema,
  columns: z.array(columnSchema).max(300).default([]),
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

/** 列配置写入值（统一 snake_case） */
function columnValues(col: z.infer<typeof columnSchema>, pageCode: string, tenantId: string, order: number) {
  return {
    page_code: pageCode,
    data_index: col.dataIndex,
    title: col.title,
    order_num: col.orderNum ?? order,
    visible: col.visible !== false ? 1 : 0,
    searchable: col.searchable ? 1 : 0,
    editable: col.editable !== false ? 1 : 0,
    copyable: col.copyable ? 1 : 0,
    ellipsis: col.ellipsis ? 1 : 0,
    value_type: col.valueType ?? null,
    value_enum_code: col.valueEnumCode || null,
    placeholder: col.placeholder || null,
    required: col.required ? 1 : 0,
    tenant_id: tenantId,
    deleted: 0,
  };
}

// ====== 读接口（至少要求登录；全部限定当前租户） ======

router.get('/list', jwtAuth(), hasPerm('system:pageconfig:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const rows = await (await getDb()).selectFrom(PT).selectAll()
    .where('tenant_id', '=', tid).where('deleted', '=', 0)
    .orderBy('sort', 'asc').execute();
  success(ctx, rows, '查询成功');
});

router.get('/page/:pageCode', jwtAuth(), async (ctx: Context) => {
  const tid = requireTenantId();
  const row = await (await getDb()).selectFrom(PT).selectAll()
    .where('page_code', '=', ctx.params.pageCode)
    .where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  success(ctx, row ?? null, '查询成功');
});

router.get('/page/:pageCode/columns', jwtAuth(), async (ctx: Context) => {
  const tid = requireTenantId();
  const rows = await (await getDb()).selectFrom(CT).selectAll()
    .where('page_code', '=', ctx.params.pageCode)
    .where('tenant_id', '=', tid).where('deleted', '=', 0)
    .orderBy('order_num', 'asc').execute();
  success(ctx, rows, '查询成功');
});

// ====== 写接口（明确权限 + 事务 + 租户隔离） ======

router.post('/save', jwtAuth(), hasPerm('system:pageconfig:edit'), async (ctx: Context) => {
  const tid = requireTenantId();
  const { page, columns } = parseOrThrow(saveSchema, ctx.request.body ?? {});

  // 禁止重复 dataIndex
  const seen = new Set<string>();
  for (const col of columns) {
    const key = col.dataIndex.toLowerCase();
    if (seen.has(key)) throw new ValidationError(`列标识重复：${col.dataIndex}`);
    seen.add(key);
  }

  const db = (await getDb()) as any;
  await db.transaction().execute(async (trx: any) => {
    const exist = await trx.selectFrom(PT).select(['page_config_id'])
      .where('page_code', '=', page.pageCode)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .executeTakeFirst();

    const pageValues = {
      page_name: page.pageName,
      enabled: page.enabled !== false ? 1 : 0,
      sort: page.sort ?? 0,
      remark: page.remark ?? null,
    };

    if (exist) {
      await trx.updateTable(PT).set(pageValues)
        .where('page_code', '=', page.pageCode)
        .where('tenant_id', '=', tid)
        .where('deleted', '=', 0)
        .execute();
    } else {
      await trx.insertInto(PT).values({
        page_config_id: generateSnowflakeId(),
        page_code: page.pageCode,
        tenant_id: tid,
        deleted: 0,
        ...pageValues,
      }).execute();
    }

    // 先逻辑删除该页面当前租户的全部列，再按差量写回（同一事务）
    await trx.updateTable(CT).set({ deleted: 1 })
      .where('page_code', '=', page.pageCode)
      .where('tenant_id', '=', tid)
      .execute();

    let order = 0;
    for (const col of columns) {
      order += 1;
      const values = columnValues(col, page.pageCode, tid, order);
      const existing = col.columnId
        ? await trx.selectFrom(CT).select(['column_id'])
          .where('column_id', '=', col.columnId)
          .where('tenant_id', '=', tid)
          .executeTakeFirst()
        : null;

      if (col.columnId && existing) {
        // 复用本租户原有主键（避免重复插入），同时重置逻辑删除标记
        await trx.updateTable(CT).set(values)
          .where('column_id', '=', col.columnId)
          .where('tenant_id', '=', tid)
          .execute();
      } else {
        // 未提供主键，或提供的主键不属于当前租户 → 服务端重新生成，避免跨租户主键冲突/覆盖
        await trx.insertInto(CT).values({
          column_id: generateSnowflakeId(),
          ...values,
        }).execute();
      }
    }
  });

  success(ctx, null, '保存成功');
});

router.delete('/page/:pageCode', jwtAuth(), hasPerm('system:pageconfig:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const pageCode = ctx.params.pageCode;
  const db = (await getDb()) as any;

  const affected = await db.transaction().execute(async (trx: any) => {
    const exist = await trx.selectFrom(PT).select(['page_config_id'])
      .where('page_code', '=', pageCode)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .executeTakeFirst();
    if (!exist) throw new NotFoundError();

    await trx.updateTable(CT).set({ deleted: 1 })
      .where('page_code', '=', pageCode)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .execute();

    const result: any = await trx.updateTable(PT).set({ deleted: 1 })
      .where('page_code', '=', pageCode)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  });

  if (affected === 0) throw new NotFoundError();
  success(ctx, null, '删除成功');
});

export default router;
