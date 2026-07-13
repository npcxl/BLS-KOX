import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { assertTenantResource } from '../../../security/ownership';

const router = new Router({ prefix: '/system/role' });
const T = 'sys_role', RM = 'sys_role_menu';

router.get('/list', jwtAuth(), hasPerm('system:role:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll().where('deleted','=',0);
  const tid = getCurrentTenantId(); if (tid) b = b.where('tenant_id','=',tid);

  // 从动态列配置加载可搜索字段
  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code','=','system_role').where('searchable','=',1).where('deleted','=',0).execute();
  const searchFields = searchCols.map((c:any) => c.data_index.replace(/[A-Z]/g, (m:string) => '_'+m.toLowerCase()));

  if (q.keyword) {
    if (searchFields.length) {
      b = b.where((eb:any)=>eb.or(searchFields.map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    } else {
      b = b.where((eb:any)=>eb.or(['role_name','role_key'].map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    }
  }

  // 精确搜索：searchable=1 的字段自动支持 = 过滤
  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(field.replace(/[A-Z]/g, (m:string)=>'_'+m.toLowerCase()), '=', String(q[field]));
    }
  }

  const countRow = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('sort_num','asc').limit(s).offset((p-1)*s).execute(), total: Number(countRow?.total??0) };
});

router.get('/:roleId/menus', jwtAuth(), hasPerm('system:role:list'), async (ctx: Context) => {
  await assertTenantResource('sys_role', 'role_id', ctx.params.roleId);
  const rows = await (await getDb()).selectFrom(RM).select('menu_id').where('role_id','=',ctx.params.roleId).execute();
  ctx.body = { code: 200, data: rows.map((r: any) => r.menu_id) };
});

router.post('/add', jwtAuth(), hasPerm('system:role:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({
    role_id: generateSnowflakeId(), tenant_id: getCurrentTenantId() ?? '000000',
    role_name: b.roleName, role_key: b.roleKey,
    data_scope: b.dataScope ?? 'TENANT',
    sort_num: b.sortNum ?? 0, status: '0', remark: b.remark ?? null, deleted: 0,
  }).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:role:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await assertTenantResource('sys_role', 'role_id', b.roleId);
  const tid = getCurrentTenantId();
  await db.updateTable(T).set({
    role_name: b.roleName, role_key: b.roleKey,
    data_scope: b.dataScope ?? 'TENANT',
    sort_num: b.sortNum, status: b.status, remark: b.remark,
  }).where('role_id', '=', b.roleId).where('tenant_id', '=', tid).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.put('/:roleId/menus', jwtAuth(), hasPerm('system:role:assignMenu'), async (ctx: Context) => {
  const db = (await getDb()) as any; const roleId = ctx.params.roleId; const menuIds: string[] = (ctx.request.body as any)?.menuIds??[];
  await assertTenantResource('sys_role', 'role_id', roleId);
  await db.deleteFrom(RM).where('role_id','=',roleId).execute();
  if (menuIds.length > 0) {
    await db.insertInto(RM).values(menuIds.map(id=>({role_id:roleId, menu_id:id}))).execute();
  }
  ctx.body = { code: 200, message: '分配成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:role:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any; const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  const tid = getCurrentTenantId();
  await db.updateTable(T).set({deleted:1}).where('role_id','in',ids).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
