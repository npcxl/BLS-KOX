import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { requireTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors';
import { success } from '../../../core/response';
import { extractIds } from '../../../core/crud';

const router = new Router({ prefix: '/system/dept' });
const T = 'sys_dept';

const deptCreateSchema = z.object({
  deptName: z.string().trim().min(1, 'deptName 不能为空').max(50),
  parentId: z.string().trim().max(32).nullish(),
  sortNum: z.number().int().min(0).max(100000).optional(),
  status: z.enum(['0', '1']).optional(),
});

const deptUpdateSchema = deptCreateSchema.partial().extend({
  deptId: z.string().trim().min(1).max(32),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  return parsed.data;
}

/** 构建部门树（兼容 snake_case / camelCase），每个部门下插入所属用户 */
function buildTree(rows: any[]) {
  const get = (r: any, k: string, ck: string) => String(r[ck] ?? r[k] ?? "");
  const map = new Map<string, any>();
  const roots: any[] = [];
  for (const r of rows) map.set(get(r, 'dept_id', 'deptId'), { deptId: get(r, 'dept_id', 'deptId'), parentId: get(r, 'parent_id', 'parentId'), deptName: r.deptName ?? r.dept_name, sortNum: r.sortNum ?? r.sort_num, status: r.status, createTime: r.createTime ?? r.create_time, children: [] });
  map.forEach((node) => {
    if (node.parentId === "0" || !map.has(node.parentId) || node.deptId === node.parentId) roots.push(node);
    else map.get(node.parentId).children.push(node);
  });
  return roots;
}

/** 收集某个部门的所有子孙部门 ID（用于环校验） */
async function collectDescendantIds(db: any, tenantId: string, rootId: string): Promise<Set<string>> {
  const all = new Set<string>();
  let parents = [rootId];
  while (parents.length > 0) {
    const children: any[] = await db.selectFrom(T).select('dept_id')
      .where('parent_id', 'in', parents).where('tenant_id', '=', tenantId).where('deleted', '=', 0).execute();
    if (children.length === 0) break;
    parents = children.map((c) => String(c.dept_id)).filter((id) => !all.has(id));
    for (const id of parents) all.add(id);
  }
  return all;
}

router.get('/list', jwtAuth(), hasPerm('system:dept:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const q: any = ctx.query;
  let rows = await (await getDb()).selectFrom(T).selectAll()
    .where('deleted', '=', 0).where('tenant_id', '=', tid).orderBy('sort_num', 'asc').execute();

  const keyword = (q.keyword || q.deptName || '').trim();
  if (keyword) {
    const matchedIds = new Set<string>();
    const map = new Map<string, { deptId: string; parentId: string }>();
    for (const r of rows) {
      map.set(String(r.dept_id ?? r.deptId ?? ''), {
        deptId: String(r.dept_id ?? r.deptId ?? ''),
        parentId: String(r.parent_id ?? r.parentId ?? '0'),
      });
    }
    for (const r of rows) {
      const name = String(r.dept_name ?? r.deptName ?? '');
      if (name.includes(keyword)) {
        let current = String(r.dept_id ?? r.deptId ?? '');
        while (current && current !== '0') {
          matchedIds.add(current);
          current = map.get(current)?.parentId ?? '0';
        }
      }
    }
    rows = rows.filter((r: any) => matchedIds.has(String(r.dept_id ?? r.deptId ?? '')));
  }

  success(ctx, buildTree(rows), '查询成功');
});

/** 查询某部门下的用户列表（需要 dept:list 权限） */
router.get('/:deptId/users', jwtAuth(), hasPerm('system:dept:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const deptId = ctx.params.deptId;
  const db = await getDb();
  const users = await db.selectFrom('sys_user')
    .select(['user_id', 'username', 'nickname', 'status', 'email', 'phone'])
    .where('deleted', '=', 0)
    .where('tenant_id', '=', tid)
    .where('dept_id', '=', deptId)
    .orderBy('create_time', 'asc')
    .execute();
  success(ctx, users, '查询成功');
});

router.post('/add', jwtAuth(), hasPerm('system:dept:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(deptCreateSchema, ctx.request.body ?? {});
  const tid = requireTenantId();

  const parentId = b.parentId ?? '000000';
  if (parentId !== '000000') {
    const parent = await db.selectFrom(T).select('dept_id')
      .where('dept_id', '=', parentId).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
    if (!parent) throw new ValidationError('上级部门不存在');
  }

  const deptId = generateSnowflakeId();
  await db.insertInto(T).values({
    dept_id: deptId,
    tenant_id: tid,
    parent_id: parentId,
    dept_name: b.deptName,
    sort_num: b.sortNum ?? 0,
    status: b.status ?? '0',
    deleted: 0,
  }).execute();

  success(ctx, { deptId }, '新增成功');
});

router.put('/edit', jwtAuth(), hasPerm('system:dept:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(deptUpdateSchema, ctx.request.body ?? {});
  // 顶层部门的 parent_id 在库里可能是 NULL，前端原样回填就是 null → 统一成根哨兵 '000000'，
  // 否则下面的"不能是自己/不能是子部门"判断与 Set<string> 校验都会拿 null 去比较。
  if (b.parentId === null) b.parentId = '000000';
  const tid = requireTenantId();

  const existing = await db.selectFrom(T).select('dept_id')
    .where('dept_id', '=', b.deptId).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
  if (!existing) throw new NotFoundError();

  if (b.parentId !== undefined && b.parentId !== '000000') {
    if (b.parentId === b.deptId) throw new ValidationError('上级部门不能是自己');
    const parent = await db.selectFrom(T).select('dept_id')
      .where('dept_id', '=', b.parentId).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
    if (!parent) throw new ValidationError('上级部门不存在');
    const descendants = await collectDescendantIds(db, tid, b.deptId);
    if (descendants.has(b.parentId)) throw new ValidationError('上级部门不能是自己的子部门');
  }

  const updateData: Record<string, any> = {};
  if (b.parentId !== undefined) updateData.parent_id = b.parentId;
  if (b.deptName !== undefined) updateData.dept_name = b.deptName;
  if (b.sortNum !== undefined) updateData.sort_num = b.sortNum;
  if (b.status !== undefined) updateData.status = b.status;
  if (Object.keys(updateData).length === 0) throw new ValidationError('没有可更新字段');

  const result: any = await db.updateTable(T).set(updateData)
    .where('dept_id', '=', b.deptId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, null, '修改成功');
});

/**
 * DELETE /remove — 逻辑删除部门
 *
 * 策略（禁止产生孤儿数据）：
 *  - 存在未删除的子部门 → 409，提示先处理子部门
 *  - 存在未删除的所属用户 → 409，提示先转移用户
 */
router.delete('/remove', jwtAuth(), hasPerm('system:dept:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  const tid = requireTenantId();

  const affected = await db.transaction().execute(async (trx: any) => {
    const visible: any[] = await trx.selectFrom(T).select('dept_id')
      .where('dept_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
    if (visible.length !== ids.length) throw new NotFoundError();

    const children: any[] = await trx.selectFrom(T).select('dept_id')
      .where('parent_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
    const childIds = children.map((c: any) => String(c.dept_id)).filter((id: string) => !ids.includes(id));
    if (childIds.length > 0) {
      throw new ConflictError(`存在 ${childIds.length} 个子部门，请先删除或转移子部门`);
    }

    const users: any[] = await trx.selectFrom('sys_user').select('user_id')
      .where('dept_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
    if (users.length > 0) {
      throw new ConflictError(`该部门下仍有 ${users.length} 个用户，请先转移用户`);
    }

    const result: any = await trx.updateTable(T).set({ deleted: 1 })
      .where('dept_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  });

  if (affected === 0) throw new NotFoundError();
  success(ctx, { deleted: affected }, '删除成功');
});

export default router;
