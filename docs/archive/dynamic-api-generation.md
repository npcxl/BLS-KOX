# 动态接口生成文档

> ⚠️ 本文档内容已合并到 [CRUD 工厂](../crud.md)，本文件保留作为历史参考。

BLS 后端支持三种方式定义 API 接口，核心是 **`defineCrudModule` 工厂** + **Router 自动扫描注册**。

---

## 一、三种方式速览

| 方式 | 代码量 | 适用场景 |
|------|--------|----------|
| **纯配置模式** | 5 行 | 标准单表 CRUD |
| **混合模式** | 10-30 行 | 自定义部分接口 + 其余自动生成 |
| **纯自定义模式** | 不限 | 完全自定义 |

---

## 二、纯配置模式

只需导出 `config` 对象，路由由 `core/router.ts` 自动扫描注册。

```ts
// src/api/business/orders/index.ts
export const config = {
  table: 'orders',               // 数据库表名
  pkField: 'id',                 // 主键
  searchFields: ['order_no'],    // 搜索字段
  permPrefix: 'business:order',  // 权限前缀
};
```

### 自动生成的 5 个接口

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/{prefix}/list` | `{permPrefix}:list` |
| POST | `/{prefix}/add` | `{permPrefix}:add` |
| PUT | `/{prefix}/edit` | `{permPrefix}:edit` |
| DELETE | `/{prefix}/remove` | `{permPrefix}:remove` |
| PUT | `/{prefix}/status` | `{permPrefix}:status` |

> 路由前缀从文件夹路径自动推导：`api/business/orders/` → `/business/orders`

### 配置项

```ts
interface CrudModuleConfig {
  prefix?: string;          // 路由前缀，默认从路径推导
  table: string;            // 表名（必填）
  pkField: string;          // 主键字段（必填）
  tenantField?: string;     // 租户字段，默认 'tenant_id'
  statusField?: string;     // 状态字段，默认 'status'
  softDelete?: boolean;     // 是否软删除，默认 true
  searchFields?: string[];  // 关键字搜索字段
  name?: string;            // 模块名
  permPrefix?: string;      // 权限前缀
  schema?: { create?; update? };  // Zod 校验
  dataScope?: false | DataScopeColumnMapping;  // 数据权限（默认关闭）
  onWrite?: () => void | Promise<void>;  // 写入后回调（add/edit/delete/status），用于清缓存等
  transactional?: boolean;  // 是否使用事务包裹写操作（add/edit/delete/status），默认 false
  onTransactionCommitted?: () => void | Promise<void>;  // 事务提交后回调，用于发送事件等副作用
}
```

### 内置能力

- **JWT 认证**：所有路由默认 `jwtAuth()`
- **多租户隔离**：自动注入 `WHERE tenant_id`
- **软删除**：`WHERE deleted = 0`
- **雪花 ID**：新增时自动生成
- **snake_case ↔ camelCase**：入参 snake_case，出参 camelCase
- **权限控制**：`hasPerm('{permPrefix}:action')`
- **数据权限**：DEPT / DEPT_AND_CHILDREN / SELF 等 scope（需配置 `dataScope`，默认关闭）
- **事务支持**：配置 `transactional: true` 开启数据库事务，包裹所有写操作（add/edit/delete/status）
- **写后回调**：`onWrite` 在每次写入前触发，可用于缓存失效；`onTransactionCommitted` 在事务提交后触发，可用于发送事件

### 接口行为

**GET /list**：`pageNum`/`pageSize` 分页，`keyword` 模糊搜索，其他参数精确过滤。

**POST /add**：自动注入租户 ID，生成雪花主键，Zod 校验。

**PUT /edit**：主键兼容驼峰/下划线，自动移除主键字段，租户隔离校验。

**DELETE /remove**：支持 `{ids: []}` 批量删除，默认软删除（`UPDATE SET deleted=1`）。

**PUT /status**：简单状态切换，自动租户隔离。

---

## 三、混合模式

同时导出 `Router` + `config`，自定义路由优先匹配，其余由 config 兜底：

```ts
import Router from 'koa-router';
const router = new Router({ prefix: '/system/dept' });

// 覆盖 GET /list：返回树形数据
router.get('/list', jwtAuth(), hasPerm('system:dept:list'), async (ctx) => { ... });

export default router;
export const config = { table: 'sys_dept', pkField: 'dept_id', ... };
```

匹配优先级：**自定义 Router → defineCrudModule 兜底**。

---

## 四、纯自定义模式

只导出 `Router`，不导出 `config`：

```ts
const router = new Router({ prefix: '/custom/dashboard' });
router.get('/stats', async (ctx) => { ... });
export default router;
```

---

## 五、函数导出模式

导出命名函数，系统自动注册为路由：

| 函数名 | HTTP | 路径 | 认证 |
|--------|------|------|------|
| `getList` | GET | `/list` | JWT |
| `addUser` | POST | `/add-user` | JWT |
| `editRole` | PUT | `/edit-role` | JWT |
| `removeItem` | DELETE | `/remove-item` | JWT |
| `publicInfo` | GET | `/public-info` | 无需 |

规则：`add*/create*/save*` → POST，`edit*/update*` → PUT，`delete*/remove*` → DELETE，其他 → GET。`public*` / `login` / `logout` / `refresh` 跳过认证。

---

## 六、文件组织规范

- 只扫描 `index.ts`，路由前缀 = 文件夹相对路径
- 跳过文件：`model.ts`、`*.routes.ts`、`*.controller.ts`、`*.service.ts`、`*.repository.ts`
- 大写字母开头函数不注册为路由（工具函数）

---

## 七、动态列配置（Page Config）

允许运行时配置页面列的显示/搜索/编辑等属性，无需改代码。

### 数据表

- **`sys_page_config`**：页面配置（`page_code`、`page_name`）
- **`sys_page_column_config`**：列配置（`data_index`、`title`、`visible`、`searchable`、`editable`、`order_num`、`value_type`、`value_enum_code` 等）

### 前端 Hook

```tsx
const { proColumns, formColumns, loading } = usePageConfig('system_user');
```

自动调用 `GET /system/page-config/page/system_user/columns`，根据 `visible`/`editable` 过滤生成表格列和表单列，自动加载字典 valueEnum。

### 后端联动

列表接口从 `sys_page_column_config` 读取 `searchable=1` 的字段，自动支持 `=` 精确过滤和 `LIKE` 模糊搜索。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/system/page-config/list` | 页面配置列表 |
| GET | `/system/page-config/page/:pageCode` | 单个页面配置 |
| GET | `/system/page-config/page/:pageCode/columns` | 列配置 |
| POST | `/system/page-config/save` | 保存（upsert 模式） |
| DELETE | `/system/page-config/page/:pageCode` | 删除 |

---

## 八、从零新建模块（44 行代码）

**建表（12行 SQL）** → **后端 config（7行 TS）** → **前端 CrudTablePage（25行 TSX）** = 完整的增删改查模块。
