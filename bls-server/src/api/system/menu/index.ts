import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { buildMenuTree } from '../../../shared/utils/menu-tree';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { success } from '../../../core/response';
import { extractIds } from '../../../core/crud';

const router = new Router({ prefix: '/system/menu' });
const T = 'sys_menu', RM = 'sys_role_menu', PM = 'sys_package_menu';

// 注意：sys_menu 是全局表，没有 tenant_id / deleted 列。

const menuCreateSchema = z.object({
  parentId: z.string().trim().max(32).optional(),
  menuName: z.string().trim().min(1, 'menuName 不能为空').max(50),
  path: z.string().max(200).nullish(),
  component: z.string().max(200).nullish(),
  perms: z.string().max(100).nullish(),
  icon: z.string().max(100).nullish(),
  menuType: z.enum(['0', '1', '2']).optional(),
  sortNum: z.number().int().min(0).max(100000).optional(),
  status: z.enum(['0', '1']).optional(),
});

const menuUpdateSchema = menuCreateSchema.partial().extend({
  menuId: z.string().trim().min(1).max(32),
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

router.get('/list', jwtAuth(), hasPerm('system:menu:list'), async (ctx: Context) => {
  const q: any = ctx.query;
  let rows = await (await getDb()).selectFrom(T).selectAll().orderBy('sort_num', 'asc').execute();

  const keyword = (q.keyword || q.menuName || '').trim();
  if (keyword) {
    const matchedIds = new Set<string>();
    const map = new Map<string, { menuId: string; parentId: string }>();
    for (const r of rows) {
      const id = String(r.menu_id ?? r.menuId ?? '');
      const pid = String(r.parent_id ?? r.parentId ?? '0');
      map.set(id, { menuId: id, parentId: pid });
    }
    for (const r of rows) {
      const name = String(r.menu_name ?? r.menuName ?? '');
      if (name.includes(keyword)) {
        let current = String(r.menu_id ?? r.menuId ?? '');
        while (current && current !== '0') {
          matchedIds.add(current);
          current = map.get(current)?.parentId ?? '0';
        }
      }
    }
    rows = rows.filter((r: any) => matchedIds.has(String(r.menu_id ?? r.menuId ?? '')));
  }

  success(ctx, buildMenuTree(rows), '查询成功');
});

/** 套餐菜单树（需要 menu:list 权限） */
router.get('/package-tree', jwtAuth(), hasPerm('system:menu:list'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T).selectAll().where('status', '=', '0').orderBy('sort_num', 'asc').execute();
  success(ctx, buildMenuTree(rows), '查询成功');
});

router.post('/add', jwtAuth(), hasPerm('system:menu:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(menuCreateSchema, ctx.request.body ?? {});
  const menuId = generateSnowflakeId();

  // sys_menu 无 deleted 列，禁止写入 deleted / tenant_id
  await db.insertInto(T).values({
    menu_id: menuId,
    parent_id: b.parentId ?? '000000',
    menu_name: b.menuName,
    path: b.path ?? null,
    component: b.component ?? null,
    perms: b.perms ?? null,
    icon: b.icon ?? null,
    menu_type: b.menuType ?? '1',
    sort_num: b.sortNum ?? 0,
    status: b.status ?? '0',
  }).execute();

  success(ctx, { menuId }, '新增成功');
});

router.put('/edit', jwtAuth(), hasPerm('system:menu:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(menuUpdateSchema, ctx.request.body ?? {});

  const existing = await db.selectFrom(T).select('menu_id').where('menu_id', '=', b.menuId).executeTakeFirst();
  if (!existing) throw new NotFoundError();
  if (b.parentId !== undefined && b.parentId === b.menuId) throw new ValidationError('上级菜单不能是自己');

  const updateData: Record<string, any> = {};
  if (b.parentId !== undefined) updateData.parent_id = b.parentId;
  if (b.menuName !== undefined) updateData.menu_name = b.menuName;
  if (b.path !== undefined) updateData.path = b.path;
  if (b.component !== undefined) updateData.component = b.component;
  if (b.perms !== undefined) updateData.perms = b.perms;
  if (b.icon !== undefined) updateData.icon = b.icon;
  if (b.menuType !== undefined) updateData.menu_type = b.menuType;
  if (b.sortNum !== undefined) updateData.sort_num = b.sortNum;
  if (b.status !== undefined) updateData.status = b.status;
  if (Object.keys(updateData).length === 0) throw new ValidationError('没有可更新字段');

  const result: any = await db.updateTable(T).set(updateData).where('menu_id', '=', b.menuId).executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, null, '修改成功');
});

/** DELETE /remove — 递归删除菜单，并清理角色/套餐关联（同一事务） */
router.delete('/remove', jwtAuth(), hasPerm('system:menu:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('请选择要删除的菜单');

  const deleteCount = await db.transaction().execute(async (trx: any) => {
    const existing: any[] = await trx.selectFrom(T).select('menu_id').where('menu_id', 'in', ids).execute();
    if (existing.length !== ids.length) throw new NotFoundError();

    // 递归查找所有子菜单 ID
    const allIds = new Set<string>(ids);
    const queue = [...ids];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await trx.selectFrom(T)
        .select('menu_id')
        .where('parent_id', '=', parentId)
        .execute() as { menu_id: string }[];
      for (const child of children) {
        const childId = String(child.menu_id);
        if (!allIds.has(childId)) {
          allIds.add(childId);
          queue.push(childId);
        }
      }
    }

    const deleteIds = [...allIds];
    await trx.deleteFrom(RM).where('menu_id', 'in', deleteIds).execute();
    await trx.deleteFrom(PM).where('menu_id', 'in', deleteIds).execute();
    await trx.deleteFrom(T).where('menu_id', 'in', deleteIds).execute();
    return deleteIds.length;
  });

  success(ctx, { deleted: deleteCount }, `删除成功，共删除 ${deleteCount} 条菜单`);
});

export default router;
