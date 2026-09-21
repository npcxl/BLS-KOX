import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { requireTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { assertTenantResource } from '../../../security/ownership';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { extractIds } from '../../../core/crud';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';

const router = new Router({ prefix: '/system/role' });
const T = 'sys_role', RM = 'sys_role_menu', UR = 'sys_user_role', MENU = 'sys_menu';

const DATA_SCOPES = ['ALL', 'TENANT', 'DEPT', 'DEPT_AND_CHILDREN', 'SELF', 'CUSTOM'] as const;

const roleCreateSchema = z.object({
  roleName: z.string().trim().min(1, 'roleName 不能为空').max(50),
  roleKey: z.string().trim().min(2, 'roleKey 至少 2 位').max(50).regex(/^[A-Za-z0-9_:.-]+$/, 'roleKey 只能包含字母、数字、_ : . -'),
  dataScope: z.enum(DATA_SCOPES).optional(),
  sortNum: z.number().int().min(0).max(100000).optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).nullish(),
});

const roleUpdateSchema = roleCreateSchema.partial().extend({
  roleId: z.string().trim().min(1).max(32),
});

const statusSchema = z.object({
  roleId: z.string().trim().min(1).max(32),
  status: z.enum(['0', '1']),
});

const menuAssignSchema = z.object({
  menuIds: z.array(z.string().trim().min(1).max(32)).max(2000).default([]),
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

router.get('/list', jwtAuth(), hasPerm('system:role:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum || 1); const s = Math.min(100, Math.max(1, +q.pageSize || 10));
  const tid = requireTenantId();
  let b = db.selectFrom(T).selectAll().where('deleted', '=', 0).where('tenant_id', '=', tid);

  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code', '=', 'system_role').where('searchable', '=', 1).where('deleted', '=', 0).execute();
  const searchFields: string[] = searchCols.map((c: any) => c.data_index.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()));

  if (q.keyword) {
    const fields = searchFields.length ? searchFields : ['role_name', 'role_key'];
    b = b.where((eb: any) => eb.or(fields.map((f: string) => eb(f, 'like', `%${q.keyword}%`))));
  }
  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(field.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()), '=', String(q[field]));
    }
  }
  const countRow = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('sort_num', 'asc').limit(s).offset((p - 1) * s).execute();
  pageSuccess(ctx, rows, Number(countRow?.total ?? 0));
});

router.get('/:roleId/menus', jwtAuth(), hasPerm('system:role:list'), async (ctx: Context) => {
  await assertTenantResource(T, 'role_id', ctx.params.roleId);
  const rows = await (await getDb()).selectFrom(RM).select('menu_id').where('role_id', '=', ctx.params.roleId).execute();
  success(ctx, rows.map((r: any) => r.menu_id), '查询成功');
});

router.post('/add', jwtAuth(), hasPerm('system:role:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(roleCreateSchema, ctx.request.body ?? {});
  const tid = requireTenantId();

  // roleKey 租户内唯一（uk_role_tenant_key）
  const dup = await db.selectFrom(T).select('role_id')
    .where('role_key', '=', b.roleKey).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
  if (dup) throw new ConflictError(`角色标识已存在：${b.roleKey}`);

  const roleId = generateSnowflakeId();
  await db.insertInto(T).values({
    role_id: roleId,
    tenant_id: tid,
    role_name: b.roleName,
    role_key: b.roleKey,
    data_scope: b.dataScope ?? 'TENANT',
    sort_num: b.sortNum ?? 0,
    status: b.status ?? '0',
    remark: b.remark ?? null,
    deleted: 0,
  }).execute();

  success(ctx, { roleId }, '新增成功');
});

router.put('/edit', jwtAuth(), hasPerm('system:role:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(roleUpdateSchema, ctx.request.body ?? {});
  const tid = requireTenantId();

  const existing = await db.selectFrom(T).select('role_id')
    .where('role_id', '=', b.roleId).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
  if (!existing) throw new NotFoundError();

  if (b.roleKey !== undefined) {
    const dup = await db.selectFrom(T).select('role_id')
      .where('role_key', '=', b.roleKey).where('tenant_id', '=', tid).where('deleted', '=', 0)
      .where('role_id', '!=', b.roleId).executeTakeFirst();
    if (dup) throw new ConflictError(`角色标识已存在：${b.roleKey}`);
  }

  const updateData: Record<string, any> = {};
  if (b.roleName !== undefined) updateData.role_name = b.roleName;
  if (b.roleKey !== undefined) updateData.role_key = b.roleKey;
  if (b.dataScope !== undefined) updateData.data_scope = b.dataScope;
  if (b.sortNum !== undefined) updateData.sort_num = b.sortNum;
  if (b.status !== undefined) updateData.status = b.status;
  if (b.remark !== undefined) updateData.remark = b.remark;
  if (Object.keys(updateData).length === 0) throw new ValidationError('没有可更新字段');

  const result: any = await db.updateTable(T).set(updateData)
    .where('role_id', '=', b.roleId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, null, '修改成功');
});

/** PUT /status — 状态切换（system:role:status） */
router.put('/status', jwtAuth(), hasPerm('system:role:status'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(statusSchema, ctx.request.body ?? {});
  const tid = requireTenantId();

  const result: any = await db.updateTable(T).set({ status: b.status })
    .where('role_id', '=', b.roleId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();
  success(ctx, null, '状态修改成功');
});

/** PUT /:roleId/menus — 分配菜单（事务 + 菜单有效性校验 + 套餐范围校验） */
router.put('/:roleId/menus', jwtAuth(), hasPerm('system:role:assignMenu'), async (ctx: Context) => {
  const roleId = ctx.params.roleId;
  const { menuIds } = parseOrThrow(menuAssignSchema, ctx.request.body ?? {});
  const uniqueMenuIds = [...new Set(menuIds)];
  const tid = requireTenantId();
  const db = (await getDb()) as any;

  await db.transaction().execute(async (trx: any) => {
    await assertTenantResource(T, 'role_id', roleId);

    if (uniqueMenuIds.length > 0) {
      const menus: any[] = await trx.selectFrom(MENU).select('menu_id')
        .where('menu_id', 'in', uniqueMenuIds).execute();
      if (menus.length !== uniqueMenuIds.length) throw new ValidationError('存在无效的菜单ID');
    }

    // 阶段二：套餐是租户权限上限，禁止把套餐外的菜单授予租户角色
    if (tid !== PLATFORM_TENANT_ID && uniqueMenuIds.length > 0) {
      const tenant = await trx.selectFrom('sys_tenant').select('package_id')
        .where('tenant_id', '=', tid).executeTakeFirst();
      if (tenant?.package_id) {
        const pkgMenus: any[] = await trx.selectFrom('sys_package_menu').select('menu_id')
          .where('package_id', '=', tenant.package_id).execute();
        const allowed = new Set(pkgMenus.map((m: any) => String(m.menu_id)));
        // 套餐未配置任何菜单时不设限（与 AuthService.profile 的口径保持一致）
        if (allowed.size > 0) {
          const outOfScope = uniqueMenuIds.filter((id) => !allowed.has(String(id)));
          if (outOfScope.length > 0) {
            throw new ForbiddenError(`以下菜单超出当前租户套餐范围：${outOfScope.join(', ')}`);
          }
        }
      }
    }

    await trx.deleteFrom(RM).where('role_id', '=', roleId).execute();
    if (uniqueMenuIds.length > 0) {
      await trx.insertInto(RM).values(uniqueMenuIds.map((id) => ({ role_id: roleId, menu_id: id }))).execute();
    }
  });

  success(ctx, null, '分配成功');
});

/** DELETE /remove — 逻辑删除角色，并清理角色菜单/用户关联（事务） */
router.delete('/remove', jwtAuth(), hasPerm('system:role:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  const tid = requireTenantId();

  await db.transaction().execute(async (trx: any) => {
    const visible: any[] = await trx.selectFrom(T).select('role_id')
      .where('role_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
    if (visible.length !== ids.length) throw new NotFoundError();

    await trx.deleteFrom(RM).where('role_id', 'in', ids).execute();
    await trx.deleteFrom(UR).where('role_id', 'in', ids).execute();
    await trx.updateTable(T).set({ deleted: 1 })
      .where('role_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
      .execute();
  });

  success(ctx, { deleted: ids.length }, '删除成功');
});

export default router;
