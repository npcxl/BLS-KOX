# 可观测性

## 概述

BLS-KOX 提供三层可观测性：日志（Logging）、指标（Metrics）、链路追踪（Tracing）。

> 当前阶段：日志 + 指标为主。分布式链路追踪通过 requestId/traceId 在日志中关联。

## 日志

### 格式

```
2026-01-01 12:00:00.000 [http-nio-8080-exec-1] INFO [req-abc123] [trace-def456] [tenant-000000] c.b.s.c.AuthController - 用户登录成功
```

包含字段：时间、线程、级别、requestId、traceId、tenantId、Logger、消息。

### requestId / traceId

| 字段 | 来源 | 说明 |
|------|------|------|
| `requestId` | `X-Request-Id` Header 或自动生成 | 单次请求唯一标识 |
| `traceId` | `X-Trace-Id` Header 或自动生成 | 跨服务调用链标识 |
| `tenantId` | JWT Token | 认证后注入 |

### 日志注入实现

- `TraceFilter`：注入 requestId/traceId 到 MDC 和 Response Header
- `TraceContext`：业务代码手动注入 tenantId/userId
- `logging.pattern.console`：日志格式包含 `%X{requestId}`、`%X{traceId}`、`%X{tenantId}`

---

## Prometheus Metrics

### Java 端点

| 端点 | 说明 |
|------|------|
| `GET /internal/metrics` | Prometheus 格式指标 |
| `GET /internal/health` | 健康检查 |
| `GET /internal/info` | 应用信息 |

### Koa 端点

| 端点 | 说明 |
|------|------|
| `GET /api/metrics` | Prometheus 格式指标 |
| `GET /api/health` | 健康检查 |

### 指标清单

#### HTTP

| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_http_requests_total` | Counter | route, method, status |
| `bls_kox_http_request_duration_seconds` | Histogram | route, method |
| `bls_kox_http_request_errors_total` | Counter | route, method |

#### 数据库

| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_db_query_duration_seconds` | Histogram | operation |
| `bls_kox_db_query_errors_total` | Counter | operation |

#### Redis

| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_redis_operation_duration_seconds` | Histogram | operation |
| `bls_kox_redis_operation_errors_total` | Counter | operation |

#### 安全

| 指标 | 类型 | 标签 |
|------|------|------|
| `bls_kox_security_events_total` | Counter | event_type, risk_level |
| `bls_kox_rate_limit_rejected_total` | Counter | route, dimension |
| `bls_kox_replay_rejected_total` | Counter | reason |
| `bls_kox_idempotent_conflict_total` | Counter | type |
| `bls_kox_refresh_reuse_detected_total` | Counter | |
| `bls_kox_cross_tenant_access_total` | Counter | |
| `bls_kox_login_failed_total` | Counter | |

#### 分布式能力

| 指标 | 类型 | 说明 |
|------|------|------|
| `bls_ratelimit_rejected_total` | Counter | 限流拒绝次数 |
| `bls_idempotent_conflict_total` | Counter | 幂等冲突次数 |
| `bls_idempotent_cache_hit_total` | Counter | 幂等缓存命中次数 |
| `bls_lock_failed_total` | Counter | 分布式锁获取失败次数 |
| `bls_lock_acquired_total` | Counter | 分布式锁获取成功次数 |

#### 状态

| 指标 | 类型 |
|------|------|
| `bls_kox_active_sessions` | Gauge |
| `bls_kox_websocket_connections` | Gauge |

---

## Prometheus 配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'bls-kox-koa'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['bls-server:6001']

  - job_name: 'bls-kox-java'
    metrics_path: '/internal/metrics'
    static_configs:
      - targets: ['bls-java-server:8080']
```

---

## 告警规则

见 `deploy/prometheus/rules/bls-kox-alerts.yml`，包含：

- 5xx 错误率 > 5%
- P95 延迟 > 2s
- 数据库错误 > 10/min
- Redis 错误 > 5/min
- Refresh Token 复用检测
- 跨租户访问检测
- 限流触发 > 50/min
- 分布式锁失败 > 10/min

---

## 链路追踪（可选）

通过 Micrometer Tracing 扩展：

```xml
<!-- 未来添加 -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
```
