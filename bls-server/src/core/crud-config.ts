/**
 * 配置式 CRUD：字段声明（fields）解析、启动校验与 Zod 自动生成
 *
 * 设计目标（与 docs/crud.md 对齐）：
 *  - 标准单表模块只写一个 index.ts 配置即可生成完整 CRUD；
 *  - fields 成为「单一字段来源」，自动推导 createFields / updateFields /
 *    searchFields / filterFields / selectFields / Zod 校验 / statusField；
 *  - 配置错误在「路由注册阶段」直接抛错（应用启动失败），错误信息包含模块、表名与字段名；
 *  - 旧数组式配置（createFields / updateFields / searchFields / filterFields / schema）完全兼容，
 *    两者同时存在时以「显式数组 / 显式 schema」优先。
 */
import { z } from 'zod';
import { AppError } from './errors';
import { toCamelKey, toSnakeKey } from './crud-keys';
import type { DataScopeColumnMapping } from '../security/data-scope/data-scope';
import type { Context } from 'koa';

// ===================== 类型 =====================

export type CrudFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'datetime' | 'json';

export interface CrudFieldConfig {
  /** 字段类型，决定 Zod 校验与 OpenAPI 类型 */
  type: CrudFieldType;
  /** enum 取值集合（仅 type=enum 时有效，且必须非空） */
  values?: readonly string[];
  /** 新增时必填（仅对 create 字段生效） */
  required?: boolean;
  /** 允许 null（与 optional 区分：optional 允许缺省，nullable 允许显式 null） */
  nullable?: boolean;
  /** 允许作为新增字段（白名单） */
  create?: boolean;
  /** 允许作为编辑字段（白名单） */
  update?: boolean;
  /** 参与 keyword 模糊搜索 */
  search?: boolean;
  /** 允许作为精确过滤条件（query 参数） */
  filter?: boolean;
  /** 是否出现在列表/详情响应中，默认 true；select:false 的字段不会出现在响应里 */
  select?: boolean;
  /** 标记为状态字段（模块最多一个），用于 /status 端点 */
  status?: boolean;
  /** number/integer：最小值 */
  min?: number;
  /** number/integer：最大值 */
  max?: number;
  /** string：最小长度 */
  minLength?: number;
  /** string：最大长度 */
  maxLength?: number;
  /** 服务端新增默认值（可信配置，客户端无法覆盖） */
  default?: unknown;
  /** OpenAPI 字段说明 */
  description?: string;
}

export type CrudFields = Record<string, CrudFieldConfig>;

export interface CrudActions {
  list?: boolean;
  detail?: boolean;
  add?: boolean;
  edit?: boolean;
  remove?: boolean;
  status?: boolean;
}

export type CrudDefaultsFunction = (
  ctx: Context,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export type CrudCreateDefaults = Record<string, unknown> | CrudDefaultsFunction;

export interface CrudModuleConfig {
  prefix?: string;
  table: string;
  pkField: string;
  tenantField?: string;
  statusField?: string;
  softDelete?: boolean;
  /** 全局表（无 tenant_id），显式声明后跳过租户过滤与注入 */
  globalTable?: boolean;

  /** 字段声明：标准模块的单一字段来源 */
  fields?: CrudFields;
  /** 端点开关：关闭的端点不会注册（而不是注册后返回不支持） */
  actions?: CrudActions;
  /** 服务端新增默认值（对象或函数），属于可信配置 */
  createDefaults?: CrudCreateDefaults;
  /** 请求体未知字段策略：ignore=安全忽略（默认）；reject=返回 400 */
  unknownFields?: 'ignore' | 'reject';

  // ---- 旧数组式配置（继续兼容；与 fields 同时存在时优先） ----
  /** 关键字模糊搜索字段（白名单） */
  searchFields?: string[];
  /** 允许作为精确过滤条件的 query 字段白名单 */
  filterFields?: string[];
  /** 新增允许写入的字段白名单（snake_case） */
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

/** 解析后的配置（内部使用） */
export interface ResolvedCrudConfig {
  table: string;
  pkField: string;
  tenantField: string;
  statusField: string;
  softDelete: boolean;
  globalTable: boolean;
  orderBy: string | null;
  actions: Required<CrudActions>;
  createFields: string[];
  updateFields: string[];
  searchFields: string[];
  filterFields: string[];
  /** null = 不做字段投影（兼容旧配置，等价 selectAll） */
  selectFields: string[] | null;
  /** 原始 fields 声明（未声明则为 null） */
  fields: CrudFields | null;
  /** 字段级默认值（snake_case） */
  fieldDefaults: Record<string, unknown>;
  createSchema: z.ZodType | null;
  updateSchema: z.ZodType | null;
  unknownFields: 'ignore' | 'reject';
  /** 模块显示名（用于错误信息） */
  label: string;
}

// ===================== 常量 =====================

/** 系统字段：请求体永远不可写（只能由服务端或 createDefaults 设置） */
export const AUDIT_FIELDS = ['create_by', 'create_time', 'update_by', 'update_time'] as const;
/** 系统字段总集合（含租户与软删除标记） */
export const SYSTEM_FIELDS_LIST = ['tenant_id', 'deleted', ...AUDIT_FIELDS] as const;

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FIELD_TYPES: CrudFieldType[] = ['string', 'number', 'integer', 'boolean', 'enum', 'datetime', 'json'];
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** 配置错误：启动阶段抛出，应用启动失败 */
export class CrudConfigError extends AppError {
  constructor(message: string) {
    super(message, 500, 500);
    this.name = 'CrudConfigError';
  }
}

// ===================== 校验工具 =====================

function fail(config: Partial<CrudModuleConfig>, detail: string): never {
  const label = config.name ? `模块「${config.name}」` : '模块';
  const table = config.table ? `表 ${config.table}` : '表未声明';
  throw new CrudConfigError(`[crud] ${label}（${table}）配置错误：${detail}`);
}

function assertIdentifier(config: Partial<CrudModuleConfig>, value: unknown, what: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) fail(config, `${what} 不能为空`);
  if (!IDENTIFIER_RE.test(value)) {
    fail(config, `${what}「${String(value)}」不是合法的 SQL 标识符（只允许字母、数字、下划线，且不能以数字开头）`);
  }
}

function isSystemField(name: string): boolean {
  return (SYSTEM_FIELDS_LIST as readonly string[]).includes(name);
}

// ===================== Zod 自动生成 =====================

function zodForField(config: Partial<CrudModuleConfig>, name: string, field: CrudFieldConfig): z.ZodType {
  let base: z.ZodType;
  switch (field.type) {
    case 'string': {
      let s = z.string();
      if (field.minLength !== undefined) s = s.min(field.minLength, `${name} 长度不能小于 ${field.minLength}`);
      if (field.maxLength !== undefined) s = s.max(field.maxLength, `${name} 长度不能大于 ${field.maxLength}`);
      base = s;
      break;
    }
    case 'number': {
      let n = z.number();
      if (field.min !== undefined) n = n.min(field.min, `${name} 不能小于 ${field.min}`);
      if (field.max !== undefined) n = n.max(field.max, `${name} 不能大于 ${field.max}`);
      base = n;
      break;
    }
    case 'integer': {
      let n = z.number().int(`${name} 必须是整数`);
      if (field.min !== undefined) n = n.min(field.min, `${name} 不能小于 ${field.min}`);
      if (field.max !== undefined) n = n.max(field.max, `${name} 不能大于 ${field.max}`);
      base = n;
      break;
    }
    case 'boolean':
      base = z.boolean();
      break;
    case 'enum':
      base = z.enum(field.values as unknown as [string, ...string[]]);
      break;
    case 'datetime':
      base = z.string().regex(DATETIME_RE, `${name} 时间格式应为 YYYY-MM-DD、YYYY-MM-DD HH:mm:ss 或 ISO 格式`);
      break;
    case 'json':
      base = z.union([z.string(), z.record(z.string(), z.any()), z.array(z.any())]);
      break;
    default:
      fail(config, `字段「${name}」type「${String(field.type)}」不受支持`);
  }

  if (field.nullable) base = base.nullable();
  return base.optional();
}

/**
 * 生成 Zod 校验 Schema。
 *
 * 同时接受 snake_case 与 camelCase 键（请求仍可用 camelCase），
 * snake_case 在 shape 中靠后 → 同时提交两者时以 snake_case 为准；
 * 必填（required）在对象级校验「snake 或 camel 至少提供一个」，因此两种写法都能通过。
 */
function buildSchema(config: Partial<CrudModuleConfig>, fields: CrudFields, keys: string[], mode: 'create' | 'update'): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  const requiredKeys: string[] = [];

  for (const key of keys) {
    const camel = toCamelKey(key);
    const fieldSchema = zodForField(config, key, fields[key]);
    if (camel !== key) shape[camel] = fieldSchema;
    shape[key] = fieldSchema;
    if (mode === 'create' && fields[key].required === true) requiredKeys.push(key);
  }

  const base = z.object(shape);
  if (requiredKeys.length === 0) return base;

  return base.superRefine((data: Record<string, unknown>, ctx: any) => {
    for (const key of requiredKeys) {
      const camel = toCamelKey(key);
      if (data[key] === undefined && data[camel] === undefined) {
        ctx.addIssue({ code: 'custom', path: [camel], message: `${camel} 为必填字段` });
      }
    }
  });
}

// ===================== 解析与校验 =====================

/** 从 Zod schema 推导字段名（仅 ZodObject） */
export function fieldsFromSchema(schema?: z.ZodType): string[] | null {
  if (!schema) return null;
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return null;
  return Object.keys(shape).map(toSnakeKey);
}

/** 校验 fields 声明本身是否合法 */
function validateFields(config: Partial<CrudModuleConfig>, fields: CrudFields): void {
  const statusFields: string[] = [];

  for (const [name, field] of Object.entries(fields)) {
    if (!IDENTIFIER_RE.test(name)) {
      fail(config, `字段名「${name}」不是合法的 SQL 标识符`);
    }
    if (!field || typeof field !== 'object') fail(config, `字段「${name}」的配置必须是对象`);
    if (!FIELD_TYPES.includes(field.type)) {
      fail(config, `字段「${name}」type「${String(field.type)}」不受支持（可选：${FIELD_TYPES.join(' / ')}）`);
    }
    if (field.type === 'enum') {
      if (!Array.isArray(field.values) || field.values.length === 0) {
        fail(config, `字段「${name}」是 enum，必须声明非空的 values`);
      }
      if (!field.values.every((v) => typeof v === 'string')) {
        fail(config, `字段「${name}」的 values 必须全部是字符串`);
      }
    } else if (field.values !== undefined) {
      fail(config, `字段「${name}」type=${field.type}，不允许声明 values（仅 enum 支持）`);
    }
    if (field.status === true) statusFields.push(name);

    const numericField = field.type === 'number' || field.type === 'integer';
    if (!numericField && (field.min !== undefined || field.max !== undefined)) {
      fail(config, `字段「${name}」type=${field.type}，不允许声明 min/max（仅 number/integer 支持）`);
    }
    if (field.type !== 'string' && (field.minLength !== undefined || field.maxLength !== undefined)) {
      fail(config, `字段「${name}」type=${field.type}，不允许声明 minLength/maxLength（仅 string 支持）`);
    }
    if (numericField && field.min !== undefined && field.max !== undefined && field.min > field.max) {
      fail(config, `字段「${name}」min(${field.min}) 不能大于 max(${field.max})`);
    }
    if (isSystemField(name) && (field.create === true || field.update === true)) {
      fail(config, `系统字段「${name}」不允许开放写入（create/update 必须为 false）`);
    }
  }

  if (statusFields.length > 1) {
    fail(config, `只能声明一个 status:true 字段，当前为 ${statusFields.join(', ')}`);
  }
}

/**
 * 解析 + 校验配置，产出运行时所需的派生结果。
 * 校验失败抛出 CrudConfigError（应用启动失败），错误信息包含模块/表/字段。
 */
export function resolveCrudConfig(config: CrudModuleConfig): ResolvedCrudConfig {
  if (!config || typeof config !== 'object') {
    throw new CrudConfigError('[crud] 配置必须是对象');
  }
  const globalTable = config.globalTable === true;
  const softDelete = config.softDelete ?? true;

  // ---- table / pk ----
  assertIdentifier(config, config.table, 'table');
  assertIdentifier(config, config.pkField, 'pkField');

  // ---- 租户字段 ----
  const tenantField = config.tenantField ?? 'tenant_id';
  if (!globalTable) assertIdentifier(config, tenantField, 'tenantField');
  if (config.globalTable === false && !tenantField.trim()) {
    fail(config, 'globalTable=false 时必须提供 tenantField');
  }

  // ---- 排序字段 ----
  if (config.orderBy !== undefined) assertIdentifier(config, config.orderBy, 'orderBy');

  // ---- fields ----
  const fields = config.fields ?? null;
  if (fields) {
    if (!Object.keys(fields).length) fail(config, 'fields 不能为空对象');
    validateFields(config, fields);
    // deleted 列若声明在 fields 中，必须由服务端维护
    const deletedField = fields.deleted;
    if (deletedField && (deletedField.create === true || deletedField.update === true)) {
      fail(config, 'softDelete 场景下 deleted 字段不允许开放写入');
    }
  }

  // ---- statusField ----
  let statusField: string;
  if (config.statusField !== undefined) {
    assertIdentifier(config, config.statusField, 'statusField');
    statusField = config.statusField;
  } else if (fields) {
    statusField = Object.entries(fields).find(([, f]) => f.status === true)?.[0] ?? '';
  } else {
    // 旧配置：默认 status
    statusField = 'status';
  }

  // ---- 旧数组 ∩ fields 校验 ----
  const assertLegacyFieldsKnown = (list: string[] | undefined, what: string) => {
    if (!fields || !list) return;
    for (const raw of list) {
      const name = toSnakeKey(raw);
      if (!fields[name]) {
        fail(config, `${what} 中的「${raw}」未在 fields 中声明（使用 fields 时必须声明该字段）`);
      }
    }
  };
  assertLegacyFieldsKnown(config.createFields, 'createFields');
  assertLegacyFieldsKnown(config.updateFields, 'updateFields');
  assertLegacyFieldsKnown(config.searchFields, 'searchFields');
  assertLegacyFieldsKnown(config.filterFields, 'filterFields');

  // ---- 派生字段清单（显式数组优先） ----
  const derivedFromFields = <T,>(pick: (f: CrudFieldConfig) => T | undefined, fallback: T): string[] => {
    if (!fields) return [];
    return Object.entries(fields)
      .filter(([, f]) => Boolean(pick(f)) === true)
      .map(([name]) => name);
  };

  const createFields = config.createFields
    ? config.createFields.map(toSnakeKey)
    : fields
      ? derivedFromFields((f) => f.create, true)
      : fieldsFromSchema(config.schema?.create) ?? [];
  const updateFields = config.updateFields
    ? config.updateFields.map(toSnakeKey)
    : fields
      ? derivedFromFields((f) => f.update, true)
      : fieldsFromSchema(config.schema?.update) ?? [];
  const searchFields = config.searchFields
    ? config.searchFields.map(toSnakeKey)
    : derivedFromFields((f) => f.search, true);
  const filterFields = config.filterFields
    ? config.filterFields.map(toSnakeKey)
    : derivedFromFields((f) => f.filter, true);

  // ---- 响应投影（fields 声明才生效；主键始终返回，否则前端无法定位行） ----
  let selectFields: string[] | null = null;
  if (fields) {
    const declared = Object.entries(fields)
      .filter(([, f]) => f.select !== false)
      .map(([name]) => name);
    selectFields = [...new Set([config.pkField, ...declared])];
    if (!selectFields.length) fail(config, '至少需要一个可返回字段（select 不能全部为 false）');
  }

  // ---- actions ----
  const actions: Required<CrudActions> = {
    list: true, detail: true, add: true, edit: true, remove: true, status: true,
    ...(config.actions ?? {}),
  };
  if (actions.status && !statusField) {
    fail(config, 'status 端点开启时必须声明 statusField（或 fields 中标记 status:true），或显式设置 actions.status=false');
  }
  if (actions.add && createFields.length === 0) {
    fail(config, 'add 端点开启时至少需要一个 create 字段（fields 中标记 create:true 或配置 createFields）');
  }
  if (actions.edit && updateFields.length === 0) {
    fail(config, 'edit 端点开启时至少需要一个 update 字段（fields 中标记 update:true 或配置 updateFields）');
  }

  // ---- createDefaults 校验 ----
  const createDefaults = config.createDefaults ?? null;
  if (createDefaults && typeof createDefaults === 'object') {
    for (const key of Object.keys(createDefaults)) {
      if (!IDENTIFIER_RE.test(key)) fail(config, `createDefaults 的键「${key}」不是合法的 SQL 标识符`);
      if (!fields?.[key] && !isSystemField(key)) {
        fail(config, `createDefaults 的键「${key}」未在 fields 中声明，也不是系统字段`);
      }
    }
  }
  if (createDefaults !== null && typeof createDefaults !== 'object' && typeof createDefaults !== 'function') {
    fail(config, 'createDefaults 必须是对象或函数');
  }

  // ---- 字段级默认值 ----
  const fieldDefaults: Record<string, unknown> = {};
  if (fields) {
    for (const [name, field] of Object.entries(fields)) {
      if (field.default !== undefined) fieldDefaults[name] = field.default;
    }
  }

  // ---- Zod ----
  const createSchema = config.schema?.create
    ?? (fields ? buildSchema(config, fields, createFields, 'create') : null);
  const updateSchema = config.schema?.update
    ?? (fields ? buildSchema(config, fields, updateFields, 'update') : null);

  return {
    table: config.table,
    pkField: config.pkField,
    tenantField,
    statusField,
    softDelete,
    globalTable,
    orderBy: config.orderBy ?? null,
    actions,
    createFields,
    updateFields,
    searchFields,
    filterFields,
    selectFields,
    fields,
    fieldDefaults,
    createSchema,
    updateSchema,
    unknownFields: config.unknownFields ?? 'ignore',
    label: config.name ?? config.table,
  };
}

/**
 * 请求体允许出现的字段键（snake + camel）。
 * unknownFields='reject' 时用于拒绝「模块未声明」的字段；
 * 已声明但不可写（如 create-only 字段出现在 edit）仍按安全忽略处理，写入白名单负责兜底。
 */
export function allowedRequestKeys(resolved: ResolvedCrudConfig): Set<string> {
  const keys = new Set<string>();
  const add = (name: string) => {
    const snake = toSnakeKey(name);
    keys.add(snake);
    keys.add(toCamelKey(snake));
  };
  if (resolved.fields) for (const key of Object.keys(resolved.fields)) add(key);
  for (const key of [
    ...resolved.createFields,
    ...resolved.updateFields,
    ...resolved.searchFields,
    ...resolved.filterFields,
  ]) add(key);
  add(resolved.pkField);
  add(resolved.tenantField);
  keys.add('id');
  for (const key of SYSTEM_FIELDS_LIST) add(key);
  return keys;
}

// ---- 已解析缓存：defineCrudConfig 校验一次，defineCrudModule 复用 ----
const resolvedCache = new WeakMap<object, ResolvedCrudConfig>();

export function resolveCrudConfigCached(config: CrudModuleConfig): ResolvedCrudConfig {
  const cached = resolvedCache.get(config);
  if (cached) return cached;
  const resolved = resolveCrudConfig(config);
  resolvedCache.set(config, resolved);
  return resolved;
}

/**
 * 声明配置式 CRUD 模块。
 *
 * 在模块加载（= 路由扫描/应用启动）阶段完成校验：配置非法直接抛错，应用启动失败。
 * 返回的配置对象可直接 `export const config = defineCrudConfig({...})`。
 */
export function defineCrudConfig<T extends CrudModuleConfig>(input: T): T {
  const resolved = resolveCrudConfig(input);
  resolvedCache.set(input, resolved);
  return input;
}
