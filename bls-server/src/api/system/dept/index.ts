import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/dept' });
const T = 'sys_dept';

/** 构建部门树（兼容 snake_case / camelCase） */
function buildTree(rows: any[]) {
  const get = (r: any, k: string, ck: string) => String(r[ck] ?? r[k] ?? "");
  const map = new Map<string, any>();
  const roots: any[] = [];
  for (const r of rows) map.set(get(r,'dept_id','deptId'), { deptId: get(r,'dept_id','deptId'), parentId: get(r,'parent_id','parentId'), deptName: r.deptName??r.dept_name, sortNum: r.sortNum??r.sort_num, status: r.status, createTime: r.createTime??r.create_time, children: [] });
  map.forEach((node) => {
    if (node.parentId === "0" || !map.has(node.parentId) || node.deptId === node.parentId) roots.push(node);
    else map.get(node.parentId).children.push(node);
  });
  return roots;
}

router.get('/list', jwtAuth(), hasPerm('system:dept:list'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T).selectAll()
    .where('deleted','=',0).orderBy('sort_num','asc').execute();
  ctx.body = { code: 200, data: buildTree(rows) };
});
router.post('/add', jwtAuth(), hasPerm('system:dept:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({dept_id:generateSnowflakeId(), parent_id:b.parentId??'000000', dept_name:b.deptName, sort_num:b.sortNum??0, status:'0', tenant_id:getCurrentTenantId()??'000000', deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:dept:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable(T).set({parent_id:b.parentId, dept_name:b.deptName, sort_num:b.sortNum, status:b.status}).where('dept_id','=',b.deptId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:dept:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.updateTable(T).set({deleted:1}).where('dept_id','in',ids).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
