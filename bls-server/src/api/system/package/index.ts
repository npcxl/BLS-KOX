import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/package' });
const T = 'sys_package', PM = 'sys_package_menu';

router.get('/list', jwtAuth(), hasPerm('system:package:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll();

  // 从动态列配置加载可搜索字段
  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code','=','system_package').where('searchable','=',1).where('deleted','=',0).execute();
  const searchFields = searchCols.map((c:any) => c.data_index.replace(/[A-Z]/g, (m:string) => '_'+m.toLowerCase()));

  if (q.keyword) {
    if (searchFields.length) {
      b = b.where((eb:any)=>eb.or(searchFields.map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    } else {
      b = b.where((eb:any)=>eb.or(['package_name'].map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
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
  ctx.body = { code: 200, data: await b.orderBy('create_time','desc').limit(s).offset((p-1)*s).execute(), total: Number(countRow?.total??0) };
});

router.get('/options', jwtAuth(), hasPerm('system:package:list'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(T).select(['package_id','package_name']).where('status','=','0').orderBy('create_time','asc').execute() };
});

router.post('/add', jwtAuth(), hasPerm('system:package:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({package_id:generateSnowflakeId(), package_name:b.packageName, package_code:b.packageCode, status:b.status??'0', remark:b.remark??null, deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:package:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({package_name:b.packageName, package_code:b.packageCode, status:b.status, remark:b.remark}).where('package_id','=',b.packageId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:package:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.deleteFrom(T).where('package_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

router.get('/:packageId/menus', jwtAuth(), hasPerm('system:package:list'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(PM).select('menu_id').where('package_id','=',ctx.params.packageId).execute();
  ctx.body = { code: 200, data: rows.map((r: any) => r.menu_id) };
});

router.put('/:packageId/menus', jwtAuth(), hasPerm('system:package:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const pid = ctx.params.packageId;
  const menuIds: string[] = (ctx.request.body as any)?.menuIds??[];
  await db.deleteFrom(PM).where('package_id','=',pid).execute();
  if (menuIds.length > 0) await db.insertInto(PM).values(menuIds.map(id=>({package_id:pid, menu_id:id}))).execute();
  ctx.body = { code: 200, message: '分配成功' };
});

export default router;
