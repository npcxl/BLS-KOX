# bls-event-service — 事件中心微服务

> BLS-KOX 第一个 Koa 微服务示范。负责事件中心、安全审计、操作日志的统一接收与存储。

## 定位

- **独立 Koa 服务**，不依赖 Nacos、注册中心、网关、Kafka、Seata
- **可选启动**：不启动时主系统（bls-server）仍可正常运行
- **服务间通信**：内部 HTTP + Outbox 重试
- **共享基础设施**：与 bls-server 共用同一 MySQL/Redis

## 技术栈

| 组件 | 说明 |
|------|------|
| **运行时** | Node.js 22 + TypeScript 6 |
| **框架** | Koa 3 |
| **数据库** | MySQL 8.0 (mysql2) |
| **指标** | prom-client |
| **校验** | zod |
| **配置** | dotenv |

## API 接口

所有接口均需 `X-Internal-Token` 认证（与 bls-server 共享 `INTERNAL_SECRET`）。

### `POST /internal/events`

批量接收事件。

```json
{
  "events": [
    {
      "eventId": "evt_001",
      "tenantId": "000000",
      "userId": "000001",
      "username": "superadmin",
      "eventType": "LOGIN_SUCCESS",
      "riskLevel": "low",
      "sourceService": "bls-server",
      "sourceModule": "auth",
      "resourceType": "user",
      "resourceId": "000001",
      "requestId": "req_abc123",
      "traceId": "trace_xyz789",
      "clientIp": "192.168.1.100",
      "userAgent": "Mozilla/5.0 ...",
      "detailJson": { "loginType": "password" },
      "createdAt": "2026-07-17T06:45:00.000Z"
    }
  ]
}
```

**响应**：

```json
{
  "code": 200,
  "message": "Received 1 events",
  "data": { "success": 1, "failed": 0 }
}
```

### `GET /internal/events`

查询事件列表。

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `tenantId` | string | 租户ID |
| `eventType` | string | 事件类型 |
| `riskLevel` | string | 风险等级 |
| `startTime` | string | 开始时间 |
| `endTime` | string | 结束时间 |
| `page` | number | 页码（默认 1） |
| `pageSize` | number | 每页数量（默认 20，最大 200） |

### `GET /health`

健康检查（公开端点）。

```json
{
  "status": "UP",
  "service": "bls-event-service",
  "timestamp": "2026-07-17T06:45:00.000Z"
}
```

### `GET /metrics`

Prometheus 指标（公开端点）。

## 数据库

使用 `sys_event_log` 表（定义在 `sql/Init.sql`）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `event_id` | varchar(64) | 事件ID（主键） |
| `tenant_id` | varchar(32) | 租户ID |
| `user_id` | varchar(32) | 用户ID |
| `username` | varchar(50) | 用户名 |
| `event_type` | varchar(64) | 事件类型 |
| `risk_level` | varchar(20) | 风险等级 |
| `source_service` | varchar(64) | 来源服务 |
| `source_module` | varchar(64) | 来源模块 |
| `resource_type` | varchar(64) | 资源类型 |
| `resource_id` | varchar(32) | 资源ID |
| `request_id` | varchar(64) | 请求追踪ID |
| `trace_id` | varchar(64) | 链路追踪ID |
| `client_ip` | varchar(45) | 客户端IP |
| `user_agent` | varchar(500) | User-Agent |
| `detail_json` | json | 事件详情 |
| `created_at` | datetime | 创建时间 |

## bls-server 接入方式

### EventClient

`bls-server/src/services/event-client.ts` 提供：

- `publishEvent(event)` — 发布单个事件
- `publishEvents(events)` — 批量发布事件

**调用流程**：

1. 优先直接 HTTP POST 到 `EVENT_SERVICE_URL/internal/events`
2. 调用失败（超时/不可达）→ 写入 `outbox_event` 表
3. Outbox Publisher 后台轮询重试
4. 主业务不因 event-service 失败而失败

### 接入点

- **登录**：登录成功/失败 → `LOGIN_SUCCESS` / `LOGIN_FAILED`
- **安全事件**：`writeSecurityLog()` 写入后 → 发送对应事件
- **操作审计**：`writeOperationLog()` 写入后 → `OPERATION_AUDIT`

## 启动方式

### 本地开发

```bash
cd bls-event-service
cp .env.example .env
# 编辑 .env 配置数据库连接
npm install
npm run dev
```

### Docker Compose（profile: event）

```bash
# 启动 event-service（需要 --profile event）
docker compose --env-file .env.docker --profile event up -d --build

# 不启动 event-service（默认）
docker compose --env-file .env.docker up -d --build
```

## 验收

1. ✅ `GET /health` 返回 `{ "status": "UP" }`
2. ✅ `GET /metrics` 有 `bls_event_events_received_total` 等指标
3. ✅ event-service 启动后，Koa 登录/安全事件能写入 `sys_event_log`
4. ✅ event-service 停止后，登录不报 500
5. ✅ Outbox 能记录失败事件并重试
6. ✅ 前端代码无业务改动
7. ✅ 不启动 profile 时 event-service 不启动

## 架构说明

当前 BLS-KOX **不是全面微服务**，而是：

- **模块化单体**（bls-server / bls-java-server）
- **+ Koa 示例微服务**（bls-event-service）

Java 后端继续保持模块化单体，不拆分微服务。event-service 仅作为 Koa 微服务的示范实现。
