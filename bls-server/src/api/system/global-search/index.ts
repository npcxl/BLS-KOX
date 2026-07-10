import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/global-search' });
const T = 'sys_global_search_config';

router.get('/search', jwtAuth(), hasPerm('system:global-search:search'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(T).selectAll().where('enabled','=',1).where('deleted','=',0).execute() };
});
router.get('/config/list', jwtAuth(), hasPerm('system:global-search:config:list'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(T).selectAll().where('deleted','=',0).execute() };
});
router.post('/config/save', jwtAuth(), hasPerm('system:global-search:config:save'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  if (b.searchId) await db.updateTable(T).set(b).where('search_id','=',b.searchId).execute();
  else await db.insertInto(T).values(b).execute();
  ctx.body = { code: 200, message: '保存成功' };
});
router.delete('/config/:id', jwtAuth(), hasPerm('system:global-search:config:delete'), async (ctx: Context) => {
  await (await getDb()).updateTable(T).set({deleted:1}).where('search_id','=',ctx.params.id).execute();
  ctx.body = { code: 200, message: '删除成功' };
});
router.post('/index/rebuild', jwtAuth(), hasPerm('system:search-index:rebuild'), async (ctx: Context) => {
  ctx.body = { code: 200, message: 'ok' };
});

export default router;
