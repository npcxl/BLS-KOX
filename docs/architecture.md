# 架构设计

## 请求链路

```
HTTP Request
  ↓
API Versioning — 路由前缀识别 (/api/v1/ | /openapi/v1/ | /internal/)
  ↓
Blocked IP Middleware (P10 安全中心)
  ↓
Request Context (traceId/requestId)
  ↓
HTTP Metrics (P5 Prometheus)
  ↓
Tenant Middleware (提取 tenant_id)
  ↓
Replay Protection (防重放)
  ↓
Rate Limiter (限流)
  ↓
JWT Auth (Session Center 校验)
  ↓
Data Scope (P9 数据权限)
  ↓
RBAC Permission (hasPerm)
  ↓
API Handler (Service)
  ↓
Database / Redis
  ↓
Audit Log → Security Event Center (P10) → Auto-dispose
  ↓
Prometheus Metrics
```

## 模块分层

| 层 | 路径 | 说明 |
|----|------|------|
| API | `src/api/` | 路由注册 + 中间件组合 |
| Middleware | `src/middleware/` | 认证/权限/租户/API版本化 |
| Middlewares | `src/middlewares/` | 防重放中间件 |
| Security | `src/security/` | Data Scope / Session Center / Event Center / Rate Limit |
| Core | `src/core/` | 数据库 / CRUD 工厂 / 审计 / 日志 |
| Outbox | `src/outbox/` | 事务性事件发布 (P7) |
| Queue | `src/queue/` | 异步任务队列 (P6) |
| Shared | `src/shared/` | JWT / Redis / Snowflake / 工具函数 |
| Observability | `src/observability/` | Prometheus Metrics |

## API 版本化 (P11)

详见 [API 版本化文档](./api-versioning.md)。

核心设计：
- `/api/v1/` — 前端业务接口（JWT，标准鉴权）
- `/api/` — 旧路径兼容（带 Deprecation 头，180天后下线）
- `/openapi/v1/` — 第三方开放接口（API Key + HMAC 签名）
- `/internal/` — 内部服务（Service Token + IP 白名单）

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

内置：租户隔离、软删除、Snowflake ID、字段转换、Data Scope 数据权限。
