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
| `GET /api/metrics` | Prometheus 格式指标（生产默认关闭匿名访问，见 `METRICS_PUBLIC`） |
| `GET /api/health` | 存活探针：恒返回 `{"status":"ok"}`，**不检查任何依赖** |
| `GET /api/ready` | 就绪探针：探测**全部**依赖，核心依赖不可用 → `503 not_ready`；非核心不可用 → `200` 且 `degraded:true` |
| `GET /internal/health` | 内部存活探针（需内部鉴权） |
| `GET /internal/services` | 依赖详细视图（需内部鉴权）：地址、耗时、失败原因、启动命令 |
| `GET /internal/metrics` | Prometheus 指标（需内部鉴权） |

### 依赖自检（启动 + 运行期）

依赖清单收敛在 `bls-server/src/observability/service-health.ts`，启动报告 / `/api/ready` /
`/internal/services` / `npm run services:check` 用的是**同一份注册表**，结论不会互相矛盾。

Koa 在 `server.listen` **之后立即**做自检，打印 **`KOX 服务检测`** 表格（`[ OK ]` / `[FAIL]` / `[SKIP]` + 服务名 + 类别 + 耗时 + 地址 + 检测结果；
单元格按需折行，中文按 2 列宽对齐）。
地址列按连通状态着色：**连通=绿 / 不通=红 / 未配置=灰**；仅在真实终端着色，管道、重定向到文件、
CI 与日志采集一律输出纯文本（也可用 `NO_COLOR` 关闭、`FORCE_COLOR=1` 强制）。

该表格是自检的**唯一**输出（没有汇总行、没有处理建议段落，也不额外打 WARN/ERROR 结构化日志）；
启动命令等细节保留在数据里，通过 `GET /internal/services` 获取。运行期状态查 `/api/ready`。

```bash
cd bls-server && npm run services:check   # 退出码 1 = 核心依赖不可用
```

| 依赖 | 类别 | 探测方式 / 地址来源 |
|------|------|--------------------|
| MySQL | core | `DB_HOST` / `DB_PORT` / `DB_NAME` |
| Redis | core | `REDIS_HOST` / `REDIS_PORT`（`REDIS_ENABLED=false` 时记 `disabled`） |
| bls-realtime-ws | conditional | Koa 自身实时通道，**WebSocket 握手**探测（握手阶段不校验 token）；`WS_ENABLED=false` 时跳过 |
| bls-event-service | optional | `EVENT_SERVICE_URL` + `/health`（未配置则跳过） |
| bls-ai-service | optional | `AI_SERVICE_URL` + `/health`（开发默认 `http://127.0.0.1:7201`） |
| bls-captcha-service | conditional | `TIANAI_BASE_URL` + `/health`（**2xx + 合法 JSON 对象**才算健康） |

> Java / Rust 后端是 Koa 的**平替方案**（同时只有一个在跑，既不是 Koa 的依赖也没有联动关系），
> 因此不在这张表里。

相关环境变量：

| Env | 默认 | 说明 |
|-----|------|------|
| `SERVICE_CHECK_STRICT` | 生产 `true` / 开发 `false` | 核心依赖不可用时是否直接拒绝启动（自检在 listen 之后，发现即 `exit(1)`） |
| `SERVICE_CHECK_TIMEOUT_MS` | `5000` | 单个依赖探测超时；DB/Redis 跨网络部署时可调大 |
| `SERVICE_CHECK_INTERVAL_MS` | `60000` | 运行期巡检间隔，`0` = 关闭；仅在依赖下线/恢复的瞬间记日志 |
| `AI_SERVICE_URL` | 开发 `http://127.0.0.1:7201` | AI 微服务探测地址（生产必须显式配置，未配置即视为未部署） |

> 探测前会先 `warmup`（动态 import、连接池初始化），避免冷启动把「模块编译慢」误判成
> 「服务没开」——那在生产严格模式下会拒绝启动一个完全健康的实例。

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
