# CRUD 工厂（双后端对比）

BLS-KOX 两套后端采用了不同的 CRUD 实现模式：

- **Koa 后端**：使用 `defineCrudModule()` 配置式 CRUD 工厂，一行配置自动生成完整 CRUD 接口

---

## Koa 后端：`defineCrudModule()` 配置式 CRUD 工厂

这是 Koa 后端最核心的设计模式。通过声明式配置，一行代码即可生成包含租户隔离、数据权限、软删除、字段转换的完整 CRUD 接口。

### 基本用法

```typescript
// bls-server/src/api/system/dict/index.ts
export const config = {
  table: 'sys_dict_data',
  pkField: 'dict_code',
  searchFields: ['dict_label', 'dict_value'],
  name: '字典',
  permPrefix: 'system:dict',
};
```

### 自动生成的 5 个端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/list` | `hasPerm('{permPrefix}:list')` | 分页列表 + 关键字搜索 + 动态字段过滤 |
| `POST` | `/add` | `hasPerm('{permPrefix}:add')` | 新增（Snowflake ID、Zod 校验、自动注入 tenant_id） |
| `PUT` | `/edit` | `hasPerm('{permPrefix}:edit')` | 编辑（主键校验、租户隔离、Data Scope） |
| `DELETE` | `/remove` | `hasPerm('{permPrefix}:remove')` | 批量删除（软删除/硬删除、租户隔离） |
| `PUT` | `/status` | `hasPerm('{permPrefix}:status')` | 状态切换 |

### 完整配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `table` | `string` | **必填** | 数据库表名 |
| `pkField` | `string` | **必填** | 主键字段名（snake_case） |
| `prefix` | `string` | 路径推导 | 路由前缀 |
| `searchFields` | `string[]` | - | 关键字模糊搜索的字段列表 |
| `tenantField` | `string` | `'tenant_id'` | 租户字段名 |
| `statusField` | `string` | `'status'` | 状态字段名 |
| `softDelete` | `boolean` | `true` | 是否使用软删除（`deleted = 0/1`） |
| `name` | `string` | - | 模块中文名（用于审计日志） |
| `permPrefix` | `string` | - | RBAC 权限前缀，为空则跳过鉴权 |
| `schema` | `{ create?, update? }` | - | Zod 校验 Schema |
| `dataScope` | `false \| DataScopeColumnMapping` | `false` | 数据权限列映射配置 |
| `onWrite` | `() => void` | - | 写入前回调（清缓存等） |
| `transactional` | `boolean` | `false` | 是否使用数据库事务包裹写操作 |
| `onTransactionCommitted` | `() => void` | - | 事务提交后回调（发送事件等） |

### 混合模式

自定义 Router 与 CRUD 工厂并存，支持部分端点自定义覆盖：

```typescript
// 导出自定义 Router 覆盖 /list（树形数据）
const router = new Router({ prefix: '/system/dept' });
router.get('/list', jwtAuth(), async (ctx) => {
  // 自定义树形查询逻辑
});
export default router;

// 同时导出 config → add/edit/remove/status 自动兜底
export const config = {
  table: 'sys_dept',
  pkField: 'dept_id',
  permPrefix: 'system:dept',
};
```

### 内置安全能力

CRUD 工厂在每个端点上自动注入以下安全机制：

| 能力 | 实现方式 |
|------|----------|
| 租户隔离 | 所有查询自动附加 `WHERE tenant_id = ?` |
| 软删除过滤 | 列表/编辑/删除自动附加 `WHERE deleted = 0` |
| Data Scope | 基于角色 `dataScope` 属性构建数据权限 WHERE 条件 |
| Snowflake ID | 新增时自动生成分布式 ID |
| 字段转换 | 入参 `camelCase → snake_case`，出参 `snake_case → camelCase` |
| Zod 校验 | 可选的输入 Schema 校验 |
| 事务支持 | `transactional: true` 将写操作包裹在数据库事务中 |
| 分页限制 | `pageSize` 上限 100 |

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
