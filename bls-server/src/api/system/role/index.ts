import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/role' });
const T = 'sys_role', RM = 'sys_role_menu';

router.get('/list', jwtAuth(), hasPerm('system:role:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll().where('deleted','=',0);
  const tid = getCurrentTenantId(); if (tid) b = b.where('tenant_id','=',tid);
  if (q.keyword) b = b.where((eb:any)=>eb.or(['role_name','role_key'].map(f=>eb(f,'like',`%${q.keyword}%`))));
  if (q.status !== undefined && q.status !== '' && q.status !== null) b = b.where('status','=',String(q.status));
  const countRow = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('sort_num','asc').limit(s).offset((p-1)*s).execute(), total: Number(countRow?.total??0) };
});

router.get('/:roleId/menus', jwtAuth(), hasPerm('system:role:list'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(RM).select('menu_id').where('role_id','=',ctx.params.roleId).execute();
  ctx.body = { code: 200, data: rows.map((r: any) => r.menu_id) };
});

router.post('/add', jwtAuth(), hasPerm('system:role:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({role_id:generateSnowflakeId(), tenant_id:getCurrentTenantId()??'000000', role_name:b.roleName, role_key:b.roleKey, sort_num:b.sortNum??0, status:'0', remark:b.remark??null, deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:role:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({role_name:b.roleName, role_key:b.roleKey, sort_num:b.sortNum, status:b.status, remark:b.remark}).where('role_id','=',b.roleId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.put('/:roleId/menus', jwtAuth(), hasPerm('system:role:assignMenu'), async (ctx: Context) => {
  const db = (await getDb()) as any; const roleId = ctx.params.roleId; const menuIds: string[] = (ctx.request.body as any)?.menuIds??[];
  await db.deleteFrom(RM).where('role_id','=',roleId).execute();
  if (menuIds.length > 0) {
    await db.insertInto(RM).values(menuIds.map(id=>({role_id:roleId, menu_id:id}))).execute();
  }
  ctx.body = { code: 200, message: '分配成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:role:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.updateTable(T).set({deleted:1}).where('role_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
