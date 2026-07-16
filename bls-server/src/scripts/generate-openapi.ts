/**
 * OpenAPI 文档自动生成脚本 v2
 *
 * 三层参数提取：
 *   1. model.ts 中的 TypeScript interface → 入参/出参 schema
 *   2. config.schema (Zod) → 入参 schema
 *   3. 函数源码 AST 解析 ctx.request.body / ctx.query / ctx.params → 入参字段
 *   4. Init.sql 表结构 → 出参字段（CRUD 路由用）
 *
 * 输出 openapi.json 到 bls-server 根目录
 *
 * 使用：
 *   npx tsx src/scripts/generate-openapi.ts              # 生成 openapi.json
 *   npx tsx src/scripts/generate-openapi.ts --serve      # 生成 + 启动 Swagger UI 预览 (9090)
 */
import { readdirSync, existsSync, lstatSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import http from 'node:http';

// ====== 工具函数 ======

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function inferMethod(name: string): string {
  const lower = name.toLowerCase();
  if (['login', 'logout', 'refresh'].includes(lower)) return 'post';
  if (lower.startsWith('add') || lower.startsWith('create') || lower.startsWith('save')) return 'post';
  if (lower.startsWith('delete') || lower.startsWith('remove')) return 'delete';
  if (lower.startsWith('edit') || lower.startsWith('update')) return 'put';
  return 'get';
}

function isIgnoredFile(name: string): boolean {
  if (name === 'model.ts' || name === 'model.js') return true;
  if (name.endsWith('.routes.ts') || name.endsWith('.routes.js')) return true;
  if (name.endsWith('.controller.ts') || name.endsWith('.controller.js')) return true;
  if (name.endsWith('.service.ts') || name.endsWith('.service.js')) return true;
  if (name.endsWith('.repository.ts') || name.endsWith('.repository.js')) return true;
  if (name.startsWith('excel.')) return true;
  return false;
}

// ====== TypeScript Interface 解析器（简易） ======

interface ParsedField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  comment?: string;
}

interface ParsedInterface {
  name: string;
  fields: ParsedField[];
}

/** 解析 TypeScript interface 的字段，支持类型字面量和注释 */
function parseInterfaceFields(source: string): ParsedField[] {
  const fields: ParsedField[] = [];
  // 匹配 { 之后的字段定义，处理嵌套和联合类型
  const bodyMatch = source.match(/\{([\s\S]*?)\n\}/);
  if (!bodyMatch) return fields;

  const body = bodyMatch[1];
  // 按行解析
  const lines = body.split('\n');
  let prevComment = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // 收集注释
    const commentMatch = trimmed.match(/^\/\/\s*(.+)/);
    if (commentMatch) {
      prevComment = commentMatch[1];
      continue;
    }

    // 匹配字段: name?: type; 或 name: type;
    const fieldMatch = trimmed.match(/^(\w+)(\?)?:\s*(.+?);?\s*$/);
    if (!fieldMatch) continue;

    const [, name, optional, rawType] = fieldMatch;
    const type = cleanType(rawType);
    const required = !optional;

    fields.push({
      name,
      type,
      required,
      description: prevComment || type,
      comment: prevComment || undefined,
    });

    prevComment = '';
  }
  return fields;
}

/** 清理 TS 类型为 OpenAPI 可读格式 */
function cleanType(raw: string): string {
  return raw
    .replace(/\s*\|\s*null/g, '')
    .replace(/\s*\|\s*undefined/g, '')
    .replace(/^\((.+)\)$/, '$1')
    .trim();
}

/** TS 类型 → OpenAPI schema type */
function tsTypeToOpenApi(tsType: string): { type: string; format?: string; enum?: string[] } {
  const t = tsType.toLowerCase().trim();
  if (t === 'string') return { type: 'string' };
  if (t === 'number' || t === 'integer') return { type: 'integer' };
  if (t === 'boolean') return { type: 'boolean' };
  if (t === 'date' || t === 'datetime') return { type: 'string', format: 'date-time' };
  if (t === 'string | number' || t === 'number | string') return { type: 'string' };
  // 联合字符串字面量: '0' | '1'
  const enumMatch = tsType.match(/^['"]([^'"]+)['"]\s*\|\s*['"]([^'"]+)['"]$/);
  if (enumMatch) {
    const all = tsType.match(/['"]([^'"]+)['"]/g);
    if (all) return { type: 'string', enum: all.map((s) => s.replace(/['"]/g, '')) };
  }
  return { type: 'string' };
}

// ====== 从 model.ts 加载 interface ======

function loadModelInterfaces(modelDir: string): Map<string, ParsedInterface> {
  const interfaces = new Map<string, ParsedInterface>();
  const modelFile = join(modelDir, 'model.ts');
  if (!existsSync(modelFile)) return interfaces;

  const source = readFileSync(modelFile, 'utf-8');
  // 匹配 export interface Xxx { ... }
  const ifaceRegex = /export\s+interface\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;

  while ((match = ifaceRegex.exec(source)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields = parseInterfaceFields(`{${body}\n}`);
    interfaces.set(name, { name, fields });
  }

  return interfaces;
}

// ====== 从 Init.sql 加载表结构 ======

function loadTableColumns(sqlPath: string): Map<string, ParsedField[]> {
  const tables = new Map<string, ParsedField[]>();
  if (!existsSync(sqlPath)) return tables;

  const source = readFileSync(sqlPath, 'utf-8');
  // 匹配 CREATE TABLE `xxx` (...) 中每一列的定义
  const tableRegex = /CREATE\s+TABLE\s+`(\w+)`\s*\(([\s\S]*?)\)\s*ENGINE/g;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(source)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const fields: ParsedField[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('PRIMARY') || trimmed.startsWith('KEY') ||
          trimmed.startsWith('UNIQUE') || trimmed.startsWith('INDEX') ||
          trimmed.startsWith('FULLTEXT') || trimmed.startsWith('CONSTRAINT')) continue;

      // 匹配: `column_name` type COMMENT 'xxx'
      const colMatch = trimmed.match(/`(\w+)`\s+(\w+)(?:\([\d,]+\))?\s*(?:.*?COMMENT\s+'([^']*)')?/i);
      if (!colMatch) continue;

      const [, colName, colType, comment] = colMatch;
      const type = sqlTypeToTs(colType);

      fields.push({
        name: colName,
        type,
        required: trimmed.includes('NOT NULL'),
        description: comment || type,
      });
    }

    tables.set(tableName, fields);
  }

  return tables;
}

function sqlTypeToTs(sqlType: string): string {
  const t = sqlType.toLowerCase();
  if (['int', 'bigint', 'tinyint', 'smallint', 'mediumint'].includes(t)) return 'integer';
  if (['varchar', 'char', 'text', 'longtext', 'mediumtext', 'tinytext', 'enum', 'json'].includes(t)) return 'string';
  if (['datetime', 'timestamp', 'date', 'time'].includes(t)) return 'string';
  if (['decimal', 'float', 'double'].includes(t)) return 'number';
  return 'string';
}

// ====== 从函数源码提取 body/query 字段 ======

function extractParamsFromSource(source: string): { queryFields: ParsedField[]; bodyFields: ParsedField[] } {
  const queryFields: ParsedField[] = [];
  const bodyFields: ParsedField[] = [];

  // 1. 提取 ctx.request.body.xxx
  const bodyRefs = new Set<string>();
  const bodyRegex = /ctx\.request\.body\??\.(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = bodyRegex.exec(source)) !== null) {
    const name = m[1];
    if (!['body', 'request', 'files'].includes(name)) bodyRefs.add(name);
  }

  // 2. 提取 const b = ctx.request.body → b.xxx 模式
  const bodyAliasRegex = /(?:const|let|var)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*ctx\.request\.body/g;
  let aliasMatch: RegExpExecArray | null;
  const bodyAliases = new Set<string>();
  while ((aliasMatch = bodyAliasRegex.exec(source)) !== null) {
    bodyAliases.add(aliasMatch[1]);
  }
  for (const alias of bodyAliases) {
    const aliasRegex = new RegExp(`${alias}\\??\\.(\\w+)`, 'g');
    while ((m = aliasRegex.exec(source)) !== null) {
      const name = m[1];
      if (!['body', 'request', 'files'].includes(name)) bodyRefs.add(name);
    }
  }

  // 3. 提取解构: const { xxx, yyy } = ctx.request.body
  const destrBodyRegex = /const\s*\{([^}]+)\}\s*=\s*(?:ctx\.request\.body|ctx\.body)/g;
  while ((m = destrBodyRegex.exec(source)) !== null) {
    for (const name of m[1].split(',')) {
      bodyRefs.add(name.trim().replace(/:.*$/, '').trim());
    }
  }

  // 4. 提取 ctx.query.xxx
  const queryRefs = new Set<string>();
  const queryRegex = /(?:ctx\.(?:request\.)?query|ctx\.params)\??\.(\w+)/g;
  while ((m = queryRegex.exec(source)) !== null) {
    const name = m[1];
    if (!['query', 'params'].includes(name)) queryRefs.add(name);
  }

  // 5. 提取 const q = ctx.query → q.xxx 模式
  const queryAliasRegex = /(?:const|let|var)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(?:ctx\.(?:request\.)?query|ctx\.params)/g;
  const queryAliases = new Set<string>();
  while ((aliasMatch = queryAliasRegex.exec(source)) !== null) {
    queryAliases.add(aliasMatch[1]);
  }
  for (const alias of queryAliases) {
    const aliasRegex = new RegExp(`${alias}\\??\\.(\\w+)`, 'g');
    while ((m = aliasRegex.exec(source)) !== null) {
      const name = m[1];
      if (!['query', 'params'].includes(name)) queryRefs.add(name);
    }
  }

  const destrQueryRegex = /const\s*\{([^}]+)\}\s*=\s*(?:ctx\.(?:request\.)?query|ctx\.params)/g;
  while ((m = destrQueryRegex.exec(source)) !== null) {
    for (const name of m[1].split(',')) {
      queryRefs.add(name.trim().replace(/:.*$/, '').trim());
    }
  }

  // 6. 提取 pickAllowed 调用的字段白名单
  const pickAllowedRegex = /pickAllowed\s*\(\s*\w+\s*,\s*\[([^\]]+)\]/g;
  while ((m = pickAllowedRegex.exec(source)) !== null) {
    for (const name of m[1].split(',')) {
      bodyRefs.add(name.trim().replace(/['"]/g, ''));
    }
  }

  for (const name of bodyRefs) {
    bodyFields.push({ name, type: 'string', required: false, description: name });
  }
  for (const name of queryRefs) {
    queryFields.push({ name, type: 'string', required: false, description: name });
  }

  return { queryFields, bodyFields };
}

// ====== Zod schema → OpenAPI properties ======

function zodToProperties(schema: any): Record<string, any> | null {
  if (!schema || !schema.shape) return null;
  const props: Record<string, any> = {};
  try {
    for (const [key, def] of Object.entries(schema.shape as Record<string, any>)) {
      const zodDef = def as any;
      let prop: any = {};

      if (zodDef._def?.typeName === 'ZodString') {
        prop.type = 'string';
        if (zodDef._def?.checks) {
          for (const check of zodDef._def.checks) {
            if (check.kind === 'email') prop.format = 'email';
            if (check.kind === 'min' && check.value === 1) prop.minLength = 1;
          }
        }
      } else if (zodDef._def?.typeName === 'ZodNumber') {
        prop.type = 'number';
      } else if (zodDef._def?.typeName === 'ZodBoolean') {
        prop.type = 'boolean';
      } else if (zodDef._def?.typeName === 'ZodEnum') {
        prop.type = 'string';
        prop.enum = zodDef._def.values;
      } else if (zodDef._def?.typeName === 'ZodOptional') {
        const inner = zodDef._def.innerType;
        if (inner._def?.typeName === 'ZodString') prop.type = 'string';
        else prop.type = 'string';
      } else {
        prop.type = 'string';
      }

      if (zodDef.description) prop.description = zodDef.description;
      props[key] = prop;
    }
    return props;
  } catch {
    return null;
  }
}

// ====== 主数据结构 ======

interface RouteInfo {
  method: string;
  path: string;
  summary: string;
  tag: string;
  needAuth: boolean;
  permissions?: string[];
  queryParams: ParsedField[];
  bodyParams: ParsedField[];
  // 出参：表结构字段（用于 list 路由）
  responseFields?: ParsedField[];
}

const routes: RouteInfo[] = [];

// ====== 全局缓存 ======

const tableColumnsCache = loadTableColumns(join(__dirname, '..', '..', 'sql', 'Init.sql'));
const modelCache = new Map<string, Map<string, ParsedInterface>>();

function getModelInterfaces(apiDir: string): Map<string, ParsedInterface> {
  if (modelCache.has(apiDir)) return modelCache.get(apiDir)!;
  const interfaces = loadModelInterfaces(apiDir);
  modelCache.set(apiDir, interfaces);
  return interfaces;
}

// ====== CRUD 路由生成（从 config + model + table） ======

function addCrudRoutes(prefix: string, config: any, tag: string, apiDir: string) {
  const permPrefix = config.permPrefix ?? '';
  const pk = config.pkField ?? 'id';
  const table = config.table;
  const interfaces = getModelInterfaces(apiDir);
  const tableCols = tableColumnsCache.get(table) ?? [];

  // 找对应的 model interface
  const modelName = tag.charAt(0).toUpperCase() + tag.slice(1); // user → User
  const listIface = interfaces.get(modelName) ?? interfaces.get(capitalizeFirst(table.replace('sys_', '')));
  const createIface = interfaces.get(`Create${modelName}Input`) ?? interfaces.get(`${modelName}Input`);
  const updateIface = interfaces.get(`Update${modelName}Input`);

  // Zod schema
  const zodCreateProps = config.schema?.create ? zodToProperties(config.schema.create) : null;
  const zodUpdateProps = config.schema?.update ? zodToProperties(config.schema.update) : null;

  const crudDefs: { method: string; suffix: string; action: string; summary: string; isList: boolean }[] = [
    { method: 'get', suffix: '/list', action: 'list', summary: '分页列表查询', isList: true },
    { method: 'post', suffix: '/add', action: 'add', summary: '新增记录', isList: false },
    { method: 'put', suffix: '/edit', action: 'edit', summary: '修改记录', isList: false },
    { method: 'delete', suffix: '/remove', action: 'remove', summary: '删除记录（支持批量）', isList: false },
    { method: 'put', suffix: '/status', action: 'status', summary: '切换启用/停用状态', isList: false },
  ];

  for (const def of crudDefs) {
    const queryParams: ParsedField[] = [];
    const bodyParams: ParsedField[] = [];

    if (def.isList) {
      queryParams.push(
        { name: 'current', type: 'integer', required: false, description: '页码，默认 1' },
        { name: 'pageSize', type: 'integer', required: false, description: '每页条数，默认 10' },
      );
      if (config.searchFields?.length) {
        queryParams.push({ name: 'keyword', type: 'string', required: false, description: `关键词（${config.searchFields.join(', ')}）` });
      }
      // 从 model 的 Query interface 提取筛选字段
      const queryIface = interfaces.get(`${modelName}Query`);
      if (queryIface) {
        for (const f of queryIface.fields) {
          if (!['pageNum', 'pageSize', 'keyword'].includes(f.name)) {
            queryParams.push({ ...f, required: false });
          }
        }
      }
    }

    if (def.suffix === '/remove') {
      queryParams.push({ name: 'ids', type: 'string', required: true, description: '主键ID，批量用逗号分隔' });
    }

    if (def.suffix === '/status') {
      bodyParams.push(
        { name: pk, type: 'string', required: true, description: '主键' },
        { name: 'status', type: 'string', required: true, description: '状态值' },
      );
    }

    if (def.action === 'add') {
      // Zod schema 优先
      if (zodCreateProps) {
        for (const [k, v] of Object.entries(zodCreateProps)) {
          bodyParams.push({ name: k, type: (v as any).type ?? 'string', required: true, description: (v as any).description ?? k });
        }
      } else if (createIface) {
        bodyParams.push(...createIface.fields);
      } else {
        // 从表结构取非系统字段
        for (const col of tableCols) {
          if (!['deleted', 'create_time', 'update_time', 'create_by', 'update_by'].includes(col.name)) {
            bodyParams.push({ ...col, required: col.name === pk ? false : col.required });
          }
        }
      }
    }

    if (def.action === 'edit') {
      bodyParams.push({ name: pk, type: 'string', required: true, description: '主键' });
      if (zodUpdateProps) {
        for (const [k, v] of Object.entries(zodUpdateProps)) {
          bodyParams.push({ name: k, type: (v as any).type ?? 'string', required: false, description: (v as any).description ?? k });
        }
      } else if (updateIface || createIface) {
        const src = (updateIface ?? createIface)!;
        for (const f of src.fields) {
          if (f.name !== pk) bodyParams.push({ ...f, required: false });
        }
      } else {
        for (const col of tableCols) {
          if (!['deleted', 'create_time', 'update_time', 'create_by', 'update_by', pk].includes(col.name)) {
            bodyParams.push({ ...col, required: false });
          }
        }
      }
    }

    routes.push({
      method: def.method,
      path: `/api${prefix}${def.suffix}`,
      summary: `${config.name ?? tag} - ${def.summary}`,
      tag,
      needAuth: true,
      permissions: permPrefix ? [`${permPrefix}:${def.action}`] : undefined,
      queryParams,
      bodyParams,
      responseFields: def.isList ? tableCols : undefined,
    });
  }
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 根据函数名生成中文描述 */
function describeFunction(name: string): string {
  const map: Record<string, string> = {
    login: '用户登录（返回 accessToken + refreshToken）',
    logout: '用户登出（销毁会话）',
    refresh: '刷新 accessToken',
    profile: '获取当前用户信息',
    getStoredSession: '获取存储的会话信息',
    current: '获取当前配置',
    publicSystem: '获取公开系统配置',
    publicTheme: '获取公开主题配置',
    fetchSystemConfigs: '获取系统配置列表',
    changePassword: '修改当前用户密码',
    kick: '强制下线用户',
    rebuild: '重建索引',
    save: '保存配置',
    export: '导出数据',
    import: '导入数据',
    clean: '清理日志',
  };
  if (map[name]) return map[name];
  // 通用模式
  if (name.startsWith('get') || name.startsWith('list') || name.startsWith('find')) return `查询${name}`;
  if (name.startsWith('add') || name.startsWith('create')) return `新增${name}`;
  if (name.startsWith('edit') || name.startsWith('update')) return `修改${name}`;
  if (name.startsWith('delete') || name.startsWith('remove')) return `删除${name}`;
  return name;
}

// ====== 函数路由生成（从源码提取参数） ======

function addFunctionRoutes(prefix: string, mod: any, tag: string, apiDir: string) {
  const interfaces = getModelInterfaces(apiDir);

  for (const key of Object.keys(mod)) {
    if (key === 'default' || key === 'config' || key === 'Router') continue;
    const fn = mod[key];
    if (typeof fn !== 'function') continue;
    if (/^[A-Z]/.test(key)) continue;

    const method = inferMethod(key);
    const path = `/api${prefix}/${camelToKebab(key)}`;
    const noAuth = key.startsWith('public') || key.startsWith('Public') || key === 'login' || key === 'logout' || key === 'refresh';
    const fnSource = fn.toString();

    const { queryFields, bodyFields } = extractParamsFromSource(fnSource);

    // 尝试匹配 interface：函数名 → model interface
    // 例如 login → LoginInput, getUserList → UserQuery
    const matchedIface = findMatchingInterface(key, interfaces);
    const queryParams = matchedIface?.query ?? queryFields;
    const bodyParams = matchedIface?.body ?? bodyFields;

    routes.push({
      method,
      path,
      summary: `${tag} - ${describeFunction(key)}`,
      tag,
      needAuth: !noAuth,
      queryParams,
      bodyParams,
    });
  }
}

function findMatchingInterface(
  fnName: string,
  interfaces: Map<string, ParsedInterface>,
): { query: ParsedField[]; body: ParsedField[] } | null {
  // 尝试匹配: login → LoginInput / LoginParams
  const nameVariants = [
    capitalizeFirst(fnName) + 'Input',
    capitalizeFirst(fnName) + 'Params',
    capitalizeFirst(fnName) + 'Query',
    fnName.charAt(0).toUpperCase() + fnName.slice(1),
    fnName,
  ];

  for (const variant of nameVariants) {
    const iface = interfaces.get(variant);
    if (iface) {
      // 根据字段名判断是 query 还是 body
      const isQuery = variant.endsWith('Query') || variant.endsWith('Params') || iface.name.endsWith('Query');
      return isQuery
        ? { query: iface.fields, body: [] }
        : { query: [], body: iface.fields };
    }
  }

  return null;
}

// ====== Router 路由解析 ======

function addRouterRoutes(prefix: string, router: any, tag: string, apiDir: string) {
  const stack = router?.stack ?? [];
  const interfaces = getModelInterfaces(apiDir);

  // 检测 Router 自身的 prefix（如 new Router({ prefix: '/system/user' })）
  const routerPrefix = router?.opts?.prefix ?? '';
  // 如果 Router 已有自己的 prefix，就用 Router 的 prefix，不再重复拼接
  const effectivePrefix = routerPrefix ? '/api' : `/api${prefix}`;

  for (const layer of stack) {
    if (!layer.path || !layer.methods?.length) continue;
    // koa-router: GET 路由 methods = ['HEAD', 'GET']，取最后一个非 HEAD/OPTIONS 的
    const methods: string[] = layer.methods.map((m: string) => m.toLowerCase());
    const method = methods.find((m: string) => m !== 'head' && m !== 'options') ?? methods[0];
    if (!method || method === 'head' || method === 'options') continue;

    const fullPath = layer.path === '/'
      ? effectivePrefix
      : effectivePrefix + layer.path;
    const perms = extractPerms(layer.stack);

    // 从中间件源码提取参数
    let queryFields: ParsedField[] = [];
    let bodyFields: ParsedField[] = [];
    for (const item of (layer.stack ?? [])) {
      const src = item?.toString?.() ?? '';
      const extracted = extractParamsFromSource(src);
      queryFields.push(...extracted.queryFields);
      bodyFields.push(...extracted.bodyFields);
    }
    // 去重
    queryFields = dedupFields(queryFields);
    bodyFields = dedupFields(bodyFields);

    // 尝试从 model interface 匹配
    const routeName = layer.path.replace(/^\//, '').replace(/\//g, '_');
    const matched = findMatchingInterface(routeName, interfaces);
    if (matched) {
      if (matched.query.length) queryFields = matched.query;
      if (matched.body.length) bodyFields = matched.body;
    }

    routes.push({
      method,
      path: fullPath,
      summary: `${tag} - ${describeRoute(method, layer.path, tag)}`,
      tag,
      needAuth: hasAuth(layer.stack),
      permissions: perms.length ? perms : undefined,
      queryParams: queryFields,
      bodyParams: bodyFields,
    });
  }
}

/** 根据 HTTP 方法和路径生成中文描述 */
function describeRoute(method: string, path: string, tag: string): string {
  const lastSeg = path.replace(/\/$/, '').split('/').pop() ?? path;
  // 已知路径 → 完整中文描述（不拼接 method）
  const fullMap: Record<string, string> = {
    add: '新增记录',
    edit: '修改记录',
    remove: '删除记录',
    list: '分页列表',
    profile: '个人信息',
    changePassword: '修改密码',
    kick: '强制下线',
    status: '切换状态',
    sessions: '在线会话',
    current: '当前配置',
    clean: '清理日志',
    rebuild: '重建索引',
    export: '导出数据',
    import: '导入数据',
    save: '保存配置',
    menus: '菜单分配',
  };
  if (fullMap[lastSeg]) return fullMap[lastSeg];
  // 通用 fallback
  const methodMap: Record<string, string> = { get: '查询', post: '提交', put: '修改', delete: '删除' };
  return `${methodMap[method] ?? method} ${lastSeg}`;
}

/** 模块名 → 中文标签 */
function tagDescription(tag: string): string {
  const map: Record<string, string> = {
    auth: '认证授权',
    user: '用户管理',
    role: '角色管理',
    menu: '菜单管理',
    dept: '部门管理',
    config: '系统参数',
    dict: '字典管理',
    tenant: '租户管理',
    package: '套餐管理',
    theme: '主题配置',
    log: '日志中心',
    security: '安全中心',
    storage: '存储配置',
    'page-config': '页面配置',
    'global-search': '全局搜索',
    webhook: 'Webhook',
    excel: 'Excel 导入导出',
    job: '异步任务',
    dashboard: '仪表盘',
    realtime: '实时通信',
  };
  return map[tag] ?? tag;
}

function dedupFields(fields: ParsedField[]): ParsedField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
}

function extractPerms(stack: any[]): string[] {
  if (!stack) return [];
  const perms: string[] = [];
  for (const item of stack) {
    const fnStr = item?.toString?.() ?? '';
    const match = fnStr.match(/hasPerm\(['"]([^'"]+)['"]\)/g);
    if (match) {
      for (const m of match) {
        const perm = m.match(/['"]([^'"]+)['"]/)?.[1];
        if (perm) perms.push(perm);
      }
    }
  }
  return perms;
}

function hasAuth(stack: any[]): boolean {
  if (!stack) return false;
  for (const item of stack) {
    const fnStr = item?.toString?.() ?? '';
    if (fnStr.includes('jwtAuth') || fnStr.includes('Auth')) return true;
  }
  return false;
}

// ====== 主扫描逻辑 ======

function scan(baseDir: string, currentDir: string) {
  if (!existsSync(currentDir)) return;
  const entries = readdirSync(currentDir);
  const relPath = relative(baseDir, currentDir).replace(/\\/g, '/');
  const prefix = '/' + relPath;
  const tag = relPath.split('/').pop() ?? relPath;

  const indexFile = entries.find((f) => f === 'index.ts' || f === 'index.js');

  if (indexFile) {
    try {
      const mod = require(join(currentDir, indexFile));

      // 1. Router 导出
      if (mod.default?.routes && mod.default?.allowedMethods) {
        const mixedCfg = mod.config ?? (mod.default?.table && mod.default?.pkField ? mod.default : null);
        if (mixedCfg?.table && mixedCfg?.pkField) {
          addRouterRoutes(prefix, mod.default, tag, currentDir);
          addCrudRoutes(prefix, mixedCfg, tag, currentDir);
        } else {
          addRouterRoutes(prefix, mod.default, tag, currentDir);
        }
        return;
      }

      // 2. config 导出
      if (mod.config?.table && mod.config?.pkField) {
        addCrudRoutes(prefix, mod.config, tag, currentDir);
      }

      // 3. 函数导出
      addFunctionRoutes(prefix, mod, tag, currentDir);
    } catch (e: any) {
      console.warn(`[openapi] skip ${indexFile}: ${e.message}`);
    }
  }

  for (const entry of entries) {
    if (entry === 'index.ts' || entry === 'index.js') continue;
    if (isIgnoredFile(entry)) continue;
    const fullPath = join(currentDir, entry);
    try {
      if (lstatSync(fullPath).isDirectory() && !entry.startsWith('.') && !entry.startsWith('_') && entry !== '__tests__') {
        scan(baseDir, fullPath);
      }
    } catch { /* skip */ }
  }
}

// ====== 生成 OpenAPI JSON ======

function buildOpenApiDoc(): object {
  routes.sort((a, b) => {
    if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
    return a.path.localeCompare(b.path);
  });

  const paths: Record<string, any> = {};
  const schemas: Record<string, any> = {};

  for (const r of routes) {
    const normalizedPath = r.path.replace(/:(\w+)/g, '{$1}');
    const method = r.method.toLowerCase();

    if (!paths[normalizedPath]) paths[normalizedPath] = {};

    const operation: any = {
      tags: [r.tag],
      summary: r.summary,
      operationId: `${r.method}_${normalizedPath.replace(/[/{}]/g, '_').replace(/^_/, '').replace(/__+/g, '_')}`,
      responses: {
        '200': {
          description: '成功',
          content: {
            'application/json': {
              schema: buildResponseSchema(r),
            },
          },
        },
        '400': { description: '参数错误' },
      },
    };

    if (r.needAuth) {
      operation.security = [{ BearerAuth: [] }];
      operation.responses['401'] = { description: '未授权' };
    }
    if (r.permissions?.length) {
      operation.description = `所需权限: ${r.permissions.join(', ')}`;
    }

    // 入参：query parameters
    if (r.queryParams?.length) {
      operation.parameters = r.queryParams.map((p) => ({
        name: p.name,
        in: 'query',
        required: p.required,
        schema: tsTypeToOpenApi(p.type),
        description: p.description || p.name,
      }));
    }

    // 入参：request body
    if (r.bodyParams?.length) {
      const props: Record<string, any> = {};
      const required: string[] = [];
      for (const p of r.bodyParams) {
        props[p.name] = {
          ...tsTypeToOpenApi(p.type),
          description: p.description || p.name,
        };
        if (p.required) required.push(p.name);
      }

      const schemaName = `${r.tag}_${r.method}_${normalizedPath.replace(/[/{}]/g, '_').replace(/_+/g, '_')}`;
      schemas[schemaName] = { type: 'object', properties: props, required: required.length ? required : undefined };

      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      };
    }

    paths[normalizedPath][method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'BLS-KOX API',
      version: '1.0.0',
      description: [
        'BLS-KOX 多租户后台管理系统 API 文档',
        '',
        '## 认证',
        '在请求头添加 `Authorization: Bearer <token>`',
        '登录接口获取 token：`POST /api/auth/login`',
        '',
        '## 默认账号',
        '- 账号: `superadmin`  密码: `123456`  租户: `000000`',
        '- 账号: `admin`       密码: `123456`  租户: `100000`',
      ].join('\n'),
      contact: { name: 'BLS-KOX', url: 'https://github.com/npcxl/BLS-KOX' },
    },
    servers: [
      { url: 'http://localhost:6001', description: '本地开发' },
      { url: '/api', description: 'Nginx 反代（生产）' },
    ],
    paths,
    components: {
      schemas,
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '登录获取的 accessToken',
        },
      },
    },
    tags: [...new Set(routes.map((r) => r.tag))].sort().map((t) => ({ name: t, description: tagDescription(t) })),
  };
}

function buildResponseSchema(r: RouteInfo): any {
  const props: Record<string, any> = {
    code: { type: 'integer', example: 200 },
    message: { type: 'string', example: '操作成功' },
  };

  if (r.responseFields?.length) {
    // 列表路由：data 是数组
    const itemProps: Record<string, any> = {};
    for (const f of r.responseFields) {
      itemProps[f.name] = { ...tsTypeToOpenApi(f.type), description: f.description || f.name };
    }
    props.data = { type: 'array', items: { type: 'object', properties: itemProps } };
    props.total = { type: 'integer', example: 100 };
  } else if (r.bodyParams?.length) {
    // 写操作：data 可能是对象
    props.data = { type: 'object', description: '响应数据' };
  } else {
    props.data = { type: 'object', description: '响应数据' };
  }

  return { type: 'object', properties: props };
}

// ====== Swagger UI HTML ======

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BLS-KOX API 文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { background-color: #1677ff; }
    .swagger-ui .topbar .download-url-wrapper .select-label { color: #fff; }
    .swagger-ui .info .title { font-size: 24px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: -1,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;

// ====== 主入口 ======

const API_DIR = join(__dirname, '..', 'api');
const OUTPUT_FILE = join(__dirname, '..', '..', 'openapi.json');

console.log('[openapi] scanning API directory...');
console.log(`[openapi] loaded ${tableColumnsCache.size} table schemas from Init.sql`);
scan(API_DIR, API_DIR);

const doc = buildOpenApiDoc();
writeFileSync(OUTPUT_FILE, JSON.stringify(doc, null, 2), 'utf-8');

const tagCount = (doc as any).tags.length;
const schemaCount = Object.keys((doc as any).components.schemas).length;
console.log(`[openapi] generated ${OUTPUT_FILE}`);
console.log(`[openapi] ${routes.length} routes, ${tagCount} tags, ${schemaCount} request schemas`);

// 按 tag 统计
const tagStats: Record<string, number> = {};
for (const r of routes) {
  tagStats[r.tag] = (tagStats[r.tag] ?? 0) + 1;
}
for (const [tag, count] of Object.entries(tagStats)) {
  console.log(`  ${tag}: ${count} routes`);
}

// --serve 模式：启动 HTTP 服务器预览
if (process.argv.includes('--serve')) {
  const PORT = parseInt(process.env.OPENAPI_PORT ?? '9090', 10);
  const server = http.createServer((req, res) => {
    if (req.url === '/api/openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(doc, null, 2));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SWAGGER_HTML);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n[openapi] Swagger UI: http://localhost:${PORT}`);
    console.log('[openapi] Press Ctrl+C to stop');
  });
}
