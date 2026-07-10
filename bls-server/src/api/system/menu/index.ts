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
  const rows = await (await getDb()).selectFrom(T).selectAll().orderBy('sort_num','asc').execute();
  ctx.body = { code: 200, data: buildMenuTree(rows) };
});
router.get('/package-tree', jwtAuth(), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T).selectAll().where('status','=','0').orderBy('sort_num','asc').execute();
  ctx.body = { code: 200, data: buildMenuTree(rows) };
});
router.post('/add', jwtAuth(), hasPerm('system:menu:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({menu_id:generateSnowflakeId(), parent_id:b.parentId??'000000', menu_name:b.menuName, path:b.path??null, component:b.component??null, perms:b.perms??null, icon:b.icon??null, menu_type:b.menuType??'1', sort_num:b.sortNum??0, status:'0'}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:menu:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({parent_id:b.parentId, menu_name:b.menuName, path:b.path, component:b.component, perms:b.perms, icon:b.icon, menu_type:b.menuType, sort_num:b.sortNum, status:b.status}).where('menu_id','=',b.menuId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:menu:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.deleteFrom(T).where('menu_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
