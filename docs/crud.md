# CRUD 工厂

## 一行配置生成接口

```typescript
// bls-server/src/api/system/role/index.ts
export const config = {
  table: 'sys_role',
  pkField: 'role_id',
  searchFields: ['role_name', 'role_key'],
  name: '角色',
  permPrefix: 'system:role',
};
```

自动生成 5 个接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/list` | 分页列表 |
| `POST` | `/add` | 新增 |
| `PUT` | `/edit` | 编辑 |
| `DELETE` | `/remove` | 删除（软删除） |
| `PUT` | `/status` | 状态切换 |

## 配置项

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `table` | string | - | **必填** 表名 |
| `pkField` | string | - | **必填** 主键 |
| `prefix` | string | 路径推导 | 路由前缀 |
| `searchFields` | string[] | - | 关键字模糊搜索字段 |
| `tenantField` | string | `tenant_id` | 租户字段 |
| `statusField` | string | `status` | 状态字段 |
| `name` | string | - | 模块中文名 |
| `permPrefix` | string | - | 权限前缀，为空则跳过鉴权 |
| `softDelete` | boolean | `true` | 是否软删除 |
| `schema` | `{ create?; update? }` | - | Zod 校验规则 |
| `dataScope` | `false \| DataScopeColumnMapping` | `false` | 数据权限列映射，设为 false 显式关闭 |
| `onWrite` | `() => void \| Promise<void>` | - | 写入前回调（add/edit/delete/status），用于清缓存等 |
| `transactional` | `boolean` | `false` | 是否使用数据库事务包裹写操作 |
| `onTransactionCommitted` | `() => void \| Promise<void>` | - | 事务提交后回调，用于发送事件等副作用 |

## 混合模式

自定义接口 + 标准 CRUD 并存：

```typescript
// 导出自定义 Router（覆盖 /list 为树形数据）
const router = new Router({ prefix: '/system/dept' });
router.get('/list', jwtAuth(), async (ctx) => { /* 树形 */ });
export default router;

// 同时导出 config → 其它 CRUD 自动兜底
export const config = { table: 'sys_dept', pkField: 'dept_id', ... };
```

## 内置能力

- **JWT 认证**：所有路由默认 `jwtAuth()`
- **多租户隔离**：自动注入 `WHERE tenant_id`
- **软删除**：`WHERE deleted = 0`
- **雪花 ID**：新增时自动生成 (`generateSnowflakeId()`)
- **snake_case ↔ camelCase**：入参自动转换蛇形，出参自动转换驼峰
- **权限控制**：`hasPerm('{permPrefix}:action')`
- **数据权限**：支持 DEPT / DEPT_AND_CHILDREN / SELF 等 scope（需配置 `dataScope`）
- **事务支持**：配置 `transactional: true` 开启事务，写操作失败自动回滚
- **写后回调**：`onWrite` 在写入前触发，`onTransactionCommitted` 在事务提交后触发
- **关键字搜索 + 精确过滤**：`keyword` 模糊匹配 `searchFields`，其他 query 参数精确匹配
- **最大 100 条/页**：`pageSize` 上限 100
