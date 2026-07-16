# API 兼容性规范

## 概述

BLS-KOX 支持两套后端并存：Koa（`bls-server`）和 Java（`bls-java-server`）。前端代码（`bls-admin`）是**唯一**的，不随后端切换而修改。因此，两套后端必须在以下维度保持完全兼容。

> **核心原则**：前端不感知后端实现。同一个 API 请求，无论打到 Koa 还是 Java，响应格式、字段命名、状态码、错误处理必须一致。

## 统一响应格式

两套后端必须使用完全一致的 JSON 响应结构：

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

### 分页响应

```json
{
  "code": 200,
  "message": "success",
  "data": [ ... ],
  "total": 100
}
```

### 错误响应

```json
{
  "code": 500,
  "message": "错误描述信息"
}
```

### 字段约定

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | `number` | 是 | 200 成功；401 未认证；403 无权限；500 服务器错误 |
| `message` | `string` | 是 | 提示信息，成功时可为 `"success"` |
| `data` | `any` | 否 | 响应数据，可为对象、数组或 null |
| `total` | `number` | 否 | 分页总条数，仅列表接口返回 |

### 实现对比

**Koa**（`src/core/response.ts`）：
```typescript
export function success(ctx: Context, data: any, message = 'success') {
  ctx.body = { code: 200, message, data };
}

export function pageSuccess(ctx: Context, data: any, total: number) {
  ctx.body = { code: 200, message: 'success', data, total };
}
```

**Java**（`ApiResponse.java`）：
```java
public static <T> ApiResponse<T> success(T data) {
    return ApiResponse.<T>builder().code(200).message("success").data(data).build();
}

public static <T> ApiResponse<T> pageSuccess(T data, long total) {
    return ApiResponse.<T>builder().code(200).message("success").data(data).total(total).build();
}
```

## API 路径规范

### 路径格式

```
/api/{module}/{resource}/{action}
```

### 已对齐的路径列表

| 模块 | 端点 | Koa 路径 | Java 路径 | 状态 |
|------|------|----------|-----------|------|
| 认证 | 登录 | `POST /api/auth/login` | `POST /api/auth/login` | ✅ |
| 认证 | 登出 | `POST /api/auth/logout` | `POST /api/auth/logout` | ✅ |
| 认证 | 刷新 | `POST /api/auth/refresh` | `POST /api/auth/refresh` | ✅ |
| 认证 | 用户信息 | `GET /api/auth/profile` | `GET /api/auth/profile` | ✅ |
| 用户 | 列表 | `GET /api/system/user/list` | `GET /api/system/user/list` | ✅ |
| 用户 | 新增 | `POST /api/system/user/add` | `POST /api/system/user/add` | ✅ |
| 用户 | 编辑 | `PUT /api/system/user/edit` | `PUT /api/system/user/edit` | ✅ |
| 用户 | 删除 | `DELETE /api/system/user/remove` | `DELETE /api/system/user/remove` | ✅ |
| 用户 | 踢下线 | `POST /api/system/user/kick` | `POST /api/system/user/kick` | ✅ |
| 角色 | 列表 | `GET /api/system/role/list` | `GET /api/system/role/list` | ✅ |
| 角色 | 新增 | `POST /api/system/role/add` | `POST /api/system/role/add` | ✅ |
| 角色 | 编辑 | `PUT /api/system/role/edit` | `PUT /api/system/role/edit` | ✅ |
| 角色 | 删除 | `DELETE /api/system/role/remove` | `DELETE /api/system/role/remove` | ✅ |
| 角色 | 分配菜单 | `PUT /api/system/role/:roleId/menus` | `PUT /api/system/role/{roleId}/menus` | ✅ |
| 菜单 | 列表 | `GET /api/system/menu/list` | `GET /api/system/menu/list` | ✅ |
| 部门 | 列表 | `GET /api/system/dept/list` | `GET /api/system/dept/list` | ✅ |
| 字典 | 列表 | `GET /api/system/dict/data/list` | `GET /api/system/dict/data/list` | ✅ |
| 配置 | 列表 | `GET /api/system/config/list` | `GET /api/system/config/list` | ✅ |
| 主题 | 当前主题 | `GET /api/system/theme/current` | `GET /api/system/theme/current` | ✅ |
| 主题 | 编辑 | `PUT /api/system/theme/edit` | `PUT /api/system/theme/edit` | ✅ |
| 仪表盘 | 统计 | `GET /api/system/dashboard/stats` | `GET /api/system/dashboard/stats` | ✅ |
| 仪表盘 | 最近日志 | `GET /api/system/dashboard/recent-logs` | `GET /api/system/dashboard/recent-logs` | ✅ |
| 全局搜索 | 搜索 | `GET /api/system/global-search` | `GET /api/system/global-search` | ✅ |

## 字段命名规范

### 数据库层

数据库表使用 **snake_case** 命名，两套后端共享同一 MySQL 数据库（`sql/Init.sql`）：

```sql
CREATE TABLE sys_user (
    user_id   VARCHAR(20) PRIMARY KEY,
    user_name VARCHAR(50),
    tenant_id VARCHAR(20),
    dept_id   VARCHAR(20),
    ...
);
```

### API 层

API 请求和响应统一使用 **camelCase** 命名，两套后端均需完成 snake_case ↔ camelCase 转换。

| 数据库（snake_case） | API（camelCase） |
|----------------------|-------------------|
| `user_id` | `userId` |
| `user_name` | `userName` |
| `tenant_id` | `tenantId` |
| `dept_id` | `deptId` |
| `role_ids` | `roleIds` |
| `create_time` | `createTime` |
| `update_time` | `updateTime` |
| `is_admin` | `isAdmin` |
| `page_num` | `pageNum` |
| `page_size` | `pageSize` |

### 实现方式

- **Koa**：CRUD 工厂内置 `rowToCamel()` 和 `toSnake()` 工具函数，自动完成转换
- **Java**：MyBatis-Plus 配置 `map-underscore-to-camel-case: true` 自动完成映射

## 权限标识规范

### 格式

```
{module}:{resource}:{action}
```

### 实现差异

| 后端 | 格式 | 示例 |
|------|------|------|
| Koa | `{module}:{resource}:{action}` | `system:user:list` |
| Java | `PERM_{module}:{resource}:{action}` | `PERM_system:user:list` |

> **注意**：Java 后端使用 `PERM_` 前缀以适配 Spring Security 的 `hasAuthority()` 方法。前端和后端数据库存储的权限标识无需前缀，Java 后端在 `LoginUserService` 加载权限时自动添加 `PERM_` 前缀。

### 权限标识清单

| 模块 | 权限标识 | 说明 |
|------|----------|------|
| 用户 | `system:user:list` | 查看用户列表 |
| 用户 | `system:user:add` | 新增用户 |
| 用户 | `system:user:edit` | 编辑用户 |
| 用户 | `system:user:remove` | 删除用户 |
| 用户 | `system:user:status` | 修改用户状态 |
| 用户 | `system:user:import` | 导入用户 |
| 用户 | `system:user:export` | 导出用户 |
| 用户 | `system:user:kick` | 踢用户下线 |
| 角色 | `system:role:list` | 查看角色列表 |
| 角色 | `system:role:add` | 新增角色 |
| 角色 | `system:role:edit` | 编辑角色 |
| 角色 | `system:role:remove` | 删除角色 |
| 角色 | `system:role:assignMenu` | 分配菜单权限 |
| 菜单 | `system:menu:list` | 查看菜单列表 |
| 菜单 | `system:menu:add` | 新增菜单 |
| 菜单 | `system:menu:edit` | 编辑菜单 |
| 菜单 | `system:menu:remove` | 删除菜单 |
| 部门 | `system:dept:list` | 查看部门列表 |
| 部门 | `system:dept:add` | 新增部门 |
| 部门 | `system:dept:edit` | 编辑部门 |
| 部门 | `system:dept:remove` | 删除部门 |
| 字典 | `system:dict:list` | 查看字典列表 |
| 字典 | `system:dict:add` | 新增字典 |
| 字典 | `system:dict:edit` | 编辑字典 |
| 字典 | `system:dict:remove` | 删除字典 |
| 配置 | `system:config:list` | 查看配置列表 |
| 配置 | `system:config:add` | 新增配置 |
| 配置 | `system:config:edit` | 编辑配置 |
| 配置 | `system:config:remove` | 删除配置 |
| 主题 | `system:theme:list` | 查看主题列表 |
| 主题 | `system:theme:edit` | 编辑主题配置 |

## 多租户逻辑一致

两套后端必须在以下租户相关行为上保持一致：

### 租户注入

- **Koa**：`tenantMiddleware` 从 JWT 中提取 `tenantId`，写入 `ctx.state.tenantId`。CRUD 工厂自动在 SQL 中附加 `WHERE tenant_id = ?`
- **Java**：`JwtAuthenticationFilter` 从 JWT Claims 中提取 `tenantId`，写入 `TenantContext`（ThreadLocal）。Service 层在 LambdaQueryWrapper 中手动附加 `.eq(SysEntity::getTenantId, tenantId)`

### 平台租户

- 租户 ID `000000` 为平台租户，拥有跨租户访问权限
- 两套后端均需对平台租户跳过租户隔离和 Data Scope 校验

### 跨租户检测

- Koa 后端在权限中间件中检测跨租户访问并记录安全审计日志
- Java 后端应在 Service 层实现类似检测逻辑

## 请求参数规范

### 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `pageNum` | `number` | `1` | 页码（从 1 开始） |
| `pageSize` | `number` | `10` | 每页条数（最大 100） |

### 搜索参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `keyword` | `string` | - | 关键字模糊搜索（匹配 searchFields 配置的字段） |

其他 query 参数作为精确匹配过滤条件。

### 鉴权请求头

| 头名称 | 说明 |
|--------|------|
| `Authorization` | `Bearer {accessToken}` |

## 错误处理规范

### HTTP 状态码

| 状态码 | 场景 |
|--------|------|
| 200 | 成功 |
| 400 | 参数校验失败 |
| 401 | 未认证（Token 无效/过期） |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 429 | 限流 |
| 500 | 服务器内部错误 |

### 响应体中的 code

| code | 场景 |
|------|------|
| 200 | 成功 |
| 401 | 未认证 |
| 403 | 无权限 |
| 500 | 服务器错误 |

## 兼容性检查清单

新增或修改 API 时，请确保两套后端同步更新以下内容：

- [ ] API 路径一致（`/api/{module}/{resource}/{action}`）
- [ ] HTTP 方法一致（GET / POST / PUT / DELETE）
- [ ] 请求参数命名一致（camelCase）
- [ ] 响应字段命名一致（camelCase）
- [ ] 响应结构一致（`{ code, message, data, total }`）
- [ ] 权限标识一致（去掉 `PERM_` 前缀后）
- [ ] 分页参数一致（`pageNum` / `pageSize`）
- [ ] 多租户隔离行为一致
- [ ] 错误处理行为一致
- [ ] 密码加密算法一致（Argon2 / Argon2id）

## 参考文档

- [Koa 后端架构](./backend-koa.md)
- [Java 后端架构](./backend-java.md)
- [CRUD 工厂（双后端对比）](./crud.md)
