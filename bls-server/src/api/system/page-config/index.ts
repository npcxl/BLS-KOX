import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';

const router = new Router({ prefix: '/system/page-config' });
const PT = 'sys_page_config', CT = 'sys_page_column_config';

router.get('/list', async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(PT).selectAll().where('deleted','=',0).orderBy('sort','asc').execute() };
});
router.get('/page/:pageCode', async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(PT).selectAll().where('page_code','=',ctx.params.pageCode).where('deleted','=',0).executeTakeFirst() };
});
router.get('/page/:pageCode/columns', async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(CT).selectAll().where('page_code','=',ctx.params.pageCode).where('deleted','=',0).orderBy('order_num','asc').execute() };
});
router.post('/save', async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  const { page, columns } = b; const tid = getCurrentTenantId()??'000000';
  const exist = await db.selectFrom(PT).selectAll().where('page_code','=',page.pageCode).where('deleted','=',0).executeTakeFirst();
  if (exist) {
    await db.updateTable(PT).set({page_name:page.pageName, enabled:page.enabled!==false?1:0, sort:page.sort??0, remark:page.remark??null}).where('page_code','=',page.pageCode).execute();
  } else {
    await db.insertInto(PT).values({page_config_id:generateSnowflakeId(), page_code:page.pageCode, page_name:page.pageName, enabled:page.enabled!==false?1:0, sort:page.sort??0, tenant_id:tid, remark:page.remark??null, deleted:0}).execute();
  }
  await db.updateTable(CT).set({deleted:1}).where('page_code','=',page.pageCode).execute();
  for (const c of columns) {
    await db.insertInto(CT).values({column_id:c.columnId??generateSnowflakeId(), page_code:page.pageCode, data_index:c.dataIndex, title:c.title, order_num:c.orderNum, visible:c.visible!==false?1:0, searchable:c.searchable?1:0, editable:c.editable!==false?1:0, copyable:c.copyable?1:0, ellipsis:c.ellipsis?1:0, value_type:c.valueType??null, value_enum_code:c.valueEnumCode??null, placeholder:c.placeholder??null, required:c.required?1:0, tenant_id:tid, deleted:0}).execute();
  }
  ctx.body = { code: 200, message: '保存成功' };
});
router.delete('/page/:pageCode', async (ctx: Context) => {
  const db = (await getDb()) as any;
  await db.updateTable(PT).set({deleted:1}).where('page_code','=',ctx.params.pageCode).execute();
  await db.updateTable(CT).set({deleted:1}).where('page_code','=',ctx.params.pageCode).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
