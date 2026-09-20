/**
 * 泛型 CRUD 工厂（配置式）
 *
 * 自动生成: GET /list, GET /:id, POST /add, PUT /edit, DELETE /remove, PUT /status
 *
 * 两种等价的声明方式：
 *   1) 配置式（推荐）：`export const config = defineCrudConfig({ table, pkField, fields: {...} })`
 *      —— fields 是单一字段来源，自动推导白名单 / 搜索 / 过滤 / 响应字段 / Zod 校验；
 *   2) 旧数组式：`export const config = { table, pkField, createFields, updateFields, searchFields, filterFields, schema }`
 *      —— 完全向后兼容。
 *
 * 安全设计（与 docs/crud.md 对齐）：
 *  - 租户隔离 / 软删除 / Data Scope 通过 applyScope 统一构造，事务内外复用同一套条件；
 *  - 多租户写入 fail-closed：tenant_id 只来自服务端请求上下文，请求体不可覆盖；
 *  - 审计字段（create_by/create_time/update_by/update_time）永不接受请求体写入，只能由 createDefaults 提供；
 *  - 字段白名单（createFields / updateFields / filterFields）：未知字段安全忽略或按配置拒绝；
 *  - 响应按 fields.select 投影，select:false 的字段不会出现在 list/detail；
 *  - 受影响行数为 0 → 404；批量删除含越权/不存在 ID → 整体 404；
 *  - 事务提交成功后才执行 onWrite / onTransactionCommitted。
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
import type { DataScopeType } from '../security/data-scope/data-scope';
import { logger } from './logger';
import { toCamelKey, toSnakeKey, rowToCamel } from './crud-keys';
import {
  AUDIT_FIELDS,
  resolveCrudConfigCached,
  allowedRequestKeys,
} from './crud-config';
import type { CrudModuleConfig, ResolvedCrudConfig } from './crud-config';
import type { Context } from 'koa';

// 向后兼容的导出（原先定义在本文件）
export { toCamelKey, toSnakeKey, rowToCamel } from './crud-keys';
export { defineCrudConfig, CrudConfigError } from './crud-config';
export type {
  CrudModuleConfig,
  CrudFieldConfig,
  CrudFieldType,
  CrudFields,
  CrudActions,
  CrudCreateDefaults,
} from './crud-config';

/** 字段白名单过滤：只保留白名单内字段，输出统一为 snake_case。未知字段被安全忽略。 */
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

/** Zod 校验失败 → 项目统一 ValidationError（含字段路径） */
function parseWithSchema(schema: z.ZodType, input: unknown): Record<string, any> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })));
  }
  return parsed.data as Record<string, any>;
}

/** ========= 核心工厂 ========= */

export function defineCrudModule(config: CrudModuleConfig): Router {
  const r: ResolvedCrudConfig = resolveCrudConfigCached(config);
  const router = new Router({ prefix: config.prefix ?? '' });
  const { table, pk, tenantField, statusField, softDelete, globalTable, selectFields } = {
    table: r.table,
    pk: r.pkField,
    tenantField: r.tenantField,
    statusField: r.statusField,
    softDelete: r.softDelete,
    globalTable: r.globalTable,
    selectFields: r.selectFields,
  };
  const pkCamel = toCamelKey(pk);
  const statusCamel = toCamelKey(statusField);
  const permPrefix = config.permPrefix;

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

  /** 查询基座：声明 fields 时按投影返回（主键始终包含），否则 selectAll 兼容旧配置 */
  function selectBase(db: any): any {
    return selectFields
      ? db.selectFrom(table).select(selectFields)
      : db.selectFrom(table).selectAll();
  }

  /** 事务包装：条件在事务连接上重新套用（applyScope），而不是丢条件 */
  const runWrite = async <T>(
    runner: (qb: any, scopeWhere: ((eb: any) => any) | null) => Promise<T>,
    scopeWhere: ((eb: any) => any) | null,
  ): Promise<T> => {
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

  /** unknownFields='reject' 时拒绝模块未声明的请求字段 */
  function assertKnownFields(body: Record<string, any>): void {
    if (r.unknownFields !== 'reject') return;
    const allowed = allowedRequestKeys(r);
    const unknown = Object.keys(body).filter((key) => !allowed.has(toSnakeKey(key)));
    if (unknown.length > 0) {
      throw new ValidationError(`存在未允许的字段：${unknown.join(', ')}`);
    }
  }

  /** 删除请求体中不可写的保留字段：租户、软删除标记、审计字段 */
  function stripReserved(values: Record<string, any>): void {
    delete values[tenantField];
    delete values.deleted;
    for (const field of AUDIT_FIELDS) delete values[field];
  }

  /** 解析服务端默认值：字段级 default → createDefaults（后者优先） */
  async function resolveCreateDefaults(ctx: Context): Promise<Record<string, any>> {
    const defaults: Record<string, any> = { ...r.fieldDefaults };
    const configured = config.createDefaults;
    if (configured) {
      const fromConfig = typeof configured === 'function'
        ? await configured(ctx)
        : configured;
      if (!fromConfig || typeof fromConfig !== 'object') {
        throw new ValidationError('createDefaults 返回值必须是对象');
      }
      for (const [key, value] of Object.entries(fromConfig)) {
        const snake = toSnakeKey(key);
        if (r.fields && !r.fields[snake] && !(AUDIT_FIELDS as readonly string[]).includes(snake)
          && snake !== tenantField && snake !== 'deleted') {
          throw new ValidationError(`createDefaults 返回了未声明的字段：${key}`);
        }
        defaults[snake] = value;
      }
    }
    return defaults;
  }

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

    return buildScopeWhere(
      { userId: user.userId ?? '', tenantId: user.tenantId ?? (getCurrentTenantId() ?? ''), deptIds, scope },
      config.dataScope,
    );
  }

  // ========== GET /list ==========
  if (r.actions.list) {
    router.get('/list', jwtAuth(), permit('list'), async (ctx: Context) => {
      const db = (await getDb()) as any;
      const query = ctx.query as Record<string, any>;
      const page = Math.max(1, Number(query.pageNum ?? query.current ?? 1) || 1);
      const size = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
      const offset = (page - 1) * size;
      const keyword = query.keyword;

      const scopeWhere = await buildScopeWhereFn(db, ctx);
      let q = applyScope(selectBase(db), scopeWhere);

      if (keyword && r.searchFields.length) {
        const kw = String(keyword);
        q = q.where((eb: any) => eb.or(r.searchFields.map((field) => eb(field, 'like', `%${kw}%`))));
      }

      // 精确过滤：只允许白名单字段，未知 query 参数直接忽略（禁止任意列名注入）
      for (const field of r.filterFields) {
        const camel = toCamelKey(field);
        const value = query[field] ?? query[camel];
        if (value !== undefined && value !== null && value !== '') {
          q = q.where(field, '=', String(value));
        }
      }

      const countRow: any = await (q as any).clearSelect()
        .select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
      const rows: any[] = await q
        .orderBy(r.orderBy ?? pk, r.orderBy ? 'asc' : 'desc')
        .limit(size).offset(offset).execute();

      pageSuccess(ctx, rows.map(rowToCamel), Number(countRow?.total ?? 0));
    });
  }

  // ========== GET /:id ==========
  if (r.actions.detail) {
    router.get('/:id', jwtAuth(), permit('list'), async (ctx: Context) => {
      const db = (await getDb()) as any;
      const id = String(ctx.params.id ?? '').trim();
      if (!id) throw new ValidationError(`缺少主键 ${pk}`);

      const scopeWhere = await buildScopeWhereFn(db, ctx);
      const q = applyScope(selectBase(db).where(pk, '=', id), scopeWhere);
      const row = await q.executeTakeFirst();
      if (!row) throw new NotFoundError();

      success(ctx, rowToCamel(row), '查询成功');
    });
  }

  // ========== POST /add ==========
  if (r.actions.add) {
    router.post('/add', jwtAuth(), permit('add'), async (ctx: Context) => {
      const raw = (ctx.request.body ?? {}) as Record<string, any>;
      assertKnownFields(raw);

      const body = r.createSchema ? parseWithSchema(r.createSchema, raw) : raw;
      const clientValues = pickFields(body, r.createFields);
      stripReserved(clientValues);

      // 服务端可信默认值（字段级 default → createDefaults），客户端值优先于默认值
      const defaults = await resolveCreateDefaults(ctx);
      const values: Record<string, any> = { ...defaults, ...clientValues };
      // 租户 / 软删除 / 主键由服务端最终决定；审计字段只能来自可信默认值
      delete values[tenantField];
      delete values.deleted;
      for (const field of AUDIT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(defaults, field)) delete values[field];
      }

      const providedPk = clientValues[pk] ?? defaults[pk];
      delete values[pk];
      values[pk] = providedPk !== undefined && providedPk !== null && providedPk !== ''
        ? String(providedPk)
        : generateSnowflakeId();

      // 服务端权威值：租户与软删除标记最终覆盖一切
      if (!globalTable) values[tenantField] = serverTenantId();
      if (softDelete) values.deleted = 0;

      await runWrite(async (qb) => {
        await qb.insertInto(table).values(values).execute();
      }, null);
      await afterWrite();

      success(ctx, { [pkCamel]: values[pk] }, '新增成功');
    });
  }

  // ========== PUT /edit ==========
  if (r.actions.edit) {
    router.put('/edit', jwtAuth(), permit('edit'), async (ctx: Context) => {
      const raw = (ctx.request.body ?? {}) as Record<string, any>;
      const pkValue = raw[pk] ?? raw[pkCamel];
      if (pkValue === undefined || pkValue === null || String(pkValue).trim() === '') {
        throw new ValidationError(`缺少主键 ${pk}`);
      }
      assertKnownFields(raw);

      const body = r.updateSchema ? parseWithSchema(r.updateSchema, raw) : raw;
      const values = pickFields(body, r.updateFields);
      stripReserved(values);
      delete values[pk];
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
  }

  // ========== DELETE /remove ==========
  if (r.actions.remove) {
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
  }

  // ========== PUT /status ==========
  if (r.actions.status) {
    router.put('/status', jwtAuth(), permit('status'), async (ctx: Context) => {
      const body = (ctx.request.body ?? {}) as Record<string, any>;
      const id = body[pk] ?? body[pkCamel] ?? body.id;
      if (id === undefined || id === null || String(id).trim() === '') {
        throw new ValidationError(`缺少主键 ${pk}`);
      }
      const rawStatus = body[statusField] ?? body[statusCamel];
      const statusConfig = r.fields?.[statusField];
      let status: string | number;
      if (statusConfig?.type === 'enum' && statusConfig.values?.length) {
        const candidate = String(rawStatus ?? '');
        if (!statusConfig.values.includes(candidate)) {
          throw new ValidationError(`status 只能是：${statusConfig.values.join(', ')}`);
        }
        status = candidate;
      } else if (statusConfig?.type === 'number' || statusConfig?.type === 'integer') {
        const parsed = Number(rawStatus);
        if (rawStatus === undefined || rawStatus === null || rawStatus === '' || !Number.isFinite(parsed)) {
          throw new ValidationError('status 非法');
        }
        status = parsed;
      } else {
        status = normalizeStatus(rawStatus);
      }

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
  }

  return router;
}
