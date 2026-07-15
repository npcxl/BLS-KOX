import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/tenant' });
const T = 'sys_tenant';

router.get('/list', jwtAuth(), hasPerm('system:tenant:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll();

  // 从动态列配置加载可搜索字段
  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code','=','system_tenant').where('searchable','=',1).where('deleted','=',0).execute();
  const searchFields = searchCols.map((c:any) => c.data_index.replace(/[A-Z]/g, (m:string) => '_'+m.toLowerCase()));

  if (q.keyword) {
    if (searchFields.length) {
      b = b.where((eb:any)=>eb.or(searchFields.map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    } else {
      b = b.where((eb:any)=>eb.or(['tenant_name','domain_name'].map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
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

router.get('/public-list', async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(T).selectAll().where('status','=','0').orderBy('create_time','asc').execute() };
});

router.post('/add', jwtAuth(), hasPerm('system:tenant:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({tenant_id:generateSnowflakeId(), tenant_name:b.tenantName, package_id:b.packageId??null, expire_time:b.expireTime??null, domain_name:b.domainName??null, contact_user:b.contactUser??null, contact_phone:b.contactPhone??null, status:'0', remark:b.remark??null, deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:tenant:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({tenant_name:b.tenantName, package_id:b.packageId, expire_time:b.expireTime, domain_name:b.domainName, contact_user:b.contactUser, contact_phone:b.contactPhone, status:b.status, remark:b.remark}).where('tenant_id','=',b.tenantId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.put('/status', jwtAuth(), hasPerm('system:tenant:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({status:b.status}).where('tenant_id','=',b.tenantId).execute();
  ctx.body = { code: 200, message: '状态修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:tenant:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.deleteFrom(T).where('tenant_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
