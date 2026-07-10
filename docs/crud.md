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

自动生成：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/list` | 分页列表 |
| `GET` | `/:id` | 详情 |
| `POST` | `/add` | 新增 |
| `PUT` | `/edit` | 编辑 |
| `DELETE` | `/remove` | 删除（软删除） |
| `PUT` | `/status` | 状态切换 |

## 配置项

| 参数 | 类型 | 说明 |
|------|------|------|
| `table` | string | **必填** 表名 |
| `pkField` | string | **必填** 主键 |
| `searchFields` | string[] | 搜索字段 |
| `tenantField` | string | 租户字段（默认 `tenant_id`） |
| `name` | string | 模块中文名 |
| `permPrefix` | string | 权限前缀 |
| `softDelete` | boolean | 软删除（默认 true） |

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

- 自动 tenant_id 过滤
- snake_case ↔ camelCase 转换
- Snowflake ID 生成
- 关键字模糊搜索 + 精确过滤
- 最大 100 条/页
