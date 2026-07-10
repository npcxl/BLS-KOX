# BLS 系统文档

BLS 是一套面向多租户企业管理场景的后台系统，由 `bls-admin`（前端，基于 Ant Design Pro + TypeScript）和 `bls-server`（后端，基于 Koa + TypeScript + MySQL / Kysely）组成。

核心能力：多租户数据隔离、RBAC 权限控制、泛型 CRUD 快速生成、Excel 导入导出、WebSocket 实时能力、页面动态配置。

---

## 1. 后端核心模块（动态配置）

### 1.1 `defineCrudModule` — 泛型 CRUD 工厂

**文件**：`bls-server/src/core/crud.ts`

只需一个配置对象即可生成完整的增删查改接口，自动包含租户隔离、软删除、权限校验。

```ts
import { defineCrudModule } from '../../core/crud';
export default defineCrudModule({
  prefix: '/system/role',       // 路由前缀
  table: 'sys_role',            // 数据库表名
  pkField: 'role_id',           // 主键字段
  searchFields: ['role_name'],  // 关键字搜索字段
  name: '角色',                 // 模块中文名（日志使用）
});
```

**自动生成的接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/list` | 分页列表查询 |
| `GET` | `/:id` | 获取单条详情 |
| `POST` | `/add` | 新增记录 |
| `PUT` | `/edit` | 编辑记录 |
| `DELETE` | `/remove` | 删除记录（支持软删除/批量） |
| `PUT` | `/status` | 状态切换 |

**配置项 `CrudModuleConfig`**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prefix` | `string` | 自动推导 | 路由前缀，如 `/system/role` |
| `table` | `string` | **必填** | 数据库表名 |
| `pkField` | `string` | **必填** | 主键字段名 |
| `tenantField` | `string` | `'tenant_id'` | 租户字段名 |
| `statusField` | `string` | `'status'` | 状态字段名 |
| `softDelete` | `boolean` | `true` | 是否软删除（设置 `deleted=1`） |
| `searchFields` | `string[]` | `[]` | 关键字搜索字段 |
| `name` | `string` | - | 模块中文名 |
| `permPrefix` | `string` | - | 权限前缀，如 `system:role` |
| `schema` | `{ create?, update? }` | - | Zod 校验 Schema |

**内置行为**：
- 自动按 `tenant_id` 隔离数据
- 自动处理 `snake_case` ↔ `camelCase` 转换
- 支持 `keyword` 模糊搜索 + 字段精确过滤
- 主键自动生成 Snowflake ID
- 分页参数 `pageNum` / `pageSize`（最大 100 条/页）

### 1.2 自动路由注册 `createRouter`

**文件**：`bls-server/src/core/router.ts`

**特性**：
- 自动扫描 `api/` 目录，无需手动注册路由
- 文件名自动映射为 HTTP 方法和路径（驼峰 → kebab）
  - `getList` → `GET /list`
  - `addUser` → `POST /add-user`
  - `removeItem` → `DELETE /remove-item`
- 导出 `config` 对象的模块自动调用 `defineCrudModule`
- 自动包裹 `jwtAuth()` 中间件，`public*` / `login` 等方法除外
- 统一 `snake_case` → `camelCase` 响应

### 1.3 统一响应封装

**文件**：`bls-server/src/core/response.ts`

```ts
// 普通成功响应
success(ctx, data, '操作成功');
// => { code: 200, message: '操作成功', data: ... }

// 分页响应
pageSuccess(ctx, rows, total, '查询成功');
// => { code: 200, message: '查询成功', data: [...], total: 100 }
```

### 1.4 错误体系

**文件**：`bls-server/src/core/errors.ts`

| 类名 | HTTP 状态码 | 说明 |
|------|-------------|------|
| `AppError` | 500 | 通用应用错误基类 |
| `UnauthorizedError` | 401 | 未登录/登录过期 |
| `SessionInvalidError` | 401 (code: 40101) | 会话失效 |
| `ForbiddenError` | 403 | 无访问权限 |
| `NotFoundError` | 404 | 资源不存在 |
| `ValidationError` | 400 | 参数校验错误（支持 Zod issues） |

### 1.5 数据库访问

**文件**：`bls-server/src/core/database.ts`

- **双连接池**：`pool`（传统 SQL）+ `getDb()`（Kysely，新业务优先）
- `getDb()` — 获取 Kysely 实例（单例，自动包装重试机制）
- `query<T>(sql, params)` — 执行查询返回 `T[]`
- `queryOne<T>(sql, params)` — 查询单条记录
- `execute(sql, params)` — 执行写操作
- `transaction(runner)` — 事务执行，自动 commit/rollback
- **自动重试**：遇到 `ECONNRESET` 等连接错误自动重试（最多 3 次，指数退避）

### 1.6 审计日志

**文件**：`bls-server/src/core/audit.ts`

| 函数 | 说明 |
|------|------|
| `getAuditActor(ctx)` | 从 Koa 上下文提取操作者信息 |
| `writeOperationLog(input)` | 写入操作日志（`sys_operation_log`） |
| `writeUploadAudit(input)` | 写入上传审计日志（`sys_upload_audit`） |
| `writeLoginLog(input)` | 写入登录日志（`sys_login_log`） |

### 1.8 复杂业务模块编写方式

当简单配置不够用（树形结构、多表关联、自定义查询逻辑等），有两种方式：

#### 方式 A：混合模式（推荐）—— 同时导出 config + Router

**同时导出** `config` 对象和自定义 `Router`，自定义 Router 中的路由优先匹配（可覆盖标准 CRUD），未覆盖的标准路由由 `defineCrudModule` 自动兜底。

```ts
// bls-server/src/api/system/dept/index.ts
import Router from 'koa-router';
import { getDb, generateSnowflakeId, getCurrentTenantId, jwtAuth, hasPerm } from '...';

// 导出自定义 Router（覆盖 GET /list 返回树形数据）
const router = new Router({ prefix: '/system/dept' });
const T = 'sys_dept';

function buildTree(rows: any[]) { /* ... */ }

// 自定义 GET /list → 覆盖默认 CRUD 的 /list，返回树形数据
router.get('/list', jwtAuth(), hasPerm('system:dept:list'), async (ctx) => {
  const rows = await (await getDb()).selectFrom(T).selectAll()
    .where('deleted', '=', 0).orderBy('sort_num', 'asc').execute();
  ctx.body = { code: 200, data: buildTree(rows) };
});

export default router;

// 导出 config → POST /add、PUT /edit、DELETE /remove、PUT /status 自动生成
export const config = {
  table: 'sys_dept',
  pkField: 'dept_id',
  searchFields: ['dept_name'],
  name: '部门',
  permPrefix: 'system:dept',
};
```

**规则**：自定义 Router 先挂载（优先匹配），CRUD 后挂载（兜底）。

| 路由 | 来源 |
|------|------|
| `GET /list` → 树形数据 | 自定义 Router（覆盖） |
| `POST /add` | defineCrudModule（自动生成） |
| `PUT /edit` | defineCrudModule（自动生成） |
| `DELETE /remove` | defineCrudModule（自动生成） |
| `PUT /status` | defineCrudModule（自动生成） |

> 也就是说，你只需要写需要定制的路由，其余的 CRUD 接口自动补全。

#### 方式 B：纯自定义模式 —— 只导出 Router（不导出 config）

如果你的模块逻辑完全自定义，不需要任何标准 CRUD，就**只导出 Router** 不放 `config`。

---

以下按常见场景介绍具体写法，**推荐使用方式 A（混合模式）**。

#### 模式一：树形结构（覆盖 GET /list）

**典型场景**：部门、菜单等需要返回树形数据。使用混合模式，只覆盖 `GET /list`。

**树构建函数**（在应用层构建，O(n) 复杂度）：

```ts
function buildTree(rows: any[]) {
  const get = (r: any, k: string, ck: string) => String(r[ck] ?? r[k] ?? '');
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const r of rows) {
    map.set(get(r, 'dept_id', 'deptId'), {
      deptId: get(r, 'dept_id', 'deptId'),
      parentId: get(r, 'parent_id', 'parentId'),
      deptName: r.deptName ?? r.dept_name,
      sortNum: r.sortNum ?? r.sort_num,
      status: r.status,
      children: [],
    });
  }
  map.forEach((node) => {
    if (node.parentId === '0' || !map.has(node.parentId)) roots.push(node);
    else map.get(node.parentId).children.push(node);
  });
  return roots;
}

#### 模式二：多表关联操作（角色-菜单分配）

**典型场景**：角色管理中存在 `sys_role` ↔ `sys_role_menu` 的多对多关系。

```ts
const router = new Router({ prefix: '/system/role' });
const T = 'sys_role', RM = 'sys_role_menu';

// 获取角色已分配的菜单
router.get('/:roleId/menus', jwtAuth(), hasPerm('system:role:list'), async (ctx) => {
  const rows = await (await getDb()).selectFrom(RM).select('menu_id')
    .where('role_id', '=', ctx.params.roleId).execute();
  ctx.body = { code: 200, data: rows.map((r: any) => r.menu_id) };
});

// 分配菜单：先删后插（原子操作）
router.put('/:roleId/menus', jwtAuth(), hasPerm('system:role:assignMenu'), async (ctx) => {
  const db = await getDb();
  const roleId = ctx.params.roleId;
  const menuIds: string[] = ctx.request.body?.menuIds ?? [];

  await db.deleteFrom(RM).where('role_id', '=', roleId).execute();       // 清空旧关联
  if (menuIds.length > 0) {
    await db.insertInto(RM)
      .values(menuIds.map(id => ({ role_id: roleId, menu_id: id })))
      .execute();                                                        // 批量插入新关联
  }
  ctx.body = { code: 200, message: '分配成功' };
});
```

**关键点**：
- 使用 Restful 子资源路由 `/:roleId/menus`
- 多对多关系采用"先删后插"模式
- 批量插入使用 `Array.map` 生成多条 values
- **别忘了也导出 `config`**，这样 `GET /list`、`POST /add` 等标准 CRUD 自动生成

#### 模式三：动态列配置驱动搜索

**典型场景**：搜索字段不硬编码，而是从 `sys_page_column_config` 表加载 `searchable=1` 的字段。

```ts
router.get('/list', jwtAuth(), hasPerm('system:role:list'), async (ctx) => {
  const db = await getDb();
  const q = ctx.query as any;
  const p = Math.max(1, +q.pageNum || 1);
  const s = Math.min(100, +q.pageSize || 10);

  let b = db.selectFrom('sys_role').selectAll().where('deleted', '=', 0);
  const tid = getCurrentTenantId();
  if (tid) b = b.where('tenant_id', '=', tid);

  // 从动态列配置加载可搜索字段
  const searchCols = await db.selectFrom('sys_page_column_config')
    .select('data_index')
    .where('page_code', '=', 'system_role')
    .where('searchable', '=', 1)
    .where('deleted', '=', 0)
    .execute();
  const searchFields = searchCols.map((c: any) =>
    c.data_index.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase())
  );

  // keyword 模糊搜索：OR 拼接所有 searchable 字段
  if (q.keyword) {
    if (searchFields.length) {
      b = b.where((eb: any) =>
        eb.or(searchFields.map((f: string) => eb(f, 'like', `%${q.keyword}%`)))
      );
    } else {
      // 回退到硬编码字段
      b = b.where((eb: any) =>
        eb.or(['role_name', 'role_key'].map((f) => eb(f, 'like', `%${q.keyword}%`)))
      );
    }
  }

  // searchable=1 的字段自动支持精确 = 过滤
  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(
        field.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()),
        '=',
        String(q[field])
      );
    }
  }

  const countRow = await b.clearSelect()
    .select((eb: any) => eb.fn.countAll().as('total'))
    .executeTakeFirst();

  ctx.body = {
    code: 200,
    data: await b.orderBy('sort_num', 'asc').limit(s).offset((p - 1) * s).execute(),
    total: Number(countRow?.total ?? 0),
  };
});
```

**关键点**：
- 搜索字段来自数据库配置，页面配置人员无需改代码即可调整
- `camelCase` 自动转 `snake_case` 匹配数据库列名
- 有 fallback 机制防止配置为空
- **也导出 `config`**，这样除了自定义的 `GET /list`，其余 CRUD 自动生成

#### 模式四：Excel 导入导出

**典型场景**：使用 `exceljs` 库实现模板下载、数据导出和批量导入。

```ts
// 1. 注册数据实体映射
const EXCEL_METAS: Record<string, { tableName: string; pageCode: string }> = {
  'system-user': { tableName: 'sys_user', pageCode: 'system_user' },
  'system-role': { tableName: 'sys_role', pageCode: 'system_role' },
  // ... 更多实体
};

// 2. 导出：POST /common/excel/export
//    - 根据 metaKey 查配置表获取列信息
//    - 字典值自动转中文标签
//    - 支持 keyword 搜索过滤 + 导出条数限制

// 3. 模板下载：GET /common/excel/template
//    - 自动生成含字典下拉验证的 Excel 模板
//    - 必填列标红、下拉列显示可选值

// 4. 导入：POST /common/excel/import
//    - 上传 .xlsx 文件，按列标题匹配字段
//    - 字典列中文标签自动转原始值
//    - 自动去重（同名记录存在则更新，否则新增）
//    - 返回 successCount / failedCount / errorRows
```

**前端只需传 `excelMetaKey`**，`CrudTablePage` 自动渲染导入导出工具栏：

```tsx
<CrudTablePage<OrderRow>
  excelMetaKey="orders"   // 对应后端的 EXCEL_METAS 注册
  ...
/>
```

#### 模式五：自定义 Service 层

对于特别复杂的业务逻辑，可以按以下结构拆分：

```
api/
└── system/
    └── order/
        ├── index.ts          # Router 定义（路由 + 中间件）
        ├── order.model.ts    # 类型定义（DTO、分页请求等）
        ├── order.service.ts  # 业务逻辑（多表事务、复杂校验）
        └── order.repository.ts # 数据访问（Kysely 查询）
```

**index.ts 示例**：
```ts
import { addOrder, listOrders } from './order.service';

router.post('/add', jwtAuth(), hasPerm('order:add'), async (ctx) => {
  const result = await addOrder(ctx.request.body, getCurrentTenantId());
  ctx.body = { code: 200, data: result };
});
```

**关键点**：
- Router 文件负责路由 + 中间件 + 返回格式
- Service 文件负责业务逻辑和数据校验
- Repository 文件负责纯数据库查询

#### 选择指南

| 场景 | 方案 |
|------|------|
| 标准单表 CRUD | 只导出 `config`（纯配置，全自动） |
| 自定义某个接口（如 list 返回树） | **混合模式**：导出 `config` + `Router`（只写需要覆盖的） |
| 自定义接口 + 标准 CRUD 都要 | **混合模式**：导出 `config` + `Router` |
| 完全自定义（不需要标准 CRUD） | 只导出 `Router`（不导出 `config`） |
| 导入导出 | 注册 `EXCEL_METAS` + ExcelJS |
| 复杂业务流程 | Router + Service + Repository 分层 |

## 2. 前端核心组件

### 2.1 `CrudTablePage` — 泛型 CRUD 表格页面

**文件**：`bls-admin/src/components/CrudTablePage/index.tsx`

最重要的业务组件，整合了 ProTable + BetaSchemaForm，一个组件覆盖"列表 + 新增/编辑弹窗 + 删除 + 状态切换 + 批量删除 + 导入导出"。

**最简用法**：

```tsx
export default function OrderPage() {
  return (
    <CrudTablePage<OrderRecord>
      title="订单管理"
      rowKey="id"
      resource={{ basePath: '/api/business/orders' }}
      columns={columns}
      formColumns={formColumns}
    />
  );
}
```

**完整 Props**：

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | `string` | **必填** | 页面标题 |
| `rowKey` | `keyof T` | **必填** | 主键字段 |
| `resource` | `CrudResource` | **必填** | 接口资源对象 `{ basePath: '/api/xxx' }` |
| `columns` | `ProColumns<T>[]` | **必填** | 表格列定义 |
| `formColumns` | `ProFormColumnsType<T>[]` | **必填** | 表单列定义 |
| `columnConfig` | `CrudTablePageColumnConfig<T>[]` | - | 列可见/可搜索控制 |
| `statusKey` | `keyof T` | `'status'` | 状态字段 |
| `createButtonText` | `string` | `'新增'` | 新增按钮文本 |
| `showCreateButton` | `boolean` | `true` | 是否显示新增按钮 |
| `showEditAction` | `boolean` | `true` | 是否显示编辑操作 |
| `showFormModal` | `boolean` | `true` | 是否显示表单弹窗 |
| `modalWidth` | `number` | `640` | 弹窗宽度 |
| `embedded` | `boolean` | `false` | 内嵌模式（不包裹 PageContainer） |
| `defaultSearchMode` | `'fuzzy' \| 'exact'` | `'fuzzy'` | 默认搜索模式 |
| `showSearchModeToggle` | `boolean` | `true` | 显示搜索模式切换 |
| `permissions` | `object` | - | 权限控制 `{ create?, edit?, remove?, status?, import?, export? }` |
| `excelMetaKey` | `string` | - | Excel 导入导出元键 |
| `beforeSubmit` | `(values, current?) => Partial<T>` | - | 提交前数据转换 |
| `onSaved` | `(mode, values, current?) => void` | - | 保存成功回调 |
| `extraActions` | `(record: T) => ReactNode[]` | - | 额外操作按钮 |
| `toolbarExtra` | `ReactNode[]` | - | 工具栏额外节点 |
| `pagination` | `false \| object` | `{ defaultPageSize: 10, showSizeChanger: true }` | 分页配置 |
| `scroll` | `{ x?, y? }` | - | 表格滚动 |
| `expandable` | `object` | - | 展开行配置 |
| `formGrid` | `boolean` | `true` | 表单网格布局 |
| `formColProps` | `object` | `{ xs: 24, md: 12 }` | 表单项栅格 |

**内置智能处理**：
- **valueEnum 列**自动用 `<Tag>` 渲染（而非默认 Badge 圆点）
- **状态切换**：valueEnum >= 2 个值时，操作列显示循环切换按钮
- **表单归一化**：
  - `switch` 类型 → 自动转换 0/1 为 boolean
  - JSON 字段（`xxxJson` + textarea）→ 自动格式化缩进
  - `select/treeSelect` 多选 → 字符串按逗号拆分为数组
  - 单选 select → 值统一转字符串
- **批量删除**：自动开启行选择 + 底部批量操作栏
- **权限控制**：通过 `usePermission` 控制各按钮显隐
- **搜索模式**：模糊模式合并所有字段为 `keyword`，精确模式按字段原样传参

### 2.2 `ExcelToolbar` — 导入导出工具栏

**文件**：`bls-admin/src/components/ExcelToolbar/index.tsx`

| 属性 | 类型 | 说明 |
|------|------|------|
| `metaKey` | `string` | Excel 元键，标识数据实体 |
| `queryParams` | `Record<string, any>` | 导出时的查询参数 |

**功能**：
- 下载模板 → `GET /api/common/excel/template`
- 导出数据 → `POST /api/common/excel/export`（支持全部/自定义条数）
- 导入数据 → `POST /api/common/excel/import`（拖拽上传 .xlsx/.xls）
- 导入结果展示成功/失败统计和错误详情

### 2.3 `ErrorBoundary` — 错误边界

**文件**：`bls-admin/src/components/ErrorBoundary/index.tsx`

```tsx
<ErrorBoundary>
  <YourPage />
</ErrorBoundary>
```

- 捕获子组件渲染错误，显示友好错误页面
- 区分 ChunkLoadError（JS 分片加载失败）和普通渲染错误
- Chunk 错误离线检测：网络恢复时自动重试
- 提供 Retry、Reload、Back Home 操作

### 2.4 `IconPicker` — 图标选择器

**文件**：`bls-admin/src/components/IconPicker/index.tsx`

```tsx
<IconPicker value={iconName} onChange={setIcon} />
```

| 属性 | 类型 | 说明 |
|------|------|------|
| `value` | `string` | 当前图标名 |
| `onChange` | `(value?: string) => void` | 值变化回调 |
| `placeholder` | `string` | 占位文本 |
| `trigger` | `ReactNode` | 自定义触发器 |

功能：搜索 Ant Design Outlined 图标，网格展示，支持清空和确认。

### 2.5 `FileUploadModal` — 文件上传弹窗

**文件**：`bls-admin/src/components/FileUploadModal/index.tsx`

```tsx
<FileUploadModal
  open={open}
  onOpenChange={setOpen}
  onUploaded={(res) => console.log(res)}
  accept="image/*"
/>
```

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `open` | `boolean` | **必填** | 弹窗开关 |
| `onOpenChange` | `(open: boolean) => void` | **必填** | 开关回调 |
| `onUploaded` | `(res: any) => void` | - | 上传成功回调 |
| `uploadUrl` | `string` | `/api/system/storage/upload` | 上传接口 |
| `accept` | `string` | - | 文件类型限制 |
| `extraData` | `Record<string, string>` | - | 额外参数 |

### 2.6 `RichTextEditor` — 富文本编辑器

**文件**：`bls-admin/src/components/RichTextEditor/index.tsx`

基于 wangeditor，支持受控/非受控模式、图片上传、只读模式。

### 2.7 其他组件

| 组件 | 说明 |
|------|------|
| `GlobalRealtimeProvider` | 全局 WebSocket 实时连接提供者 |
| `DashboardRealtimeCard` | 实时看板卡片组件 |
| `OfflineBanner` | 离线状态提示横幅 |
| `VersionDropdown` | 版本切换下拉 |

### 2.8 `GlobalSearchModal` — 全局搜索

> **入口**：顶部导航栏右侧 **🔍 搜索图标**（或快捷键 `Ctrl + K`）
>
> **后端文件**：`bls-server/src/api/system/global-search/index.ts`
> **前端文件**：`bls-admin/src/components/RightContent/GlobalSearchModal.tsx`

全局搜索支持跨模块模糊搜索，覆盖用户、角色、菜单、部门、字典、系统参数、租户、套餐、页面配置、文件管理、登录日志、操作日志等模块。

**使用方式**：
1. 点击顶部搜索图标或按 `Ctrl + K`
2. 输入关键字（至少 2 个字符）
3. 自动按模块分组展示匹配结果
4. 点击结果项跳转到对应页面

**数据来源**：`sys_search_index` 统一索引表，通过数据源表实时同步。

**索引管理**：系统参数页 → 工具栏「重建索引」→ 勾选需要重建的模块（默认全选）→ 开始重建。

**重建流程**：
```
系统参数 → 点击 [重建索引] → 弹窗勾选模块 → 开始重建
→ 从业务表重新读取数据 → REPLACE INTO sys_search_index → 完成
```

**后端接口**：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/system/global-search/search?keyword=xxx` | 搜索索引 |
| `GET` | `/api/system/global-search/index/modules` | 获取可用模块列表 |
| `POST` | `/api/system/global-search/index/rebuild` | 重建索引 `{ moduleKeys: ['GS_USER', ...] }` |

**配置存储**：`sys_global_search_config` 表定义了每个模块的数据源表、标题字段、内容字段、状态字段等元信息。

### 2.9 `RebuildIndexModal` — 索引重建弹窗

> **前端文件**：`bls-admin/src/components/RebuildIndexModal/index.tsx`

配合全局搜索使用，提供一键重建搜索索引的功能：
- 自动加载所有启用的搜索模块
- 支持全选 / 单独勾选需要重建的模块
- 带进度条和完成结果展示（每个模块的索引条数）

```tsx
// 在任意工具栏中使用
<Button icon={<ReloadOutlined />} onClick={() => setRebuildOpen(true)}>
  重建索引
</Button>
<RebuildIndexModal open={rebuildOpen} onClose={() => setRebuildOpen(false)} />
```

---

## 3. 前端 Hooks

### 3.1 `useCrudTable` — CRUD 状态管理 Hook

**文件**：`bls-admin/src/hooks/useCrudTable.ts`

```ts
const crud = useCrudTable<UserRow>(resource, 'id', {
  beforeSubmit: (values, current) => ({ ...values, remark: values.remark?.trim() }),
  onSaved: (mode, values, current) => refreshOther(),
  searchMode: 'fuzzy',
});
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `resource` | `CrudResource` | CRUD 资源对象 |
| `idKey` | `keyof T` | 主键字段名 |
| `options.beforeSubmit` | `(values, current?) => Partial<T>` | 提交前转换 |
| `options.onSaved` | `(mode, values, current?) => void` | 保存成功回调 |
| `options.searchMode` | `'fuzzy' \| 'exact'` | 搜索模式 |

**返回值**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `actionRef` | `Ref<ActionType>` | ProTable action 引用 |
| `lastRequestParams` | `Ref<object>` | 最近一次请求参数 |
| `modalOpen` | `boolean` | 弹窗是否打开 |
| `mode` | `'create' \| 'edit'` | 当前模式 |
| `current` | `T \| undefined` | 当前编辑行数据 |
| `createDefaults` | `Partial<T> \| undefined` | 新增默认值 |
| `request` | `(params) => Promise` | 列表请求函数（给 ProTable） |
| `openCreate(defaults?)` | `void` | 打开新增弹窗 |
| `openEdit(record)` | `void` | 打开编辑弹窗 |
| `closeModal()` | `void` | 关闭弹窗 |
| `submit(values)` | `Promise<boolean>` | 提交表单 |
| `remove(records)` | `void` | 删除（含确认弹窗） |
| `changeStatus(record, status)` | `Promise<void>` | 切换状态 |

### 3.2 `usePermission` — 权限控制 Hook

**文件**：`bls-admin/src/hooks/usePermission.ts`

```ts
// 方式一：传入所需权限
const { hasPermission, isAdmin } = usePermission('user:edit');

// 方式二：动态判断
const { can } = usePermission();
if (can('user:delete')) { /* 有权限 */ }

// 多权限 AND / OR
can(['user:create', 'user:edit'], 'all');  // 全部满足
can(['user:create', 'user:edit'], 'any');  // 任一满足
```

**返回值**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `isAdmin` | `boolean` | 是否为超管（超管默认拥有所有权限） |
| `userPerms` | `string[]` | 当前用户权限列表 |
| `hasPermission` | `boolean` | 是否拥有指定权限 |
| `can(perm, mode?)` | `boolean` | 动态权限判断 |

### 3.3 `useDict` — 字典数据 Hook

**文件**：`bls-admin/src/hooks/useDict.ts`

```ts
// 单个字典
const { options, valueEnum, loading, getLabel, refresh } = useDict('sys_yes_no');

// 多个字典批量加载
const result = useMultiDict(['sys_yes_no', 'order_status'] as const);
// result.sys_yes_no.options / result.order_status.valueEnum / result.loading
```

**返回值**（`useDict`）：

| 属性 | 类型 | 说明 |
|------|------|------|
| `options` | `{ label, value }[]` | 下拉选项 |
| `valueEnum` | `Record<string, {text, color?}>` | 适用于 ProTable valueEnum |
| `loading` | `boolean` | 加载状态 |
| `getLabel(value)` | `string` | 根据 value 获取 label |
| `refresh()` | `void` | 清除缓存并重新加载 |

### 3.4 `usePageConfig` — 页面动态配置 Hook

**文件**：`bls-admin/src/hooks/usePageConfig.ts`

从服务端加载页面列配置，自动生成 ProTable columns 和 Form columns。

```ts
const { proColumns, formColumns, loading } = usePageConfig('order_page');
```

**返回值**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `columns` | `PageColumnConfigRecord[]` | 原始列配置 |
| `proColumns` | `ProColumns[]` | 适配 ProTable 的列（自动过滤 visible=false） |
| `formColumns` | `ProFormColumnsType[]` | 适配表单的列（自动过滤 editable=false） |
| `loading` | `boolean` | 加载状态 |

### 3.5 `useFileUpload` — 文件上传 Hook

**文件**：`bls-admin/src/hooks/useFileUpload.ts`

```ts
const { uploading, upload } = useFileUpload({
  uploadUrl: '/api/system/storage/upload',
  onSuccess: (result) => console.log(result.url),
});

await upload({ file: blob, filename: 'photo.png', data: { accessType: 'private' } });
```

**选项**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `uploadUrl` | `string` | `/api/system/storage/upload` | 上传地址 |
| `defaultData` | `Record<string, string>` | - | 默认附带参数 |
| `transformResponse` | `(res) => NormalizedUploadResult` | 自动提取 url/fileId 等 | 响应转换 |
| `onSuccess` | `(result) => void` | - | 上传成功回调 |
| `onError` | `(error) => void` | - | 上传失败回调 |

**返回值**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `uploading` | `boolean` | 上传中状态 |
| `upload({file, filename, data})` | `Promise<NormalizedUploadResult>` | 执行上传 |

### 3.6 `useWebSocket` — WebSocket 实时连接 Hook

**文件**：`bls-admin/src/hooks/useWebSocket.ts`

```ts
const { connected, connecting, lastMessage, errorText, reconnect } = useWebSocket({
  url: 'ws://localhost:6001/ws/realtime',
  onMessage: (msg) => handleRealTimeData(msg),
});
```

**选项**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | **必填** | WebSocket 地址 |
| `heartbeatIntervalMs` | `number` | `15000` | 心跳间隔 |
| `reconnectDelayMs` | `number` | `3000` | 重连延迟 |
| `maxReconnectAttempts` | `number` | `5` | 最大重连次数 |
| `tokenStorageKey` | `string` | `'token'` | Token 存储 key |
| `enabled` | `boolean` | `true` | 是否启用连接 |
| `onOpen` | `(socket) => void` | - | 连接打开回调 |
| `onMessage` | `(msg) => void` | - | 消息回调 |

**返回值**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `connected` | `boolean` | 是否已连接 |
| `connecting` | `boolean` | 连接中 |
| `errorText` | `string \| null` | 错误信息 |
| `lastMessage` | `TMessage \| null` | 最新消息 |
| `reconnect()` | `void` | 手动重连 |

---

## 4. 快速接入指南

### 新增一个 CRUD 模块的步骤

**后端（3 步）**：

```ts
// 1. 在 bls-server/src/api/ 下创建文件夹和 index.ts
// bls-server/src/api/business/orders/index.ts
export default {
  table: 'orders',
  pkField: 'id',
  searchFields: ['order_no', 'customer_name'],
  name: '订单',
  permPrefix: 'business:order',
};
```

路由自动注册，接口自动生成：`GET /api/business/orders/list`、`POST /api/business/orders/add` 等。

**前端（1 个组件搞定）**：

```tsx
// 2. 在 bls-admin/src/pages/business/orders/index.tsx
export default function OrderPage() {
  return (
    <CrudTablePage<OrderRecord>
      title="订单管理"
      rowKey="id"
      resource={{ basePath: '/api/business/orders' }}
      columns={columns}
      formColumns={formColumns}
      excelMetaKey="orders"
      permissions={{ create: 'business:order:add', edit: 'business:order:edit', remove: 'business:order:remove' }}
    />
  );
}
```

---

## 其他文档参见

- [CurdTable 及其 hook 封装文档](./CurdTable及其hook封装文档.md)
- [存储桶通用文档](./存储桶通用文档.md)
- [系统多开策略及单开策略文档](./系统多开策略及单开策略文档.md)
- [全局搜索策略文档](./全局搜索技术文档.md)

