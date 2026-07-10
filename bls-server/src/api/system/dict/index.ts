import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/dict' });
const T = 'sys_dict_type', D = 'sys_dict_data';

// 类型 CRUD
router.get('/type/list', jwtAuth(), hasPerm('system:dict:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll().where('deleted','=',0);
  if (q.dictName) b = b.where('dict_name','like',`%${q.dictName}%`);
  if (q.dictType) b = b.where('dict_type','like',`%${q.dictType}%`);
  const cr = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('dict_type_id','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr?.total??0) };
});
router.post('/type/add', jwtAuth(), hasPerm('system:dict:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  const id = b.dictTypeId || generateSnowflakeId();
  await db.insertInto(T).values({dict_type_id:id, dict_name:b.dictName, dict_type:b.dictType, status:b.status??'0', remark:b.remark??null, tenant_id:getCurrentTenantId()??'000000', deleted:0}).execute();
  ctx.body = { code: 200, data: { dictTypeId: id }, message: '新增成功' };
});
router.put('/type/edit', jwtAuth(), hasPerm('system:dict:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({dict_name:b.dictName, dict_type:b.dictType, status:b.status, remark:b.remark}).where('dict_type_id','=',b.dictTypeId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/type/remove', jwtAuth(), hasPerm('system:dict:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.updateTable(T).set({deleted:1}).where('dict_type_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

// 数据 CRUD
router.get('/data/list', jwtAuth(), hasPerm('system:dict:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(D).selectAll().where('deleted','=',0);
  if (q.dictTypeId) b = b.where('dict_type_id','=',q.dictTypeId);
  if (q.dictLabel) b = b.where('dict_label','like',`%${q.dictLabel}%`);
  const cr = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('dict_sort','asc').limit(s).offset((p-1)*s).execute(), total: Number(cr?.total??0) };
});
router.get('/data/type', jwtAuth(), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const rows = await db.selectFrom(D).selectAll().where('deleted','=',0).where('status','=','0')
    .where('dict_type_id','in',(eb:any)=>eb.selectFrom(T).select('dict_type_id').where('dict_type','=',ctx.query.dictType))
    .orderBy('dict_sort','asc').execute();
  ctx.body = { code: 200, data: rows };
});
router.post('/data/add', jwtAuth(), hasPerm('system:dict:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(D).values({dict_data_id:generateSnowflakeId(), dict_type_id:b.dictTypeId, dict_label:b.dictLabel, dict_value:b.dictValue, dict_sort:b.dictSort??0, tag:b.tag??'', status:b.status??'0', remark:b.remark??null, tenant_id:getCurrentTenantId()??'000000', deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/data/edit', jwtAuth(), hasPerm('system:dict:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(D).set({dict_label:b.dictLabel, dict_value:b.dictValue, dict_sort:b.dictSort, tag:b.tag, status:b.status, remark:b.remark}).where('dict_data_id','=',b.dictDataId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/data/remove', jwtAuth(), hasPerm('system:dict:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.updateTable(D).set({deleted:1}).where('dict_data_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
