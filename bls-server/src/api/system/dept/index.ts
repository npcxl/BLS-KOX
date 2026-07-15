import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { assertTenantResource } from '../../../security/ownership';

const router = new Router({ prefix: '/system/dept' });
const T = 'sys_dept';

/** 构建部门树（兼容 snake_case / camelCase），每个部门下插入所属用户 */
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
  const tid = getCurrentTenantId();
  const q: any = ctx.query;
  let rows = await (await getDb()).selectFrom(T).selectAll()
    .where('deleted','=',0).where('tenant_id','=',tid).orderBy('sort_num','asc').execute();

  // 关键字搜索：模糊匹配 deptName
  const keyword = (q.keyword || q.deptName || '').trim();
  if (keyword) {
    const matchedIds = new Set<string>();
    const map = new Map<string, { deptId: string; parentId: string }>();
    for (const r of rows) {
      const id = String(r.dept_id ?? r.deptId ?? '');
      const pid = String(r.parent_id ?? r.parentId ?? '0');
      map.set(id, { deptId: id, parentId: pid });
    }
    // 找到匹配的节点及其所有祖先（保持树结构）
    for (const r of rows) {
      const name = String(r.dept_name ?? r.deptName ?? '');
      if (name.includes(keyword)) {
        let current = String(r.dept_id ?? r.deptId ?? '');
        while (current && current !== '0') {
          matchedIds.add(current);
          const node = map.get(current);
          current = node?.parentId ?? '0';
        }
      }
    }
    rows = rows.filter((r: any) => matchedIds.has(String(r.dept_id ?? r.deptId ?? '')));
  }

  ctx.body = { code: 200, data: buildTree(rows) };
});

/** 查询某部门下的用户列表 */
router.get('/:deptId/users', jwtAuth(), async (ctx: Context) => {
  const tid = getCurrentTenantId();
  const deptId = ctx.params.deptId;
  const db = await getDb();
  const users = await db.selectFrom('sys_user')
    .select(['user_id', 'username', 'nickname', 'status', 'email', 'phone'])
    .where('deleted', '=', 0)
    .where('tenant_id', '=', tid)
    .where('dept_id', '=', deptId)
    .orderBy('create_time', 'asc')
    .execute();
  ctx.body = { code: 200, data: users };
});
router.post('/add', jwtAuth(), hasPerm('system:dept:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto(T).values({dept_id:generateSnowflakeId(), parent_id:b.parentId??'000000', dept_name:b.deptName, sort_num:b.sortNum??0, status:'0', tenant_id:getCurrentTenantId()??'000000', deleted:0}).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:dept:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await assertTenantResource('sys_dept', 'dept_id', b.deptId);
  const tid = getCurrentTenantId();
  await db.updateTable(T).set({parent_id:b.parentId, dept_name:b.deptName, sort_num:b.sortNum, status:b.status}).where('dept_id','=',b.deptId).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:dept:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any; const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  const tid = getCurrentTenantId();
  await db.updateTable(T).set({deleted:1}).where('dept_id','in',ids).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

export default router;
