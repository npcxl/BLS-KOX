import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { extractIds } from '../../../core/crud';

const router = new Router({ prefix: '/system/package' });
const T = 'sys_package', PM = 'sys_package_menu';

// 契约（sql/Init.sql + Java SysPackage + 前端 PackageRecord）：
// package_id / package_name / status / remark / create_time / update_time
// 注意：sys_package 没有 package_code，也没有 deleted 列。

const packageCreateSchema = z.object({
  packageName: z.string().trim().min(1, 'packageName 不能为空').max(100),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).nullish(),
});

const packageUpdateSchema = packageCreateSchema.partial().extend({
  packageId: z.string().trim().min(1).max(32),
});

const statusSchema = z.object({
  packageId: z.string().trim().min(1).max(32),
  status: z.enum(['0', '1']),
});

const menuAssignSchema = z.object({
  menuIds: z.array(z.string().trim().min(1).max(32)).max(1000).default([]),
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

/** GET /list */
router.get('/list', jwtAuth(), hasPerm('system:package:list'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const p = Math.max(1, Number(q.pageNum) || 1);
  const s = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  let b = db.selectFrom(T).selectAll();

  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code', '=', 'system_package').where('searchable', '=', 1).where('deleted', '=', 0).execute();
  const searchFields: string[] = searchCols.map((c: any) => c.data_index.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()));

  if (q.keyword) {
    const fields = searchFields.length ? searchFields : ['package_name'];
    b = b.where((eb: any) => eb.or(fields.map((f: string) => eb(f, 'like', `%${q.keyword}%`))));
  }
  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(field.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()), '=', String(q[field]));
    }
  }

  const countRow = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('create_time', 'desc').limit(s).offset((p - 1) * s).execute();
  pageSuccess(ctx, rows, Number(countRow?.total ?? 0));
});

/** GET /options — 下拉选项 */
router.get('/options', jwtAuth(), hasPerm('system:package:list'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T).select(['package_id', 'package_name'])
    .where('status', '=', '0').orderBy('create_time', 'asc').execute();
  success(ctx, rows, '查询成功');
});

/** POST /add */
router.post('/add', jwtAuth(), hasPerm('system:package:add'), async (ctx: Context) => {
  const b = parseOrThrow(packageCreateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;
  const packageId = generateSnowflakeId();

  await db.insertInto(T).values({
    package_id: packageId,
    package_name: b.packageName,
    status: b.status ?? '0',
    remark: b.remark ?? null,
  }).execute();

  success(ctx, { packageId }, '新增成功');
});

/** PUT /edit */
router.put('/edit', jwtAuth(), hasPerm('system:package:edit'), async (ctx: Context) => {
  const b = parseOrThrow(packageUpdateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const updateData: Record<string, any> = {};
  if (b.packageName !== undefined) updateData.package_name = b.packageName;
  if (b.status !== undefined) updateData.status = b.status;
  if (b.remark !== undefined) updateData.remark = b.remark;
  if (Object.keys(updateData).length === 0) throw new ValidationError('没有可更新字段');

  const result: any = await db.updateTable(T).set(updateData)
    .where('package_id', '=', b.packageId).executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, null, '修改成功');
});

/** PUT /status — 状态切换（system:package:status） */
router.put('/status', jwtAuth(), hasPerm('system:package:status'), async (ctx: Context) => {
  const b = parseOrThrow(statusSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;
  const result: any = await db.updateTable(T).set({ status: b.status })
    .where('package_id', '=', b.packageId).executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();
  success(ctx, null, '状态修改成功');
});

/**
 * DELETE /remove — 删除套餐（事务）
 *
 * 策略：被租户引用时拒绝删除（409），否则同一事务内清理 sys_package_menu 再删除套餐。
 */
router.delete('/remove', jwtAuth(), hasPerm('system:package:remove'), async (ctx: Context) => {
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  const db = (await getDb()) as any;

  await db.transaction().execute(async (trx: any) => {
    const existing: any[] = await trx.selectFrom(T).select('package_id')
      .where('package_id', 'in', ids).execute();
    if (existing.length !== ids.length) throw new NotFoundError();

    const used: any[] = await trx.selectFrom('sys_tenant').select('tenant_id')
      .where('package_id', 'in', ids).where('deleted', '=', 0).execute();
    if (used.length > 0) {
      throw new ConflictError(`套餐已被 ${used.length} 个租户引用，请先调整租户套餐`);
    }

    await trx.deleteFrom(PM).where('package_id', 'in', ids).execute();
    await trx.deleteFrom(T).where('package_id', 'in', ids).execute();
  });

  success(ctx, { deleted: ids.length }, '删除成功');
});

/** GET /:packageId/menus — 套餐已分配菜单 */
router.get('/:packageId/menus', jwtAuth(), hasPerm('system:package:list'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(PM).select('menu_id')
    .where('package_id', '=', ctx.params.packageId).execute();
  success(ctx, rows.map((r: any) => r.menu_id), '查询成功');
});

/** PUT /:packageId/menus — 分配菜单（事务 + 菜单有效性校验） */
router.put('/:packageId/menus', jwtAuth(), hasPerm('system:package:edit'), async (ctx: Context) => {
  const pid = ctx.params.packageId;
  const { menuIds } = parseOrThrow(menuAssignSchema, ctx.request.body ?? {});
  const uniqueMenuIds = [...new Set(menuIds)];
  const db = (await getDb()) as any;

  await db.transaction().execute(async (trx: any) => {
    const pkg = await trx.selectFrom(T).select('package_id').where('package_id', '=', pid).executeTakeFirst();
    if (!pkg) throw new NotFoundError();

    if (uniqueMenuIds.length > 0) {
      const menus: any[] = await trx.selectFrom('sys_menu').select('menu_id')
        .where('menu_id', 'in', uniqueMenuIds).execute();
      if (menus.length !== uniqueMenuIds.length) {
        throw new ValidationError('存在无效的菜单ID');
      }
    }

    await trx.deleteFrom(PM).where('package_id', '=', pid).execute();
    if (uniqueMenuIds.length > 0) {
      await trx.insertInto(PM).values(uniqueMenuIds.map((id) => ({ package_id: pid, menu_id: id }))).execute();
    }
  });

  success(ctx, null, '分配成功');
});

export default router;
