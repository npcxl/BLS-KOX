# CRUD 工厂（双后端对比）

BLS-KOX 两套后端采用了不同的 CRUD 实现模式：

- **Koa 后端**：`defineCrudConfig()` 配置式 CRUD 工厂 —— **标准单表模块只写一个 `index.ts` 配置文件**，即可自动生成完整、安全、可验证的 CRUD 接口
- **Java 后端**：`BaseCrudController` + `BaseCrudService` 通用基类（见文末）

---

## Koa 后端：配置式 CRUD 工厂

这是 Koa 后端最核心的设计模式。`fields` 是标准模块的**单一字段来源**，自动推导字段白名单、搜索/过滤条件、响应投影、Zod 校验与 OpenAPI 文档。

### 最小配置示例

```typescript
// bls-server/src/api/business/product/index.ts
// 目录路径即 API 前缀（/api/business/product），无需手写 Router
import { defineCrudConfig } from '../../../core/crud';

export const config = defineCrudConfig({
  table: 'biz_product',
  pkField: 'product_id',
  name: '商品',
  permPrefix: 'business:product',

  fields: {
    product_name: {
      type: 'string',
      required: true,
      create: true,
      update: true,
      search: true,
      maxLength: 100,
    },
    category_id: { type: 'string', create: true, update: true, filter: true },
    price: { type: 'number', required: true, create: true, update: true, min: 0 },
    secret_key: { type: 'string', create: true, update: true, select: false },
    status: {
      type: 'enum',
      values: ['0', '1'],
      create: true,
      update: true,
      filter: true,
      status: true,
    },
    create_time: { type: 'datetime', select: true },
    update_time: { type: 'datetime', select: true },
  },

  createDefaults: {
    status: '0',
  },
});
```

同一份配置立即得到：6 个标准端点 + 字段白名单 + Zod 校验 + 租户/软删除/数据权限 + OpenAPI 字段说明。

### 完整字段配置项

`fields` 的 key 使用数据库 **snake_case** 列名；请求体同时接受 `camelCase` 与 `snake_case`，响应统一 `camelCase`。

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `'string' \| 'number' \| 'integer' \| 'boolean' \| 'enum' \| 'datetime' \| 'json'` | **必填** | 决定 Zod 校验与 OpenAPI 类型 |
| `values` | `string[]` | - | 仅 `enum`：取值集合（必须非空） |
| `required` | `boolean` | `false` | 新增时必填 |
| `nullable` | `boolean` | `false` | 允许显式 `null`（与「可缺省 optional」区分） |
| `create` | `boolean` | `false` | 进入新增白名单 |
| `update` | `boolean` | `false` | 进入编辑白名单 |
| `search` | `boolean` | `false` | 参与 `keyword` 模糊搜索 |
| `filter` | `boolean` | `false` | 允许作为精确过滤 query 参数 |
| `select` | `boolean` | `true` | 是否出现在 list/detail 响应；`false` 时列级脱敏 |
| `status` | `boolean` | `false` | 标记状态字段（模块最多 1 个），驱动 `/status` |
| `min` / `max` | `number` | - | `number` / `integer` 取值范围 |
| `minLength` / `maxLength` | `number` | - | `string` 长度范围 |
| `default` | `unknown` | - | 新增默认值（服务端可信配置） |
| `description` | `string` | - | OpenAPI 字段说明 |

### fields 自动推导内容

| 派生项 | 来源 |
|--------|------|
| `createFields` | `fields` 中 `create:true` 的字段 |
| `updateFields` | `fields` 中 `update:true` 的字段 |
| `searchFields` | `fields` 中 `search:true` 的字段 |
| `filterFields` | `fields` 中 `filter:true` 的字段 |
| `selectFields`（响应投影） | `fields` 中 `select!==false` 的字段，**主键始终返回**（否则前端无法定位行） |
| `statusField` | `fields` 中 `status:true` 的字段 |
| Zod create / update | 按 `type`/`required`/`nullable`/`min`/`max`/`minLength`/`maxLength`/`values` 自动生成 |
| OpenAPI 请求/响应字段 | 由 `fields` + `actions` 生成 |

### 配置优先级（重要）

| 场景 | 优先级规则 |
|------|-----------|
| `fields` 与显式数组（`createFields` / `updateFields` / `searchFields` / `filterFields`）同时存在 | **显式数组优先**；数组中出现 `fields` 未声明的列会在**启动阶段报错** |
| `schema.create` / `schema.update` 与 `fields` | **显式 schema 优先**（复杂模块可覆盖自动生成的校验） |
| `statusField` 与 `fields[].status` | **显式 `statusField` 优先** |
| 请求体与本模块 `createDefaults` | 客户端值优先于默认值；但 `tenant_id` / `deleted` / 主键由服务端最终决定 |
| 完全无 `fields` 的旧配置 | 保持旧行为（`selectAll`、无自动 Zod），**完全兼容** |

### 安全默认值

- `tenant_id` 只来自服务端请求上下文，请求体中的 `tenantId`/`tenant_id` 无法覆盖；缺失租户上下文时写入直接拒绝（fail-closed）
- `deleted` 由服务端置 `0`，请求体不可写
- `create_by` / `create_time` / `update_by` / `update_time` **永不接受请求体写入**，只能由可信的 `createDefaults` 提供
- 未声明字段默认**安全忽略**（`unknownFields: 'ignore'`，不会形成 mass assignment）；设为 `'reject'` 时返回 400 并列出字段名
- `select:false` 的字段不出现在列表与详情响应（密钥类字段列级脱敏）

### 启动阶段配置校验

`defineCrudConfig()`（以及 `defineCrudModule()`）在**路由注册阶段**校验配置，**不合法则应用启动失败**，错误信息包含模块名、表名与字段名：

- `table` / `pkField` / `tenantField` / `statusField` / `orderBy` / `fields` 的 key / `createDefaults` 的 key 必须是合法 SQL 标识符
- `fields` 中 `enum` 必须声明非空 `values`；非 `enum` 不允许 `values`
- `min`/`max` 仅 `number`/`integer`；`minLength`/`maxLength` 仅 `string`；`min <= max`
- 系统字段（`tenant_id`/`deleted`/审计字段）不允许开放 `create`/`update`
- 只能有一个 `status:true` 字段；`actions.status` 开启时必须能解析出 `statusField`
- `actions.add` 开启时至少需要一个 `create` 字段；`actions.edit` 开启时至少需要一个 `update` 字段
- `createDefaults` 引用的字段必须在 `fields` 中声明或是系统字段

> 任何配置字符串都不会被当作「未校验的数据库列名」直接拼进 SQL。

### actions：关闭端点（关闭即不注册）

```typescript
export const config = defineCrudConfig({
  table: 'sys_login_log',
  pkField: 'log_id',
  name: '登录日志',
  permPrefix: 'system:log:login',
  fields: {
    username: { type: 'string', search: true, select: true },
    login_ip: { type: 'string', select: true },
  },
  actions: { add: false, edit: false, remove: false, status: false },
});
```

关闭的端点**不会注册**（而不是注册后返回「不支持」），因此 OpenAPI 与实际路由都不再出现。

### 自动生成的 6 个端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/list` | `hasPerm('{permPrefix}:list')` | 分页列表 + 关键字搜索 + 白名单字段过滤 |
| `GET` | `/:id` | `hasPerm('{permPrefix}:list')` | 单条详情（租户 + 软删除 + Data Scope，缺失返回 404） |
| `POST` | `/add` | `hasPerm('{permPrefix}:add')` | 新增（Snowflake ID、Zod 校验、字段白名单、自动注入 tenant_id） |
| `PUT` | `/edit` | `hasPerm('{permPrefix}:edit')` | 编辑（主键校验、租户隔离、Data Scope、不存在返回 404） |
| `DELETE` | `/remove` | `hasPerm('{permPrefix}:remove')` | 批量删除（请求体 `{ ids: [] }`、软删除/硬删除、租户隔离） |
| `PUT` | `/status` | `hasPerm('{permPrefix}:status')` | 状态切换（不存在返回 404） |

### 模块级配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `table` | `string` | **必填** | 数据库表名（合法 SQL 标识符） |
| `pkField` | `string` | **必填** | 主键字段名（snake_case） |
| `fields` | `Record<string, CrudFieldConfig>` | - | **单一字段来源**，见上文字段配置 |
| `actions` | `CrudActions` | 全部 `true` | 端点开关；关闭的端点不注册 |
| `createDefaults` | `object \| (ctx) => object` | - | 服务端新增默认值（可信配置） |
| `unknownFields` | `'ignore' \| 'reject'` | `'ignore'` | 请求体未声明字段策略 |
| `prefix` | `string` | 目录路径推导 | 路由前缀（由 router 自动注入） |
| `searchFields` | `string[]` | `fields.search` | 关键字模糊搜索字段（显式数组优先） |
| `filterFields` | `string[]` | `fields.filter` | 精确过滤 query 白名单；白名单外参数一律忽略 |
| `createFields` | `string[]` | `fields.create` | 新增可写字段白名单 |
| `updateFields` | `string[]` | `fields.update` | 编辑可写字段白名单；主键/tenant_id/deleted 永远不可写 |
| `tenantField` | `string` | `'tenant_id'` | 租户字段名 |
| `globalTable` | `boolean` | `false` | 全局表（无 tenant_id）显式声明后跳过租户过滤/注入 |
| `statusField` | `string` | `fields.status` 或 `'status'` | 状态字段名 |
| `softDelete` | `boolean` | `true` | 是否使用软删除（`deleted = 0/1`） |
| `orderBy` | `string` | 主键倒序 | 列表默认排序字段（snake_case） |
| `name` | `string` | - | 模块中文名（用于审计日志与配置错误提示） |
| `permPrefix` | `string` | - | RBAC 权限前缀，为空则跳过鉴权 |
| `schema` | `{ create?, update? }` | 由 `fields` 生成 | 显式 Zod Schema（优先于自动生成） |
| `dataScope` | `false \| DataScopeColumnMapping` | `false` | 数据权限列映射配置 |
| `onWrite` | `() => void` | - | **写入成功后**回调（清缓存等），失败时不触发 |
| `transactional` | `boolean` | `false` | 是否使用数据库事务包裹写操作 |
| `onTransactionCommitted` | `() => void` | - | 事务**提交成功后**回调（发送事件等），回滚时不触发 |

> 安全语义：
> - 租户 / 软删除 / Data Scope 条件由 `applyScope()` 统一构造，**事务内外复用同一套条件**，不会因换连接而丢失；
> - `tenant_id` 只取自服务端请求上下文（缺失即拒绝写入），请求体中的 `tenantId` 被忽略；
> - 修改 / 删除 / 状态更新受影响行数为 0 时返回 **404**（不存在、已软删除或不在数据权限范围内）；
> - 批量删除时请求中的 ID 必须**全部**可见，否则整体 404（fail-closed，不静默跳过越权 ID）；
> - 删除请求统一为 `{ "ids": ["a","b"] }`，同时兼容逗号分隔与裸数组（与 Java 后端一致）。

### 混合模式（复杂模块）

`config` 生成标准端点，自定义 Router 覆盖特殊端点；**自定义 Router 先挂载并优先匹配**，未被覆盖的端点由 CRUD 工厂兜底，不会重复注册或重复执行。

```typescript
// bls-server/src/api/business/product/index.ts
import Router from 'koa-router';
import { defineCrudConfig } from '../../../core/crud';
import { jwtAuth } from '../../../middleware/auth';

// 1) 自定义 Router：覆盖需要特殊逻辑的端点（如带关联数据的 /list）
const router = new Router({ prefix: '/business/product' });
router.get('/list', jwtAuth(), async (ctx) => {
  // 自定义查询/聚合逻辑
});
export default router;

// 2) config：其余端点（/:id、/add、/edit、/remove、/status）自动兜底
export const config = defineCrudConfig({
  table: 'biz_product',
  pkField: 'product_id',
  name: '商品',
  permPrefix: 'business:product',
  fields: {
    product_name: { type: 'string', required: true, create: true, update: true, search: true },
    price: { type: 'number', required: true, create: true, update: true, min: 0 },
  },
});
```

> 注意：混用时**不要**在自定义 Router 里重复实现 config 已经生成的端点；
> 若某端点由自定义 Router 完整接管，可在 `actions` 中关闭对应开关，避免注册后永不执行。

### 标准模块与复杂模块的边界

| 适合「纯配置」 | 必须保留「混合模式 / 手写 Router」 |
|----------------|-----------------------------------|
| 普通单表管理（无关联表写入） | `user`（用户-角色关联、密码、会话） |
| 无树形结构 | `role`（角色-菜单关联、分配菜单） |
| 无删除前业务检查 | `menu`（树形 + 递归删除 + 角色/套餐关联） |
| 无密钥特殊保存逻辑 | `dept`（树形 + 子部门/用户检查） |
| 无跨表统计 | `package`（套餐-菜单关联 + 租户引用检查） |
| | `page-config`（主表 + 列配置双表事务） |
| | `storage`（密钥脱敏/保留、默认项唯一） |
| | `ai-model`（密钥脱敏、默认模型唯一、内部接口） |
| | `dict`（字典类型 + 字典数据双表、级联删除） |

未迁移为纯配置的模块见本节末「尚未迁移为纯配置的模块」——它们的能力已经由加固后的手写 Router 覆盖，迁移收益低而回归风险高。

### Koa 内置安全能力

CRUD 工厂在每个端点上自动注入以下安全机制（配置化后依然成立）：

| 能力 | 实现方式 |
|------|----------|
| JWT 认证 | 每个端点都套 `jwtAuth()`（配置无法关闭） |
| RBAC 权限 | `hasPerm('{permPrefix}:{action}')`；`permPrefix` 为空则跳过 |
| 租户隔离 | 所有读写自动附加 `WHERE tenant_id = ?`（全局表用 `globalTable: true` 显式声明） |
| 软删除过滤 | 列表/详情/编辑/删除/状态自动附加 `WHERE deleted = 0` |
| Data Scope | 基于角色 `dataScope` 构建数据权限 WHERE，并作用于事务内真正执行的查询 |
| Snowflake ID | 新增时自动生成（主键不接受客户端指定以外的覆盖） |
| 字段白名单 | `createFields` / `updateFields` / `filterFields`；未知字段安全忽略或按 `unknownFields` 拒绝 |
| 字段级脱敏 | `fields[].select:false` 的列不进入 list/detail 响应 |
| 字段转换 | 入参 `camelCase → snake_case`（两种写法都接受），出参 `snake_case → camelCase` |
| Zod 校验 | `fields` 自动生成；可用 `schema.create`/`schema.update` 覆盖 |
| 事务支持 | `transactional: true` 使用 Kysely 原生事务；`onWrite` / `onTransactionCommitted` 仅在写成功（事务提交）后执行 |
| 404 语义 | 修改/删除/状态/详情命中 0 行时返回 404 |
| 批量删除 fail-closed | 请求 ID 必须全部可见，否则整体 404 |
| 分页限制 | `pageSize` 上限 100 |

### 尚未迁移为纯配置的模块（及其原因）

以下模块仍使用「混合模式 / 手写 Router」，因为它们存在关联表写入、树形结构、删除前检查、密钥特殊处理等超出纯配置能力的需求：

| 模块 | 保留手写的原因 |
|------|----------------|
| `system/user` | 用户-角色关联写入、Argon2 密码、删除时吊销会话、唯一约束冲突处理 |
| `system/role` | 角色-菜单关联（事务）、`sys_user_role` 清理、分配菜单校验 |
| `system/menu` | 树形结构、递归删除、`sys_role_menu`/`sys_package_menu` 清理 |
| `system/dept` | 树形结构、环校验、删除前子部门/用户检查 |
| `system/tenant` | 平台租户保护、关联用户/角色检查、域名唯一、`public-list` 最小字段 |
| `system/package` | 套餐-菜单关联、被租户引用检查 |
| `system/page-config` | 主表 + 列配置双表事务、列级差量写入 |
| `system/storage` | 密钥脱敏与「未填保留原值」、`is_default` 唯一、文件上传 |
| `system/ai-model` | 密钥脱敏与保留、默认模型唯一、内部服务接口 |
| `system/dict` | 字典类型 + 字典数据双表、级联删除、`/data/type` 平台回退 |

它们的配置虽已用 `fields` 风格重写为等价声明（数组白名单 + Zod），但端点仍由手写 Router 提供，以保证既有业务语义不变。

### 迁移一个标准模块的操作步骤

1. 新建 `bls-server/src/api/<模块路径>/index.ts`，只导出 `config`（`defineCrudConfig`）；
2. 在 `sql/Init.sql` 中补菜单/按钮权限（`{permPrefix}:list/add/edit/remove/status`）并授予角色；
3. 在前端用 `CrudTablePage` + `services/system/crud.ts` 指向同路径；
4. 执行 `npm run lint && npm run test && npm run openapi`；
5. 若表中没有 `status` 列或不需要状态切换，请在 `actions` 中关闭 `status`（否则启动即报错）。

---

## Java 后端：BaseCrudController + BaseCrudService 通用基类

Java 后端已实现 `BaseCrudController<T, C, E>` + `BaseCrudService<T, M, C, E>` 通用 CRUD 基类（位于 `core/` 包）。标准 CRUD 模块继承基类即可获得完整端点，复杂模块（如认证、菜单树）保留手动编写模式。

### 基本用法

标准 CRUD 模块继承 `BaseCrudController` + `BaseCrudService`：

```java
// Service — 只需声明搜索字段、字段映射、新增/编辑赋值逻辑
@Service
public class PackageService extends BaseCrudService<SysPackage, SysPackageMapper, PkgCreateReq, PkgEditReq> {
    public PackageService(SysPackageMapper m) { super(m); }

    @Override
    public ApiResponse<List<Map<String, Object>>> list(int pageNum, int pageSize, String keyword) {
        return doList(pageNum, pageSize, keyword, w ->
            w.like(SysPackage::getPackageName, keyword));
    }

    @Override protected Map<String, Object> toMap(SysPackage p) {
        return Map.of("packageId", p.getPackageId(), "packageName", p.getPackageName());
    }
    @Override protected void assignCreate(SysPackage e, PkgCreateReq r) {
        e.setPackageName(r.getPackageName());
    }
    @Override protected void assignEdit(SysPackage e, PkgEditReq r) {
        if (r.getPackageName() != null) e.setPackageName(r.getPackageName());
    }
    @Override protected Serializable extractId(PkgEditReq r) { return r.getPackageId(); }
}

// Controller — 继承基类 + 标注权限
@RestController
@RequestMapping("/api/system/package")
public class PackageController extends BaseCrudController<SysPackage, PkgCreateReq, PkgEditReq> {
    public PackageController(PackageService svc) { super(svc); }
    @Override protected String getPermPrefix() { return "system:package"; }

    @Override @GetMapping("/list") @PreAuthorize("hasAuthority('PERM_system:package:list')")
    public ApiResponse<List<Map<String, Object>>> list(...) { return super.list(...); }
    @Override @PostMapping("/add") @PreAuthorize("hasAuthority('PERM_system:package:add')")
    public ApiResponse<Void> add(...) { return super.add(...); }
    @Override @PutMapping("/edit") @PreAuthorize("hasAuthority('PERM_system:package:edit')")
    public ApiResponse<Void> edit(...) { return super.edit(...); }
    @Override @DeleteMapping("/remove") @PreAuthorize("hasAuthority('PERM_system:package:remove')")
    public ApiResponse<Void> remove(...) { return super.remove(...); }
}
        userService.editUser(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @DeleteMapping("/remove")
```
```

### 自定义端点

基类只提供标准 CRUD，自定义端点直接在子类中添加：

```java
// 例如 ConfigController 中的公开端点
@GetMapping("/public-theme")
public ApiResponse<Map<String, Object>> publicTheme() { ... }

@GetMapping("/key/{configKey}")
public ApiResponse<Map<String, Object>> getByKey(@PathVariable String configKey) { ... }
```
}
```

### 模式对比

| 对比维度 | 基类模式（推荐） | 手动模式 |
|----------|---------------|---------|
| 新增模块代码量 | ~30 行 | ~150 行 |
| list/add/edit/remove | 继承即得 | 手写 |
| 一致性 | 基类强制统一 | 依赖规范 |
| 自定义端点 | 直接添加 | 直接添加 |
| 适用场景 | 标准 CRUD（Config/Role/Package） | 复杂逻辑（Auth/Menu/Dept/User） |
- 缺少 Koa 后端 `defineCrudModule()` 的声明式便利性

---

## Java 后端 CRUD 基类实现

已实现通用 CRUD 基类，位于 `bls-java-server/src/main/java/com/bls/server/core/`。

### BaseCrudController
    C extends BaseCreateReq,    // 新增请求 DTO
    E extends BaseEditReq       // 编辑请求 DTO
> {

    protected abstract BaseCrudService<T> getService();
    protected abstract String getPermPrefix();

    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PERM_' + getPermPrefix() + ':list')")
    public ApiResponse<List<Map<String, Object>>> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String keyword) {
        return getService().list(pageNum, pageSize, keyword);
    }

    @PostMapping("/add")
    @PreAuthorize("hasAuthority('PERM_' + getPermPrefix() + ':add')")
    public ApiResponse<Void> add(@Valid @RequestBody C request) {
        getService().add(request);
        return ApiResponse.success(null, "新增成功");
    }

    @PutMapping("/edit")
    @PreAuthorize("hasAuthority('PERM_' + getPermPrefix() + ':edit')")
    public ApiResponse<Void> edit(@Valid @RequestBody E request) {
        getService().edit(request);
        return ApiResponse.success(null, "编辑成功");
    }

    @DeleteMapping("/remove")
    @PreAuthorize("hasAuthority('PERM_' + getPermPrefix() + ':remove')")
    public ApiResponse<Void> remove(@RequestBody List<String> ids) {
        getService().remove(ids);
        return ApiResponse.success(null, "删除成功");
    }
}
```

### 建议的 BaseCrudService

```java
/**
 * 通用 CRUD 服务基类
 *
 * 自动处理：
 * - 租户隔离（WHERE tenant_id = ?）
 * - 软删除过滤（WHERE deleted = 0）
 * - 分页查询
 * - 关键字搜索
 */
public abstract class BaseCrudService<T> {

    @Autowired
    protected BaseMapper<T> baseMapper;

    protected abstract String[] getSearchFields();   // 关键字搜索字段
    protected abstract Class<T> getEntityClass();

    public ApiResponse<List<Map<String, Object>>> list(
            int pageNum, int pageSize, String keyword) {

        String tenantId = TenantContext.getTenantId();
        Page<T> page = new Page<>(pageNum, pageSize);

        LambdaQueryWrapper<T> wrapper = new LambdaQueryWrapper<>();
        // 租户隔离
        wrapper.eq(EntityHelper.hasField(getEntityClass(), "tenantId"),
                   EntityHelper::getTenantId, tenantId);
        // 软删除过滤
        wrapper.eq(EntityHelper.hasField(getEntityClass(), "deleted"),
                   EntityHelper::getDeleted, 0);
        // 关键字搜索
        if (keyword != null) {
            wrapper.and(w -> {
                for (String field : getSearchFields()) {
                    w.or().like(EntityHelper.getFieldLambda(getEntityClass(), field), keyword);
                }
            });
        }

        IPage<T> result = baseMapper.selectPage(page, wrapper);
        return ApiResponse.pageSuccess(
            BeanUtil.beanToMapList(result.getRecords()), result.getTotal());
    }

    // add / edit / remove 方法类似...
}
```

---

## 双后端 CRUD 对比总结

| 维度 | Koa 后端 | Java 后端 |
|------|----------|-----------|
| 模式 | `defineCrudModule()` 配置式 | BaseCrudController + BaseCrudService |
| 新增模块代码量 | 1 个 config 对象（~10 行） | ~30 行 |
| 租户隔离 | 工厂自动注入 | Service 手动注入 TenantContext |
| 软删除 | 工厂自动过滤 | Service 手动编写 |
| 字段转换 | 内置 snake↔camel | MyBatis-Plus 自动映射 |
| 校验 | Zod Schema（可选） | Jakarta Validation |
| 自定义扩展 | 混合模式（Router + config） | override 方法 / 直接添加端点 |

## 函数导出模式（Koa）

除了 `defineCrudModule` 和混合模式，Koa 还支持导出命名函数自动注册为路由：

| 函数名 | HTTP | 路径 | 认证 |
|--------|------|------|------|
| `getList` | GET | `/list` | JWT |
| `addUser` | POST | `/add-user` | JWT |
| `editRole` | PUT | `/edit-role` | JWT |
| `removeItem` | DELETE | `/remove-item` | JWT |
| `publicInfo` | GET | `/public-info` | 无需 |

规则：
- `add*` / `create*` / `save*` → POST
- `edit*` / `update*` → PUT
- `delete*` / `remove*` → DELETE
- 其他 → GET
- `public*` / `login` / `logout` / `refresh` 跳过认证
- 大写字母开头的函数不注册为路由（工具函数）

## 动态列配置（Page Config）

允许运行时配置页面列的显示/搜索/编辑等属性，无需改代码。

### 数据表

- **`sys_page_config`**：页面配置
- **`sys_page_column_config`**：列配置（`data_index`、`title`、`visible`、`searchable`、`editable`、`order_num`、`value_type`、`value_enum_code` 等）

### 前端 Hook

```tsx
const { proColumns, formColumns, loading } = usePageConfig('system_user');
```

自动调用 `GET /system/page-config/page/system_user/columns`，根据 `visible`/`editable` 过滤生成表格列和表单列。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/system/page-config/list` | 页面配置列表 |
| GET | `/system/page-config/page/:pageCode` | 单个页面配置 |
| GET | `/system/page-config/page/:pageCode/columns` | 列配置 |
| POST | `/system/page-config/save` | 保存（upsert） |
| DELETE | `/system/page-config/page/:pageCode` | 删除 |

### 文件组织规范（Koa）

- 只扫描 `index.ts`，路由前缀 = 文件夹相对路径
- 跳过文件：`model.ts`、`*.routes.ts`、`*.controller.ts`、`*.service.ts`、`*.repository.ts`

## 从零新建模块（Koa）

**建表（SQL）** → **后端 config（~7 行 TS）** → **前端 CrudTablePage（~25 行 TSX）** = 完整增删改查模块。

## 参考文档

- [Koa 后端架构](./backend-koa.md) — Koa CRUD 工厂完整说明
- [Java 后端架构](./backend-java.md) — Java 分层架构详细说明
- [API 兼容性规范](./api-compatibility.md) — 双后端 API 一致性要求
- [动态接口生成文档（已合并）](./archive/dynamic-api-generation.md) — 原始详细文档
