import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { buildMenuTree } from '../../../shared/utils/menu-tree';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/menu' });
const T = 'sys_menu';

router.get('/list', jwtAuth(), hasPerm('system:menu:list'), async (ctx: Context) => {
  const q: any = ctx.query;
  let rows = await (await getDb()).selectFrom(T).selectAll().orderBy('sort_num','asc').execute();

  // 关键字搜索：模糊匹配 menuName
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
          const node = map.get(current);
          current = node?.parentId ?? '0';
        }
      }
    }
    rows = rows.filter((r: any) => matchedIds.has(String(r.menu_id ?? r.menuId ?? '')));
  }

  ctx.body = { code: 200, data: buildMenuTree(rows) };
});
router.get('/package-tree', jwtAuth(), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T).selectAll().where('status','=','0').orderBy('sort_num','asc').execute();
  ctx.body = { code: 200, data: buildMenuTree(rows) };
});
router.post('/add', jwtAuth(), hasPerm('system:menu:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({menu_id:generateSnowflakeId(), parent_id:b.parentId??'000000', menu_name:b.menuName, path:b.path??null, component:b.component??null, perms:b.perms??null, icon:b.icon??null, menu_type:b.menuType??'1', sort_num:b.sortNum??0, status:'0', deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:menu:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({parent_id:b.parentId, menu_name:b.menuName, path:b.path, component:b.component, perms:b.perms, icon:b.icon, menu_type:b.menuType, sort_num:b.sortNum, status:b.status}).where('menu_id','=',b.menuId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:menu:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids: string[] = ((ctx.request.body as any)?.ids ?? []).map(String);
  if (!ids.length) { ctx.body = { code: 400, message: '请选择要删除的菜单' }; return; }

  // 递归查找所有子菜单 ID
  const allIds = new Set<string>(ids);
  const queue = [...ids];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = await db.selectFrom(T)
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
  // 删除角色-菜单关联
  await db.deleteFrom('sys_role_menu').where('menu_id', 'in', deleteIds).execute();
  // 删除菜单记录
  await db.deleteFrom(T).where('menu_id', 'in', deleteIds).execute();

  ctx.body = { code: 200, message: `删除成功，共删除 ${deleteIds.length} 条菜单` };
});

export default router;
