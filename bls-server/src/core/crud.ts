/**
 * 泛型 CRUD 工厂
 *
 * 新建一张表后，只需一个配置文件即可获得标准增删查改接口：
 *
 *   import { defineCrudModule } from '../../core/crud';
 *   export default defineCrudModule({
 *     prefix: '/system/xxx',
 *     table: 'sys_xxx',
 *     pkField: 'xxx_id',
 *     searchFields: ['xxx_name'],
 *     name: 'XXX',
 *   });
 *
 * 自动生成: GET /list, GET /:id, POST /add, PUT /edit, DELETE /remove, PUT /status
 */
import Router from 'koa-router';
import { z } from 'zod';
import { getDb } from './database';
import { ValidationError } from './errors';
import { success, pageSuccess } from './response';
import { jwtAuth } from '../middleware/auth';
import { hasPerm } from '../middleware/permission';
import { getCurrentTenantId } from '../middleware/tenant';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { resolveMaxScope, buildScopeWhere } from '../security/data-scope/data-scope';
import type { DataScopeType, DataScopeColumnMapping } from '../security/data-scope/data-scope';
import type { Context } from 'koa';

export interface CrudModuleConfig {
  /** 路由前缀，如 '/system/role'。不填则自动从文件夹路径推导 */
  prefix?: string;
  /** 数据库表名，如 'sys_role' */
  table: string;
  /** 主键字段名（数据库列名），如 'role_id' */
  pkField: string;
  /** 租户字段名，默认 'tenant_id' */
  tenantField?: string;
  /** 状态字段名，用于 /status 切换，默认 'status' */
  statusField?: string;
  /** 是否软删除（设置 deleted=1），默认 true */
  softDelete?: boolean;
  /** 关键字搜索字段（用于 keyword 参数），如 ['role_name', 'role_key'] */
  searchFields?: string[];
  /** 模块中文名，用于操作日志 */
  name?: string;
  /** 可选：自定义权限前缀，如 'system:role' */
  permPrefix?: string;
  /** 可选：zod schema 用于创建/编辑时的额外校验 */
  schema?: {
    create?: z.ZodType;
    update?: z.ZodType;
  };
  /** P9: 数据权限列名映射（不同表字段名可能不同） */
  dataScope?: DataScopeColumnMapping;
}

/** ========= 核心工厂 ========= */

export function defineCrudModule(config: CrudModuleConfig): Router {
  const router = new Router({ prefix: config.prefix ?? '' });
  const table = config.table;
  const pk = config.pkField;
  const tenantField = config.tenantField ?? 'tenant_id';
  const statusField = config.statusField ?? 'status';
  const softDelete = config.softDelete ?? true;
  const permPrefix = config.permPrefix;

  // 权限中间件（如果配置了）
  const permit = (action: string) =>
    permPrefix ? hasPerm(`${permPrefix}:${action}`) : (async (_ctx: Context, next: any) => next());

  // ========== GET /list ==========
  router.get('/list', jwtAuth(), permit('list'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const { pageNum = 1, pageSize = 10, keyword, ...rest } = ctx.query as Record<string, any>;
    const page = Math.max(1, Number(pageNum));
    const size = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = (page - 1) * size;

    let query = db.selectFrom(table).selectAll();

    // 租户过滤
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      query = query.where(tenantField, '=', tenantId);
    }

    // ====== P9: Data Scope 数据权限过滤 ======
    // P9-FIX-03: 仅 * 权限或 isAdmin 绕过，平台租户不天然绕过
    const user = (ctx.state.user ?? {}) as any;
    const isAdmin = user.isAdmin === '1' || user.permissions?.includes('*');
    if (!isAdmin) {
      const roles: { dataScope?: DataScopeType }[] = user.roles ?? [];
      if (roles.length > 0) {
        const scope = resolveMaxScope(roles);
        // 递归查子部门 (DEPT_AND_CHILDREN)
        let deptIds: string[] = user.deptId ? [String(user.deptId)] : [];
        if (scope === 'DEPT_AND_CHILDREN' && user.deptId) {
          try {
            const children = await db.selectFrom('sys_dept').select('dept_id')
              .where('parent_id', '=', String(user.deptId)).where('deleted', '=', 0)
              .execute() as any[];
            deptIds.push(...children.map((c: any) => String(c.dept_id)));
          } catch { /* fallback to own dept */ }
        }

        // P9-FIX-01/02: 使用 buildScopeWhere + 列名映射
        const whereFn = buildScopeWhere({
          userId: user.userId ?? '',
          tenantId: user.tenantId ?? tenantId,
          deptIds,
          scope,
        }, config.dataScope);
        if (whereFn) {
          query = query.where(whereFn);
        }
      }
    }

    // 软删除
    if (softDelete) {
      query = query.where('deleted', '=', 0);
    }

    // 关键字搜索
    if (keyword && config.searchFields?.length) {
      query = query.where((eb: any) =>
        eb.or(config.searchFields!.map((field: string) =>
          eb(field, 'like', `%${keyword}%`)
        ))
      );
    }

    // 字段精确过滤
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && value !== '' && key !== 'pageNum' && key !== 'pageSize') {
        const dbField = key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
        query = query.where(dbField, '=', value);
      }
    }

    // 计数
    const countResult: any = await (query as any)
      .clearSelect()
      .select((eb: any) => eb.fn.countAll().as('total'))
      .executeTakeFirst();
    const totalCount = Number(countResult?.total ?? 0);

    // 分页
    const rows: any[] = await query
      .orderBy(pk, 'desc')
      .limit(size)
      .offset(offset)
      .execute();

    pageSuccess(ctx, rows.map(rowToCamel), totalCount);
  });

  // ========== POST /add ==========
  router.post('/add', jwtAuth(), permit('add'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    let data = (ctx.request.body ?? {}) as Record<string, any>;

    // 自定义 schema 校验
    if (config.schema?.create) {
      const parsed = config.schema.create.safeParse(data);
      if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
      data = parsed.data as Record<string, any>;
    }

    const id = data[pk] ?? generateSnowflakeId();
    const tid = getCurrentTenantId() ?? '000000';

    const values: Record<string, any> = {
      [pk]: id,
      [tenantField]: data[tenantField] ?? tid,
      ...data,
    };

    if (softDelete && values.deleted === undefined) {
      values.deleted = 0;
    }

    await db.insertInto(table).values(toSnake(values)).execute();
    success(ctx, { [pk]: values[pk] }, '新增成功');
  });

  // ========== PUT /edit ==========
  router.put('/edit', jwtAuth(), permit('edit'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    let data = (ctx.request.body ?? {}) as Record<string, any>;

    // 兼容 camelCase 主键（前端发 themeId，数据库用 theme_id）
    const pkCamel = pk.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const pkValue = data[pk] ?? data[pkCamel];
    if (!pkValue) throw new ValidationError(`缺少主键 ${pk}`);

    // 自定义 schema 校验
    if (config.schema?.update) {
      const parsed = config.schema.update.safeParse(data);
      if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
      data = parsed.data as Record<string, any>;
    }

    delete data[pk];
    delete data[pkCamel];

    let query = db.updateTable(table)
      .set(toSnake(data))
      .where(pk, '=', pkValue);

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      query = query.where(tenantField, '=', tenantId);
    }

    if (softDelete) {
      query = query.where('deleted', '=', 0);
    }

    await query.execute();
    success(ctx, null, '修改成功');
  });

  // ========== DELETE /remove ==========
  router.delete('/remove', jwtAuth(), permit('remove'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const body = (ctx.request.body ?? ctx.query ?? {}) as Record<string, any>;
    const { ids } = body;

    const idList: string[] = Array.isArray(ids)
      ? ids.map(String)
      : String(ids ?? '').split(',').filter(Boolean);
    if (!idList.length) throw new ValidationError('缺少 ids');

    let query: any;
    if (softDelete) {
      query = db.updateTable(table).set({ deleted: 1 }).where(pk, 'in', idList);
    } else {
      query = db.deleteFrom(table).where(pk, 'in', idList);
    }

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      query = query.where(tenantField, '=', tenantId);
    }

    await query.execute();
    success(ctx, null, '删除成功');
  });

  // ========== PUT /status ==========
  router.put('/status', jwtAuth(), permit('status'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const body = (ctx.request.body ?? {}) as Record<string, any>;
    const id = body[pk] ?? body.id;
    const status = body[statusField] ?? body.status;

    if (id === undefined || id === null || status === undefined) {
      throw new ValidationError('缺少参数');
    }

    let query = db.updateTable(table)
      .set({ [statusField]: status })
      .where(pk, '=', String(id));

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      query = query.where(tenantField, '=', tenantId);
    }

    if (softDelete) {
      query = query.where('deleted', '=', 0);
    }

    await query.execute();
    success(ctx, null, '状态修改成功');
  });

  return router;
}

/** ========= 工具函数 ========= */

/** snake_case → camelCase */
function rowToCamel(row: any): any {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/** camelCase → snake_case */
function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
    result[snakeKey] = value;
  }
  return result;
}
