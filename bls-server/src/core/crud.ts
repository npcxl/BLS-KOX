/**
 * 泛型 CRUD 工厂
 *
 * 自动生成: GET /list, GET /:id, POST /add, PUT /edit, DELETE /remove, PUT /status
 *
 * 安全设计（与 docs/crud.md 对齐）：
 *  - 租户隔离 / 软删除 / Data Scope 
 *    （事务内外复用同一套 applyScope，绝不在事务里重新构造无条件查询）
 *  - 多租户写入 fail-closed：tenant_id 只来自服务端请求上下文，请求体不可覆盖
 *  - 字段白名单：createFields / updateFields / filterFields，未知字段安全忽略
 *  - 系统字段（主键/tenant_id/deleted/create_* /update_*）默认不可写
 *  - 受影响行数为 0 → 404（资源不存在或不属于当前租户/数据权限范围）
 *  - 事务提交成功后才执行 onWrite / onTransactionCommitted
 */
import Router from 'koa-router';
import { z } from 'zod';
import { getDb } from './database';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';
import { success, pageSuccess } from './response';
import { jwtAuth } from '../middleware/auth';
import { hasPerm } from '../middleware/permission';
import { getCurrentTenantId, requireTenantId } from '../middleware/tenant';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { resolveMaxScope, buildScopeWhere } from '../security/data-scope/data-scope';
import type { DataScopeType, DataScopeColumnMapping } from '../security/data-scope/data-scope';
import { logger } from './logger';
import type { Context } from 'koa';

export interface CrudModuleConfig {
  prefix?: string;
  table: string;
  pkField: string;
  tenantField?: string;
  statusField?: string;
  softDelete?: boolean;
  /** 全局表（无 tenant_id），显式声明后跳过租户过滤与注入 */
  globalTable?: boolean;
  /** 关键字模糊搜索字段（白名单） */
  searchFields?: string[];
  /**
   * 允许作为精确过滤条件的 query 字段白名单。
   * 未配置时不允许任何精确过滤（避免任意 query 参数被当作数据库列名）。
   */
  filterFields?: string[];
  /** 新增允许写入的字段白名单（snake_case）。未配置时回退到 Zod object 的 key，仍为空则拒绝写入 */
  createFields?: string[];
  /** 编辑允许写入的字段白名单（snake_case） */
  updateFields?: string[];
  /** 列表默认排序字段（snake_case），默认主键倒序 */
  orderBy?: string;
  name?: string;
  permPrefix?: string;
  schema?: { create?: z.ZodType; update?: z.ZodType };
  /** 数据权限列名映射。设为 false 显式关闭（默认关闭） */
  dataScope?: false | DataScopeColumnMapping;
  /** 写入成功后回调（add/edit/remove/status），用于清缓存等 */
  onWrite?: () => void | Promise<void>;
  /** 是否使用事务包裹写操作（add/edit/remove/status）。默认 false，向后兼容 */
  transactional?: boolean;
  /** 事务提交成功后回调（发送事件等）。未开启事务时在写入成功后执行 */
  onTransactionCommitted?: () => void | Promise<void>;
}

/** 系统字段：默认不可被请求体写入 */
const SYSTEM_FIELDS = new Set([
  'tenant_id', 'deleted',
  'create_by', 'create_time', 'update_by', 'update_time',
]);

/** snake_case → camelCase */
export function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** camelCase → snake_case */
export function toSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

/** snake_case → camelCase（整行） */
export function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) result[toCamelKey(key)] = value;
  return result;
}

/**
 * 字段白名单过滤：只保留白名单内字段，输出统一为 snake_case。
 * 未知字段被安全忽略（不会形成任意列写入）。
 */
export function pickFields(
  source: Record<string, unknown>,
  allowed: string[],
): Record<string, unknown> {
  const allowedSnake = new Set(allowed.map(toSnakeKey));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const snake = toSnakeKey(key);
    if (!allowedSnake.has(snake)) continue;
    if (value === undefined) continue;
    out[snake] = value;
  }
  return out;
}

/** 从多种请求形态提取待删除 ID 列表，统一支持 { ids: string[] } */
export function extractIds(body: unknown, query: unknown): string[] {
  const fromObject = (input: unknown): string[] | null => {
    if (!input || typeof input !== 'object') return null;
    const raw = (input as Record<string, unknown>).ids;
    if (raw === undefined || raw === null) return null;
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  };
  const fromBody = fromObject(body);
  if (fromBody) return fromBody;
  const fromQuery = fromObject(query);
  if (fromQuery) return fromQuery;
  // 兼容历史 Java 风格：body 直接是字符串数组
  if (Array.isArray(body)) return body.map(String).filter(Boolean);
  return [];
}

/** 校验 char(1) 状态值 */
export function normalizeStatus(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError('缺少 status');
  }
  const status = String(value);
  if (!/^[0-9A-Za-z]$/.test(status)) throw new ValidationError('status 非法');
  return status;
}

/** 从 Zod schema 推导白名单（仅 ZodObject） */
function fieldsFromSchema(schema?: z.ZodType): string[] | null {
  if (!schema) return null;
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return null;
  return Object.keys(shape);
}

/** ========= 核心工厂 ========= */

export function defineCrudModule(config: CrudModuleConfig): Router {
  const router = new Router({ prefix: config.prefix ?? '' });
  const table = config.table;
  const pk = config.pkField;
  const tenantField = config.tenantField ?? 'tenant_id';
  const statusField = config.statusField ?? 'status';
  const softDelete = config.softDelete ?? true;
  const globalTable = config.globalTable === true;
  const permPrefix = config.permPrefix;

  const createWhitelist = config.createFields ?? fieldsFromSchema(config.schema?.create) ?? [];
  const updateWhitelist = config.updateFields ?? fieldsFromSchema(config.schema?.update) ?? [];
  const filterWhitelist = (config.filterFields ?? []).map(toSnakeKey);
  const searchWhitelist = (config.searchFields ?? []).map(toSnakeKey);

  const permit = (action: string) =>
    permPrefix ? hasPerm(`${permPrefix}:${action}`) : (async (_ctx: Context, next: any) => next());

  /** 服务端租户（fail-closed） */
  function serverTenantId(): string {
    if (globalTable) return '';
    return requireTenantId();
  }

  /**
   * 统一作用域：租户 + 软删除 + Data Scope。
   * 无论普通连接还是事务连接，都通过该函数构造条件 → 条件不会丢失。
   */
  function applyScope(qb: any, scopeWhere: ((eb: any) => any) | null): any {
    let q = qb;
    if (!globalTable) {
      const tid = getCurrentTenantId();
      if (!tid) throw new ForbiddenError('缺少租户上下文');
      q = q.where(tenantField, '=', tid);
    }
    if (softDelete) q = q.where('deleted', '=', 0);
    if (scopeWhere) q = q.where(scopeWhere);
    return q;
  }

  /** 事务包装：条件在事务连接上重新套用（applyScope），而不是丢条件 */
  const runWrite = async <T>(runner: (qb: any, scopeWhere: ((eb: any) => any) | null) => Promise<T>, scopeWhere: ((eb: any) => any) | null): Promise<T> => {
    const db = (await getDb()) as any;
    if (!config.transactional) return runner(db, scopeWhere);
    return db.transaction().execute(async (trx: any) => runner(trx, scopeWhere));
  };

  /** 写入成功后的钩子（仅在写成功后执行） */
  const afterWrite = async (): Promise<void> => {
    try {
      await config.onWrite?.();
    } catch (error) {
      logger.warn('[crud] onWrite failed', { error: String(error) });
    }
    try {
      await config.onTransactionCommitted?.();
    } catch (error) {
      logger.warn('[crud] onTransactionCommitted failed', { error: String(error) });
    }
  };

  // ====== Data Scope 辅助函数 ======

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
    const perms: string[] = user.perms ?? user.permissions ?? [];
    const isAdmin = user.isAdmin === '1' || perms.includes('*');
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
    const query = ctx.query as Record<string, any>;
    const page = Math.max(1, Number(query.pageNum ?? query.current ?? 1) || 1);
    const size = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
    const offset = (page - 1) * size;
    const keyword = query.keyword;

    const scopeWhere = await buildScopeWhereFn(db, ctx);
    let q = applyScope(db.selectFrom(table).selectAll(), scopeWhere);

    if (keyword && searchWhitelist.length) {
      const kw = String(keyword);
      q = q.where((eb: any) => eb.or(searchWhitelist.map((field) => eb(field, 'like', `%${kw}%`))));
    }

    // 精确过滤：只允许白名单字段，未知 query 参数直接忽略（禁止任意列名注入）
    for (const field of filterWhitelist) {
      const camel = toCamelKey(field);
      const value = query[field] ?? query[camel];
      if (value !== undefined && value !== null && value !== '') {
        q = q.where(field, '=', String(value));
      }
    }

    const countRow: any = await (q as any).clearSelect()
      .select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
    const rows: any[] = await q
      .orderBy(config.orderBy ?? pk, config.orderBy ? 'asc' : 'desc')
      .limit(size).offset(offset).execute();

    pageSuccess(ctx, rows.map(rowToCamel), Number(countRow?.total ?? 0));
  });

  // ========== GET /:id ==========
  router.get('/:id', jwtAuth(), permit('list'), async (ctx: Context) => {
    const db = (await getDb()) as any;
    const id = String(ctx.params.id ?? '').trim();
    if (!id) throw new ValidationError(`缺少主键 ${pk}`);

    const scopeWhere = await buildScopeWhereFn(db, ctx);
    const q = applyScope(db.selectFrom(table).selectAll().where(pk, '=', id), scopeWhere);
    const row = await q.executeTakeFirst();
    if (!row) throw new NotFoundError();

    success(ctx, rowToCamel(row), '查询成功');
  });

  // ========== POST /add ==========
  router.post('/add', jwtAuth(), permit('add'), async (ctx: Context) => {
    let body = (ctx.request.body ?? {}) as Record<string, any>;
    if (config.schema?.create) {
      const parsed = config.schema.create.safeParse(body);
      if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
      body = parsed.data as Record<string, any>;
    }
    if (createWhitelist.length === 0) {
      throw new ValidationError('模块未配置 createFields 白名单，禁止写入');
    }

    const values = pickFields(body, createWhitelist);
    // 系统字段永不接受请求体覆盖（除非显式加入白名单）
    for (const field of Object.keys(values)) {
      if (SYSTEM_FIELDS.has(field) && !createWhitelist.map(toSnakeKey).includes(field)) {
        delete values[field];
      }
    }
    delete values[tenantField];

    const providedPk = values[pk];
    delete values[pk];
    values[pk] = providedPk !== undefined && providedPk !== null && providedPk !== ''
      ? String(providedPk)
      : generateSnowflakeId();

    if (!globalTable) values[tenantField] = serverTenantId();
    if (softDelete) values.deleted = 0;

    const scopeWhere = null; // 新增无需 Data Scope 条件
    await runWrite(async (qb) => {
      await qb.insertInto(table).values(values).execute();
    }, scopeWhere);
    await afterWrite();

    success(ctx, { [toCamelKey(pk)]: values[pk] }, '新增成功');
  });

  // ========== PUT /edit ==========
  router.put('/edit', jwtAuth(), permit('edit'), async (ctx: Context) => {
    let body = (ctx.request.body ?? {}) as Record<string, any>;
    const pkCamel = toCamelKey(pk);
    const pkValue = body[pk] ?? body[pkCamel];
    if (pkValue === undefined || pkValue === null || String(pkValue).trim() === '') {
      throw new ValidationError(`缺少主键 ${pk}`);
    }

    if (config.schema?.update) {
      const parsed = config.schema.update.safeParse(body);
      if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
      body = parsed.data as Record<string, any>;
    }
    if (updateWhitelist.length === 0) {
      throw new ValidationError('模块未配置 updateFields 白名单，禁止写入');
    }

    const values = pickFields(body, updateWhitelist);
    // 主键 / 租户 / 软删除标记不可通过 edit 修改
    delete values[pk];
    delete values[tenantField];
    delete values.deleted;
    delete values.create_time;
    delete values.create_by;
    for (const field of ['update_time', 'update_by']) {
      if (!updateWhitelist.map(toSnakeKey).includes(field)) delete values[field];
    }
    if (Object.keys(values).length === 0) throw new ValidationError('没有可更新字段');

    const db = (await getDb()) as any;
    const scopeWhere = await buildScopeWhereFn(db, ctx);

    const affected = await runWrite(async (qb, scope) => {
      const result: any = await applyScope(qb.updateTable(table).set(values), scope)
        .where(pk, '=', String(pkValue))
        .executeTakeFirst();
      return Number(result?.numUpdatedRows ?? result?.affectedRows ?? 0);
    }, scopeWhere);

    if (affected === 0) throw new NotFoundError();
    await afterWrite();

    success(ctx, null, '修改成功');
  });

  // ========== DELETE /remove ==========
  router.delete('/remove', jwtAuth(), permit('remove'), async (ctx: Context) => {
    const idList = [...new Set(extractIds(ctx.request.body, ctx.query))];
    if (idList.length === 0) throw new ValidationError('缺少 ids');

    const db = (await getDb()) as any;
    const scopeWhere = await buildScopeWhereFn(db, ctx);

    // fail-closed：请求中的 ID 必须全部在当前租户 + 软删除有效 + Data Scope 范围内，
    // 否则整体拒绝（不静默忽略越权 ID，也不误删）
    const affected = await runWrite(async (qb, scope) => {
      const visible: any[] = await applyScope(qb.selectFrom(table).select(pk), scope)
        .where(pk, 'in', idList)
        .execute();
      if (visible.length !== idList.length) throw new NotFoundError();

      const base = softDelete
        ? qb.updateTable(table).set({ deleted: 1 })
        : qb.deleteFrom(table);
      const result: any = await applyScope(base, scope)
        .where(pk, 'in', idList)
        .executeTakeFirst();
      return Number(result?.numUpdatedRows ?? result?.numDeletedRows ?? result?.affectedRows ?? 0);
    }, scopeWhere);

    if (affected === 0) throw new NotFoundError();
    await afterWrite();

    success(ctx, { deleted: affected }, '删除成功');
  });

  // ========== PUT /status ==========
  router.put('/status', jwtAuth(), permit('status'), async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, any>;
    const pkCamel = toCamelKey(pk);
    const id = body[pk] ?? body[pkCamel] ?? body.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      throw new ValidationError(`缺少主键 ${pk}`);
    }
    const status = normalizeStatus(body[statusField] ?? body[toCamelKey(statusField)]);

    const db = (await getDb()) as any;
    const scopeWhere = await buildScopeWhereFn(db, ctx);

    const affected = await runWrite(async (qb, scope) => {
      const result: any = await applyScope(qb.updateTable(table).set({ [statusField]: status }), scope)
        .where(pk, '=', String(id))
        .executeTakeFirst();
      return Number(result?.numUpdatedRows ?? result?.affectedRows ?? 0);
    }, scopeWhere);

    if (affected === 0) throw new NotFoundError();
    await afterWrite();

    success(ctx, null, '状态修改成功');
  });

  return router;
}
