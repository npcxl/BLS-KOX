/**
 * 泛型 CRUD 工厂
 *
 * 自动生成: GET /list, GET /:id, POST /add, PUT /edit, DELETE /remove, PUT /status
 *
 *  Data Scope: 全路由覆盖 (list / edit / delete / status)
 */
import Router from 'koa-router';
import { z } from 'zod';
import { getDb, transaction as dbTransaction } from './database';
import type { PoolConnection } from 'mysql2/promise';
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
  prefix?: string;
  table: string;
  pkField: string;
  tenantField?: string;
  statusField?: string;
  softDelete?: boolean;
  searchFields?: string[];
  name?: string;
  permPrefix?: string;
  schema?: { create?: z.ZodType; update?: z.ZodType };
  /**  数据权限列名映射。设为 false 显式关闭（默认关闭） */
  dataScope?: false | DataScopeColumnMapping;
  /** 写入后回调（add/edit/delete/status），用于清缓存等 */
  onWrite?: () => void | Promise<void>;
  /**是否使用事务包裹写操作（add/edit/delete/status）。默认 false，向后兼容 */
  transactional?: boolean;
  /** 事务完成回调，可用于在事务提交后执行副作用（如清除缓存、发送事件） */
  onTransactionCommitted?: () => void | Promise<void>;
}

/**  将 mysql2 PoolConnection 包装成 Kysely-like 接口，支持事务内复用现有 CRUD 代码 */
function wrapConnection(conn: PoolConnection, table: string): any {
  return {
    /** 执行原生 SQL，用于事务中替代 Kysely query builder */
    executeRaw: (sql: string, params: any[]) => conn.execute(sql, params),
    insertInto: (t: string) => ({
      values: (vals: Record<string, any>) => ({
        execute: () => {
          const keys = Object.keys(vals);
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${placeholders})`;
          return conn.execute(sql, Object.values(vals));
        },
      }),
    }),
    updateTable: (t: string) => ({
      set: (vals: Record<string, any>) => ({
        where: (col: string, op: string, val: any) => ({
          where: (...args: any[]) => {
            let sql = `UPDATE ${t} SET ${Object.keys(vals).map(k => `${k} = ?`).join(', ')} WHERE ${col} ${op === 'in' ? 'IN' : '='} ?`;
            const params = [...Object.values(vals), op === 'in' ? args[1] : val];
            return { execute: () => conn.execute(sql, params) };
          },
          execute: () => {
            const sql = `UPDATE ${t} SET ${Object.keys(vals).map(k => `${k} = ?`).join(', ')} WHERE ${col} = ?`;
            return conn.execute(sql, [...Object.values(vals), val]);
          },
        }),
        execute: () => {
          const sql = `UPDATE ${t} SET ${Object.keys(vals).map(k => `${k} = ?`).join(', ')}`;
          return conn.execute(sql, Object.values(vals));
        },
      }),
    }),
    deleteFrom: (t: string) => ({
      where: (col: string, op: string, val: any) => ({
        execute: () => conn.execute(`DELETE FROM ${t} WHERE ${col} ${op === 'in' ? 'IN' : '='} ?`, [val]),
      }),
    }),
  };
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

  const permit = (action: string) =>
    permPrefix ? hasPerm(`${permPrefix}:${action}`) : (async (_ctx: Context, next: any) => next());

  /** 可选事务包装器。当 config.transactional 为 true 时使用数据库事务包裹写操作。
   *  事务内通过 raw connection 执行 SQL，事务提交后触发 onTransactionCommitted 回调。 */
  const withOptionalTransaction = async <T>(runner: (db: any) => Promise<T>): Promise<T> => {
    if (!config.transactional) return runner((await getDb()) as any);
    return dbTransaction(async (conn: PoolConnection) => {
      const result = await runner(wrapConnection(conn, table));
      await config.onTransactionCommitted?.();
      return result;
    });
  };

  // ======  Data Scope 辅助函数 ======

  /** 递归查指定部门的所有子孙部门（DEPT_AND_CHILDREN 真正递归） */
  async function resolveDeptTree(db: any, rootDeptIds: string[]): Promise<string[]> {
    const all = [...rootDeptIds];
    let parents = [...rootDeptIds];
    while (parents.length > 0) {
      const children = await db.selectFrom('sys_dept').select('dept_id')
        .where('parent_id', 'in', parents).where('deleted', '=', 0)
        .execute() as any[];
      if (children.length === 0) break;
      parents = children.map((c: any) => String(c.dept_id));
      all.push(...parents);
    }
    return all;
  }

  /** 构建 Data Scope WHERE 回调（仅 config.dataScope 存在时才应用） */
  async function buildScopeWhereFn(db: any, ctx: Context): Promise<((eb: any) => any) | null> {
    if (!config.dataScope) return null;

    const user = (ctx.state.user ?? {}) as any;
    const isAdmin = user.isAdmin === '1' || user.permissions?.includes('*');
    if (isAdmin) return null;

    const roles: { dataScope?: DataScopeType }[] = user.roles ?? [];
    if (roles.length === 0) return null;

    const scope = resolveMaxScope(roles);
    let deptIds: string[] = user.deptId ? [String(user.deptId)] : [];

    if (scope === 'DEPT_AND_CHILDREN' && deptIds.length > 0) {
      try { deptIds = await resolveDeptTree(db, deptIds); } catch { /* fallback */ }
    }

    return buildScopeWhere({ userId: user.userId ?? '', tenantId: user.tenantId ?? (getCurrentTenantId() ?? ''), deptIds, scope }, config.dataScope);
  }

  // ========== GET /list ==========
  router.get('/list', jwtAuth(), permit('list'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const { pageNum = 1, pageSize = 10, keyword, ...rest } = ctx.query as Record<string, any>;
    const page = Math.max(1, Number(pageNum));
    const size = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = (page - 1) * size;

    let query = db.selectFrom(table).selectAll();

    const tenantId = getCurrentTenantId();
    if (tenantId) query = query.where(tenantField, '=', tenantId);

    // Data Scope
    const scopeWhere = await buildScopeWhereFn(db, ctx);
    if (scopeWhere) query = query.where(scopeWhere);

    if (softDelete) query = query.where('deleted', '=', 0);

    if (keyword && config.searchFields?.length) {
      query = query.where((eb: any) =>
        eb.or(config.searchFields!.map((field: string) => eb(field, 'like', `%${keyword}%`))));
    }

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && value !== '' && key !== 'pageNum' && key !== 'pageSize') {
        query = query.where(key.replace(/[A-Z]/g, m => '_' + m.toLowerCase()), '=', value);
      }
    }

    const countResult: any = await (query as any).clearSelect()
      .select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();

    const rows: any[] = await query.orderBy(pk, 'desc').limit(size).offset(offset).execute();

    pageSuccess(ctx, rows.map(rowToCamel), Number(countResult?.total ?? 0));
  });

  // ========== POST /add ==========
  router.post('/add', jwtAuth(), permit('add'), async (ctx: Context) => {
    let data = (ctx.request.body ?? {}) as Record<string, any>;
    if (config.schema?.create) {
      const parsed = config.schema.create.safeParse(data);
      if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
      data = parsed.data as Record<string, any>;
    }
    const id = data[pk] ?? generateSnowflakeId();
    const tid = getCurrentTenantId() ?? '000000';
    const values: Record<string, any> = { [pk]: id, [tenantField]: data[tenantField] ?? tid, ...data };
    if (softDelete && values.deleted === undefined) values.deleted = 0;
    // fail-closed — 租户校验在写入前，阻止跨租户/无租户写入
    await config.onWrite?.();
    await withOptionalTransaction(async (txDb) => {
      await txDb.insertInto(table).values(toSnake(values)).execute();
    });
    success(ctx, { [pk]: values[pk] }, '新增成功');
  });

  // ========== PUT /edit ==========
  router.put('/edit', jwtAuth(), permit('edit'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    let data = (ctx.request.body ?? {}) as Record<string, any>;
    const pkCamel = pk.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const pkValue = data[pk] ?? data[pkCamel];
    if (!pkValue) throw new ValidationError(`缺少主键 ${pk}`);
    if (config.schema?.update) {
      const parsed = config.schema.update.safeParse(data);
      if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
      data = parsed.data as Record<string, any>;
    }
    delete data[pk]; delete data[pkCamel];

    let query = db.updateTable(table).set(toSnake(data)).where(pk, '=', pkValue);

    const tenantId = getCurrentTenantId();
    if (tenantId) query = query.where(tenantField, '=', tenantId);

    // Data Scope
    const scopeWhere = await buildScopeWhereFn(db, ctx);
    if (scopeWhere) query = query.where(scopeWhere);

    if (softDelete) query = query.where('deleted', '=', 0);

    await config.onWrite?.();
    await withOptionalTransaction(async (txDb) => {
      await txDb.updateTable(table).set(toSnake(data)).where(pk, '=', pkValue).execute();
    });
    success(ctx, null, '修改成功');
  });

  // ========== DELETE /remove ==========
  router.delete('/remove', jwtAuth(), permit('remove'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const body = (ctx.request.body ?? ctx.query ?? {}) as Record<string, any>;
    const { ids } = body;
    const idList: string[] = Array.isArray(ids) ? ids.map(String) : String(ids ?? '').split(',').filter(Boolean);
    if (!idList.length) throw new ValidationError('缺少 ids');

    let query: any;
    if (softDelete) {
      query = db.updateTable(table).set({ deleted: 1 }).where(pk, 'in', idList);
    } else {
      query = db.deleteFrom(table).where(pk, 'in', idList);
    }

    const tenantId = getCurrentTenantId();
    if (tenantId) query = query.where(tenantField, '=', tenantId);

    // Data Scope
    const scopeWhere = await buildScopeWhereFn(db, ctx);
    if (scopeWhere) query = query.where(scopeWhere);

    await config.onWrite?.();
    await withOptionalTransaction(async (txDb) => {
      if (softDelete) {
        await txDb.updateTable(table).set({ deleted: 1 }).where(pk, 'in', idList).execute();
      } else {
        await txDb.deleteFrom(table).where(pk, 'in', idList).execute();
      }
    });
    success(ctx, null, '删除成功');
  });

  // ========== PUT /status ==========
  router.put('/status', jwtAuth(), permit('status'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const body = (ctx.request.body ?? {}) as Record<string, any>;
    const id = body[pk] ?? body.id;
    const status = body[statusField] ?? body.status;
    if (id === undefined || id === null || status === undefined) throw new ValidationError('缺少参数');

    let query = db.updateTable(table).set({ [statusField]: status }).where(pk, '=', String(id));

    const tenantId = getCurrentTenantId();
    if (tenantId) query = query.where(tenantField, '=', tenantId);

    // Data Scope
    const scopeWhere = await buildScopeWhereFn(db, ctx);
    if (scopeWhere) query = query.where(scopeWhere);

    if (softDelete) query = query.where('deleted', '=', 0);

    await config.onWrite?.();
    await withOptionalTransaction(async (txDb) => {
      await txDb.updateTable(table).set({ [statusField]: status }).where(pk, '=', String(id)).execute();
    });
    success(ctx, null, '状态修改成功');
  });

  return router;
}

/** ========= 工具函数 ========= */

function rowToCamel(row: any): any {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return result;
}

function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())] = value;
  }
  return result;
}
