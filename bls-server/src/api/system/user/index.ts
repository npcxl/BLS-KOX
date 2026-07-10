import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { pickAllowed, USER_PROFILE_FIELDS, USER_CREATE_FIELDS, USER_EDIT_FIELDS } from '../../../shared/utils/mass-assignment';

const router = new Router({ prefix: '/system/user' });
const T = 'sys_user';

router.get('/list', jwtAuth(), hasPerm('system:user:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll().where('deleted','=',0);
  const tid = getCurrentTenantId(); if (tid) b = b.where('tenant_id','=',tid);

  // 从动态列配置加载可搜索字段
  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code','=','system_user').where('searchable','=',1).where('deleted','=',0).execute();
  const searchFields = searchCols.map((c:any) => c.data_index.replace(/[A-Z]/g, (m:string) => '_'+m.toLowerCase()));

  if (q.keyword) {
    if (searchFields.length) {
      b = b.where((eb:any)=>eb.or(searchFields.map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    } else {
      b = b.where((eb:any)=>eb.or(['username','nickname','real_name','phone','email'].map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
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
  const total = Number(countRow?.total ?? 0);
  ctx.body = { code: 200, data: await b.orderBy('create_time','desc').limit(s).offset((p-1)*s).execute(), total };
});

router.get('/profile', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const db = (await getDb()) as any;
  const row = await db.selectFrom(T).selectAll().where('user_id','=',u.userId).where('deleted','=',0).executeTakeFirst();
  ctx.body = { code: 200, data: row };
});

router.put('/profile', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, USER_PROFILE_FIELDS);
  await (await getDb()).updateTable(T).set(data as any).where('user_id','=',u.userId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});

router.post('/add', jwtAuth(), hasPerm('system:user:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, USER_CREATE_FIELDS);
  await db.insertInto(T).values({...data, tenant_id: getCurrentTenantId()??'000000', deleted:0} as any);
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:user:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, USER_EDIT_FIELDS);
  await db.updateTable(T).set(data as any).where('user_id','=',(ctx.request.body as any).userId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:user:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.updateTable(T).set({deleted:1}).where('user_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
