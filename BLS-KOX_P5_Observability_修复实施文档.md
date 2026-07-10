# BLS-KOX P5 Observability 修复实施文档

> 项目：BLS-KOX  
> 仓库：npcxl/BLS-KOX  
> 基线分支：master  
> 验收基线 Commit：`753141f484c5c4e4d559092d11c222102e9ad25e`  
> 上一 Commit：`2429d2c6f385b57f95cbe95add09c85c646358cd`  
> 目标：修复 P5 Observability 当前未闭环项，并以成熟 Prometheus 客户端库替换自研 Metrics Registry。

---

# 1. 本轮原则

## 1.1 禁止继续维护自研 Prometheus Registry

当前：

```text
src/observability/metrics.ts
```

自行实现了：

```text
Counter
Gauge
Histogram
Prometheus exposition format
```

本轮必须替换为成熟 Prometheus Node.js 客户端库：

```text
prom-client
```

要求：

- 不再自行拼接 Prometheus 文本格式。
- 不再自行实现 Label escaping。
- 不再自行实现 Histogram bucket 导出逻辑。
- 不再自行维护 Counter / Gauge / Histogram 内存 Map。
- `/api/metrics` 直接输出 Registry 提供的标准 exposition format。
- 支持默认 Node.js 指标采集。
- 所有业务指标继续由统一 observability 模块导出。

---

# 2. P5 当前验收结论

| 验收项 | 当前状态 | 本轮要求 |
|---|---|---|
| `/api/metrics` | 未通过 | 改用 prom-client Registry |
| HTTP Requests | 部分通过 | 保留并修复 route label |
| HTTP Errors | 部分通过 | 接入 prom-client |
| HTTP Latency | 部分通过 | 接入 Histogram |
| Security Metrics | 基本通过 | 迁移到 prom-client |
| DB Metrics | 未通过 | 增加错误率和耗时 |
| Redis Metrics | 未通过 | 增加错误率和耗时 |
| Active Sessions | 未闭环 | 接真实 SessionCenter |
| WebSocket Connections | 未闭环 | 接真实连接生命周期 |
| Logger Context | 通过 | 保持 |
| Alert Rules | 未通过 | 增加至少 5 条规则 |
| Metrics Tests | 未通过 | 增加单测和集成测试 |
| CI 验证 | 待复验 | 修复后必须以最新 SHA 验收 |

---

# 3. Task 1：替换自研 Metrics Registry

优先级：

```text
P0
```

## 3.1 安装依赖

在：

```text
bls-server/package.json
```

增加：

```text
prom-client
```

不要锁死本文中的具体版本号，由当前项目包管理器安装兼容版本并提交 lockfile。

---

## 3.2 重构文件

目标文件：

```text
bls-server/src/observability/metrics.ts
```

删除当前自研：

```text
class Counter
class Gauge
class Histogram
collectMetrics() 手工拼接
```

改成统一 Registry。

推荐结构：

```ts
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'bls_kox_',
});
```

业务指标统一注册到：

```text
metricsRegistry
```

不要使用多个独立 Registry，除非后续有非常明确的隔离需求。

---

## 3.3 推荐指标定义

### HTTP

```text
bls_kox_http_requests_total
bls_kox_http_request_duration_seconds
bls_kox_http_request_errors_total
```

Labels：

```text
method
route
status
```

注意：

- duration Histogram 不建议带 status，避免不必要的时间序列膨胀。
- requests_total 可以保留 status。
- route 必须是标准化路由模板，禁止直接使用任意 raw path。

---

### Security

```text
bls_kox_security_events_total
bls_kox_rate_limit_rejected_total
bls_kox_replay_rejected_total
bls_kox_idempotency_conflict_total
bls_kox_refresh_reuse_detected_total
bls_kox_cross_tenant_access_total
bls_kox_login_failed_total
```

现有埋点逻辑可以保留，但指标对象改为 prom-client Counter。

---

### Database

必须增加：

```text
bls_kox_db_query_duration_seconds
bls_kox_db_query_errors_total
```

推荐 Labels：

```text
operation
```

operation 使用受控枚举：

```text
query
query_one
execute
transaction
kysely_execute
kysely_execute_take_first
kysely_execute_take_first_or_throw
```

禁止：

```text
sql
table
tenantId
userId
requestId
```

作为 Prometheus Label。

---

### Redis

必须增加：

```text
bls_kox_redis_operation_duration_seconds
bls_kox_redis_operation_errors_total
```

推荐 Label：

```text
operation
```

operation 必须为受控命令名称或受控业务分类，禁止 key 作为 Label。

---

### Session / WebSocket

```text
bls_kox_active_sessions
bls_kox_websocket_connections
```

均使用 Gauge。

---

# 4. Task 2：修复 `/api/metrics`

优先级：

```text
P0
```

文件：

```text
bls-server/src/core/router.ts
```

目标：

```ts
router.get('/metrics', async (ctx) => {
  ctx.set('Content-Type', metricsRegistry.contentType);
  ctx.body = await metricsRegistry.metrics();
});
```

验收要求：

```text
GET /api/metrics
```

返回：

```text
HTTP 200
```

Content-Type 必须使用 Registry 的标准 content type。

必须能被 Prometheus parser 正常解析。

---

# 5. Task 3：HTTP Metrics 修复

优先级：

```text
P1
```

文件：

```text
bls-server/src/middleware/http-metrics.ts
```

当前问题：

```ts
ctx._matchedRoute ?? ctx.path
```

对于 Router 前提前返回的请求，可能将动态 raw path 写入 Label，形成高基数。

## 修复要求

route Label 优先级建议：

```text
ctx._matchedRoute
↓
ctx.state.metricsRoute
↓
规则模板路径
↓
/unmatched
```

禁止直接 fallback：

```text
ctx.path
```

用于 Prometheus route Label。

Rate Limit / Replay Protection 等提前返回的中间件，如果已有匹配规则，应把标准化路径写入：

```ts
ctx.state.metricsRoute
```

例如：

```ts
ctx.state.metricsRoute = rule.path;
```

最终：

```ts
const route =
  ctx._matchedRoute ??
  ctx.state.metricsRoute ??
  '/unmatched';
```

---

# 6. Task 4：Database Metrics 闭环

优先级：

```text
P0
```

目标文件：

```text
bls-server/src/core/database.ts
```

当前数据库层已经有统一入口：

```text
withRetry()
query()
queryOne()
execute()
transaction()
Kysely QueryBuilder Proxy
```

本轮必须在基础设施层统一埋点。

---

## 6.1 推荐新增统一观测包装

示意：

```ts
async function observeDbOperation<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const end = dbQueryDurationSeconds.startTimer({ operation });

  try {
    return await fn();
  } catch (error) {
    dbQueryErrorsTotal.inc({ operation });
    throw error;
  } finally {
    end();
  }
}
```

然后：

```text
query
queryOne
execute
transaction
Kysely execute*
```

全部走统一包装。

---

## 6.2 重试统计口径

要求明确区分：

```text
单次 attempt 失败
```

和：

```text
最终 operation 失败
```

本阶段建议：

```text
db_query_errors_total
```

统计最终操作失败，不要把内部每一次 Retry attempt 都计算成完整业务错误。

如后续需要重试指标，可单独增加：

```text
bls_kox_db_query_retries_total
```

不要混用。

---

# 7. Task 5：Redis Metrics 闭环

优先级：

```text
P0
```

目标文件：

```text
bls-server/src/shared/utils/redis.ts
```

当前 Redis 入口集中在：

```text
getRedisClient()
connectRedis()
closeRedis()
```

但业务可能直接拿到 ioredis client 后调用命令，因此仅在 connect/close 埋点不够。

## 推荐方案

优先采用统一 instrumentation：

```text
ioredis command event / wrapper / middleware-style instrumentation
```

要求：

- 所有 Redis command error 可统一计数。
- 所有 Redis operation latency 可统一统计。
- 禁止每个业务 Service 手工写 Metrics。
- 禁止将 Redis Key 放入 Label。
- operation 只允许命令名或受控分类。

推荐指标：

```text
bls_kox_redis_operation_duration_seconds{operation="get"}
bls_kox_redis_operation_duration_seconds{operation="set"}
bls_kox_redis_operation_errors_total{operation="eval"}
```

需要特别覆盖：

```text
GET
SET
DEL
EXPIRE
EVAL / EVALSHA
PING
```

至少保证 Replay Protection、Rate Limit、Session Center 所用 Redis 命令都能被观测。

---

# 8. Task 6：Session Gauge 接入真实 SessionCenter

优先级：

```text
P1
```

指标：

```text
bls_kox_active_sessions
```

要求：

- 不允许仅定义 Gauge。
- 必须接真实 Access Session 生命周期。
- Session 创建时更新。
- Session revoke 时更新。
- revokeAll 时更新。
- Session TTL 自然过期不能依赖简单 `inc/dec` 保证准确性。

因此推荐：

```text
Gauge callback / collect 时查询可靠来源
```

或：

```text
维护可校准的集中计数机制
```

不要简单：

```text
login => inc
logout => dec
```

因为：

```text
TTL 过期
Redis Key 淘汰
批量 revokeAll
异常断链
```

都会导致 Gauge 漂移。

---

# 9. Task 7：WebSocket Gauge 生命周期闭环

优先级：

```text
P1
```

指标：

```text
bls_kox_websocket_connections
```

要求：

```text
connection => inc
close => dec
terminate => 确保最终 dec
shutdown => 所有连接正确清理
```

必须防止重复 dec。

推荐每个 socket 增加一次性 finalize guard：

```ts
let finalized = false;

function finalizeConnection() {
  if (finalized) return;
  finalized = true;
  websocketConnections.dec();
}
```

以下路径统一调用：

```text
close
error 后 terminate
heartbeat timeout
server shutdown
认证失败后的连接关闭
```

同时完成当前 P4 遗留的 WebSocket Timer 清理闭环时，确保 P4 与 P5 验收分别记录，不混为同一项。

---

# 10. Task 8：Refresh Reuse 指标去除文案依赖

优先级：

```text
P2
```

当前逻辑不能依赖：

```text
title.includes('Refresh Token 复用')
```

必须增加结构化安全事件类型：

```text
REFRESH_TOKEN_REUSE
```

然后：

```text
eventType === REFRESH_TOKEN_REUSE
↓
refreshReuseDetectedTotal.inc()
```

验收标准：

- 修改 title 文案不影响指标。
- 测试覆盖 eventType 触发。
- 安全日志与 Prometheus Counter 同时生效。

---

# 11. Task 9：Prometheus Alert Rules

优先级：

```text
P0
```

新增目录建议：

```text
deploy/
└── prometheus/
    ├── prometheus.yml
    └── rules/
        └── bls-kox-alerts.yml
```

至少配置 5 条真实规则。

建议首批 7 条：

```text
1. BLSKOXHigh5xxErrorRate
2. BLSKOXHighP95Latency
3. BLSKOXDatabaseErrorsIncreasing
4. BLSKOXRedisErrorsIncreasing
5. BLSKOXRefreshReuseDetected
6. BLSKOXCrossTenantAccessDetected
7. BLSKOXHighRateLimitRejectRate
```

---

## 11.1 5xx Error Rate

目标：

```text
5xx Error Rate > 5%
```

推荐持续窗口：

```text
5m
```

并设置：

```text
for: 5m
```

避免瞬时抖动告警。

---

## 11.2 P95 Latency

目标：

```text
P95 > 1s
```

使用 Histogram：

```text
histogram_quantile(
  0.95,
  sum by (le) (
    rate(bls_kox_http_request_duration_seconds_bucket[5m])
  )
)
```

---

## 11.3 DB Errors Increasing

基于：

```text
increase(bls_kox_db_query_errors_total[5m])
```

阈值根据实际环境配置。

---

## 11.4 Redis Errors Increasing

基于：

```text
increase(bls_kox_redis_operation_errors_total[5m])
```

---

## 11.5 Refresh Reuse

要求：

```text
increase(bls_kox_refresh_reuse_detected_total[5m]) > 0
```

该告警建议使用高等级。

---

## 11.6 Cross Tenant Access

要求：

```text
increase(bls_kox_cross_tenant_access_total[5m]) > 0
```

该告警建议使用高等级。

---

## 11.7 Rate Limit Reject Spike

不能使用固定总量。

推荐：

```text
rate(bls_kox_rate_limit_rejected_total[5m])
```

结合环境基线设置阈值。

---

# 12. Task 10：测试要求

优先级：

```text
P1
```

至少增加：

```text
src/observability/__tests__/metrics.test.ts
src/middleware/__tests__/http-metrics.test.ts
tests/integration/metrics.integration.test.ts
```

实际目录可按项目现有测试结构调整。

---

## 12.1 Metrics Unit Tests

必须覆盖：

```text
Counter increment
Histogram observe
Gauge set/inc/dec
Registry 输出
业务 Metrics 是否注册
重复注册保护
```

---

## 12.2 HTTP Metrics Tests

覆盖：

```text
200 请求
400 请求
500 请求
延迟 Histogram
matched route
unmatched route
Rate Limit 提前返回
Replay 提前返回
动态 URL 不产生高基数 label
```

---

## 12.3 Metrics Integration Test

至少验证：

```text
GET /api/metrics => 200
Content-Type 正确
输出可被 prom-client 标准 Registry 生成
包含 HTTP 指标
包含 Security 指标
包含 DB 指标
包含 Redis 指标
```

测试不能仅判断：

```text
body.includes('http_requests_total')
```

还应实际触发请求或基础设施错误路径后验证 Counter/Histogram 发生变化。

---

# 13. Task 11：CI 要求

修复完成后，最新 Commit 必须执行：

```text
npm run lint
npm run test
npm run build
```

GitHub Actions 必须对最新提交有明确成功结果。

下一次验收必须重新执行：

```text
1. 获取 master 最新 SHA
2. 获取上一 commit SHA
3. compare diff
4. 检查 workflow run/status
5. 按本文件逐项验收
```

不允许沿用当前：

```text
753141f4...
```

的旧结论。

---

# 14. 推荐实施顺序

```text
P5-FIX-01
删除自研 Registry
接入 prom-client
↓
P5-FIX-02
修复 /api/metrics
↓
P5-FIX-03
迁移 HTTP / Security Metrics
↓
P5-FIX-04
DB Metrics
↓
P5-FIX-05
Redis Metrics
↓
P5-FIX-06
Session Gauge
↓
P5-FIX-07
WebSocket Gauge
↓
P5-FIX-08
Alert Rules
↓
P5-FIX-09
Unit Test
↓
P5-FIX-10
Integration Test
↓
P5-FIX-11
CI
↓
P5 Final Acceptance
```

---

# 15. Codex 执行要求

将以下要求交给 Codex：

## 15.1 修改原则

```text
1. 只处理 P5 Observability。
2. 不顺手修改 P3/P4/P6。
3. 不使用自研 Prometheus Registry。
4. 使用 prom-client。
5. Metrics 集中定义。
6. DB/Redis 在基础设施层统一埋点。
7. 禁止 tenantId/userId/requestId/sql/raw Redis key 作为 Label。
8. HTTP route Label 必须低基数。
9. 至少新增 5 条可部署 Prometheus Alert Rules。
10. 必须补 Unit Test + Integration Test。
11. 必须通过 lint/test/build。
```

## 15.2 完成后输出

Codex 完成后必须输出：

```text
1. 修改文件列表
2. 新增依赖
3. Metrics 列表
4. Label 列表
5. Alert Rule 列表
6. 测试列表
7. lint 结果
8. test 结果
9. build 结果
10. 最新 commit SHA
```

---

# 16. P5 最终验收 Checklist

## Metrics 基础

- [ ] 使用 prom-client。
- [ ] 自研 Counter/Gauge/Histogram 已删除。
- [ ] 自研 Prometheus string exporter 已删除。
- [ ] Registry 单一且明确。
- [ ] Node.js default metrics 已接入。
- [ ] `/api/metrics` 返回标准格式。

## HTTP

- [ ] Request Counter 可观察。
- [ ] Error Counter 可观察。
- [ ] Duration Histogram 可观察。
- [ ] route Label 低基数。
- [ ] 提前返回路径不会使用 raw dynamic path。

## Security

- [ ] Security Events 可观察。
- [ ] Rate Limit Reject 可观察。
- [ ] Replay Reject 可观察。
- [ ] Idempotency Conflict 可观察。
- [ ] Refresh Reuse 可观察。
- [ ] Cross Tenant Access 可观察。
- [ ] Login Failed 可观察。
- [ ] Refresh Reuse 不依赖 title 文案匹配。

## Database

- [ ] DB Query Duration 可观察。
- [ ] DB Errors 可观察。
- [ ] query/queryOne/execute/transaction 覆盖。
- [ ] Kysely execute 系列覆盖。
- [ ] SQL 内容没有成为 Label。

## Redis

- [ ] Redis Duration 可观察。
- [ ] Redis Errors 可观察。
- [ ] 关键 Redis 命令覆盖。
- [ ] Redis Key 没有成为 Label。

## Session

- [ ] Active Sessions Gauge 已接真实数据源。
- [ ] 不会因 TTL/revokeAll 导致长期漂移。

## WebSocket

- [ ] Connection Gauge 已接入。
- [ ] Close 正确 dec。
- [ ] Heartbeat Timeout 正确 dec。
- [ ] Shutdown 正确清理。
- [ ] 不会重复 dec。
- [ ] Timer 清理闭环。

## Alert

- [ ] 至少 5 条真实 Prometheus Rule。
- [ ] 规则 YAML 可加载。
- [ ] 5xx 告警存在。
- [ ] P95 告警存在。
- [ ] DB Error 告警存在。
- [ ] Redis Error 告警存在。
- [ ] Security Critical 告警存在。

## Tests / CI

- [ ] Metrics Unit Test。
- [ ] HTTP Metrics Test。
- [ ] `/api/metrics` Integration Test。
- [ ] DB Metrics Test。
- [ ] Redis Metrics Test。
- [ ] Security Metrics Test。
- [ ] lint 通过。
- [ ] test 通过。
- [ ] build 通过。
- [ ] GitHub Actions 最新 SHA 通过。

---

# 17. 完成判定

只有以下条件全部满足，才能把：

```text
P5 Observability
```

标记为：

```text
✅ Completed
```

否则状态保持：

```text
🟡 In Progress
```

下一阶段 P6 Queue / Worker 可以做设计准备，但在 P5 P0/P1 问题验收通过前，不建议进入大规模主线实现。
