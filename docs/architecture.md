# 架构设计

## 请求链路

```
HTTP Request
  ↓
Request Context (traceId/requestId)
  ↓
Tenant Middleware (提取 tenant_id)
  ↓
HTTP Metrics Middleware (P5)
  ↓
Replay Protection (防重放)
  ↓
Rate Limiter (限流)
  ↓
JWT Auth (Session Center 校验)
  ↓
RBAC Permission (hasPerm)
  ↓
API Handler (Service)
  ↓
Database / Redis
  ↓
Audit Log / Metrics
```

## 模块分层

| 层 | 路径 | 说明 |
|----|------|------|
| API | `src/api/` | 路由注册 + 中间件组合 |
| Middleware | `src/middleware/` | 认证/权限/租户/HTTP Metrics |
| Middlewares | `src/middlewares/` | 防重放中间件 |
| Security | `src/security/` | Ownership Guard / Session Center / Rate Limit |
| Core | `src/core/` | 数据库 / CRUD 工厂 / 审计 / 日志 |
| Shared | `src/shared/` | JWT / Redis / Snowflake / 工具函数 |
| Observability | `src/observability/` | Prometheus Metrics |

## 路由自动注册

`src/core/router.ts` 自动扫描 `src/api/` 目录：
- `getList` → `GET /list`
- `addUser` → `POST /add-user`
- 导出 `config` 的模块自动调用 `defineCrudModule`

## CRUD 工厂

`defineCrudModule()` 单行配置自动生成：
- `GET /list` 分页列表
- `GET /:id` 详情
- `POST /add` 新增
- `PUT /edit` 编辑
- `DELETE /remove` 删除
- `PUT /status` 状态切换

内置：租户隔离、软删除、Snowflake ID、字段转换。
