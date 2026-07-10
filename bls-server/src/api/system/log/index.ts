import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/log' });

// 登录日志列表
router.get('/login', jwtAuth(), hasPerm('system:log:login:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom('sys_login_log').selectAll();
  if (q.username) b = b.where('username','like',`%${q.username}%`);
  if (q.loginType) b = b.where('login_type','=',q.loginType);
  if (q.loginStatus !== undefined && q.loginStatus !== '') b = b.where('login_status','=',q.loginStatus);
  const cr1 = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('log_id','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr1?.total??0) };
});

// 操作审计列表
router.get('/operation', jwtAuth(), hasPerm('system:log:audit:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom('sys_operation_log').selectAll();
  if (q.title) b = b.where('title','like',`%${q.title}%`);
  if (q.businessType) b = b.where('business_type','=',q.businessType);
  if (q.moduleName) b = b.where('module_name','like',`%${q.moduleName}%`);
  if (q.username) b = b.where('username','like',`%${q.username}%`);
  if (q.success !== undefined && q.success !== '') b = b.where('success','=',q.success);
  if (q.clientIp) b = b.where('client_ip','like',`%${q.clientIp}%`);
  const cr2 = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('log_id','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr2?.total??0) };
});

// 上传审计列表
router.get('/upload', jwtAuth(), hasPerm('system:log:audit:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom('sys_upload_audit').selectAll();
  if (q.username) b = b.where('username','like',`%${q.username}%`);
  if (q.moduleName) b = b.where('module_name','like',`%${q.moduleName}%`);
  if (q.originalName) b = b.where('original_name','like',`%${q.originalName}%`);
  if (q.accessType) b = b.where('access_type','=',q.accessType);
  if (q.uploadStatus !== undefined && q.uploadStatus !== '') b = b.where('upload_status','=',q.uploadStatus);
  if (q.clientIp) b = b.where('client_ip','like',`%${q.clientIp}%`);
  const cr3 = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('audit_id','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr3?.total??0) };
});

router.get('/audit/detail/:id', jwtAuth(), hasPerm('system:log:audit:detail'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_operation_log').selectAll().where('log_id','=',ctx.params.id).executeTakeFirst() };
});

router.delete('/audit/clean', jwtAuth(), hasPerm('system:log:audit:clean'), async (ctx: Context) => {
  await (await getDb()).deleteFrom('sys_operation_log').execute();
  ctx.body = { code: 200, message: '清理成功' };
});

export default router;
