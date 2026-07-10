import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { ForbiddenError } from '../../../core/errors';
import { getRequestContext } from '../../../core/request-context';
import { logSecurity } from '../../../core/security-audit';
import { SecurityEventType } from '../../../core/security-audit';
import { pickAllowed, USER_PROFILE_FIELDS, USER_CREATE_FIELDS, USER_EDIT_FIELDS } from '../../../shared/utils/mass-assignment';

function tenantId(): string {
  const ctx = getRequestContext();
  const tid = ctx?.tenantId;
  if (!tid) throw new ForbiddenError('未获取到租户上下文');
  return tid;
}

const router = new Router({ prefix: '/system/user' });
const T = 'sys_user';

router.get('/list', jwtAuth(), hasPerm('system:user:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom(T).selectAll().where('deleted','=',0);
  b = b.where('tenant_id','=',tenantId());

  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code','=','system_user').where('searchable','=',1).where('deleted','=',0).execute();
  const searchFields = searchCols.map((c:any)=>c.data_index.replace(/[A-Z]/g,(m:string)=>'_'+m.toLowerCase()));

  if (q.keyword) {
    if (searchFields.length) {
      b = b.where((eb:any)=>eb.or(searchFields.map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    } else {
      b = b.where((eb:any)=>eb.or(['username','nickname','real_name','phone','email'].map((f:string)=>eb(f,'like',`%${q.keyword}%`))));
    }
  }
  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(field.replace(/[A-Z]/g,(m:string)=>'_'+m.toLowerCase()),'=',String(q[field]));
    }
  }
  const cr = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('create_time','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr?.total??0) };
});

router.get('/profile', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const db = (await getDb()) as any;
  const row = await db.selectFrom(T).selectAll().where('user_id','=',u.userId).where('tenant_id','=',u.tenantId).where('deleted','=',0).executeTakeFirst();
  ctx.body = { code: 200, data: row };
});

router.put('/profile', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, USER_PROFILE_FIELDS);
  if (Object.keys(data).length === 0) { ctx.body = { code: 400, message: '没有可更新字段' }; return; }
  await (await getDb()).updateTable(T).set(data as any).where('user_id','=',u.userId).where('tenant_id','=',u.tenantId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});

router.post('/add', jwtAuth(), hasPerm('system:user:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, USER_CREATE_FIELDS);
  await db.insertInto(T).values({...data, tenant_id: tenantId(), deleted:0} as any).execute();
  ctx.body = { code: 200, message: '新增成功' };
});

router.put('/edit', jwtAuth(), hasPerm('system:user:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const body = (ctx.request.body ?? {}) as any;
  const data = pickAllowed(body, USER_EDIT_FIELDS);
  if (Object.keys(data).length === 0) { ctx.body = { code: 400, message: '没有可更新字段' }; return; }
  const tid = tenantId();
  await db.updateTable(T).set(data as any).where('user_id','=',body.userId).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '修改成功' };
});

router.delete('/remove', jwtAuth(), hasPerm('system:user:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any; const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  if (!ids.length) { ctx.body = { code: 400, message: '缺少用户ID' }; return; }
  const tid = tenantId();
  // 严格模式：先查当前租户可见ID，再按实际数量删除，防止跨租户
  const visible = await db.selectFrom(T).select('user_id').where('user_id','in',ids).where('tenant_id','=',tid).where('deleted','=',0).execute();
  const visibleIds = visible.map((r:any)=>r.user_id);
  if (visibleIds.length !== ids.length) {
    await logSecurity(ctx, SecurityEventType.CROSS_TENANT_ACCESS, `批量删除包含跨租户ID：请求${ids.length}个，可见${visibleIds.length}个`);
  }
  if (visibleIds.length > 0) {
    await db.updateTable(T).set({deleted:1}).where('user_id','in',visibleIds).where('tenant_id','=',tid).execute();
  }
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
