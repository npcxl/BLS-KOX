# BLS-KOX 后期增强路线文档

> 项目：BLS-KOX  
> 定位：开源后台开发框架 / 多租户管理系统模板  
> 文档用途：用于当前核心功能稳定后，分阶段增强工程能力与可扩展性。  
> 原则：优先服务开源项目的可维护性、可运行性、可扩展性，不追求一次性建设重型企业平台。

---

# 1. 后期增强目标

当前项目已经具备：

```text
多租户
RBAC
JWT Access / Refresh
Session Center
Replay Protection
Rate Limit
Security Audit
WebSocket
Prometheus Metrics
Queue / Worker 基础
Outbox 基础
API Version 基础
Webhook 基础
```

后期增强重点放在以下 6 项：

```text
1. CI/CD 流水线
2. 分布式 Worker
3. Outbox 最终一致性
4. API 版本管理
5. Webhook 机制
6. 单元测试覆盖率
```

总体目标：

```text
代码可验证
↓
发布可重复
↓
异步任务可扩展
↓
事件可可靠分发
↓
API 可演进
↓
外部集成可稳定
↓
核心逻辑有测试保护
```

---

# 2. 推荐实施顺序

建议顺序：

```text
E1 CI/CD
↓
E2 测试覆盖率
↓
E3 分布式 Worker
↓
E4 Outbox 最终一致性
↓
E5 API Versioning
↓
E6 Webhook Platform
```

原因：

```text
CI/CD
负责保证每次修改可验证

测试
负责保证重构不破坏核心逻辑

Worker
提供异步执行基础

Outbox
提供可靠事件分发

API Version
解决接口演进

Webhook
建立对外事件能力
```

---

# 3. E1：CI/CD 流水线增强

## 3.1 当前目标

当前应至少保证：

```text
Push
Pull Request
↓
Install
Lint
Test
Build
```

后期增强为：

```text
代码检查
↓
自动测试
↓
构建
↓
安全检查
↓
Docker Image
↓
Release
↓
可选部署
```

---

## 3.2 第一阶段：基础 CI

优先级：

```text
P0
```

建议两个独立 Job：

```text
server
admin
```

### Server

```text
npm ci
npm run lint
npm test
npm run build
```

### Admin

```text
npm ci
npm run lint
npm run build
npm test
```

前端测试框架未建立前：

```text
npm ci
npm run lint
npm run build
```

---

## 3.3 第二阶段：缓存与矩阵

建议：

```text
Node.js 20
Node.js 22
```

开源初期可以先：

```text
Node.js 22
```

稳定后再加 Matrix。

缓存：

```text
npm cache
Docker Layer Cache
```

---

## 3.4 第三阶段：安全检查

后续可增加：

```text
npm audit
Dependabot
CodeQL
Dependency Review
```

不建议一开始把：

```text
npm audit high
```

直接作为硬阻塞条件，避免第三方依赖误报导致开发停滞。

建议：

```text
Critical
→ 阻塞

High
→ Review

Medium / Low
→ 非阻塞
```

---

## 3.5 第四阶段：Release Pipeline

Tag：

```text
v0.1.0
v0.2.0
v1.0.0
```

流程：

```text
git tag
↓
GitHub Actions
↓
Build
↓
Test
↓
Docker Image
↓
GitHub Release
↓
CHANGELOG
```

建议镜像：

```text
ghcr.io/<owner>/bls-kox-server
ghcr.io/<owner>/bls-kox-admin
```

---

## 3.6 CI/CD 验收标准

- [ ] Server CI。
- [ ] Admin CI。
- [ ] lint。
- [ ] test。
- [ ] build。
- [ ] PR 自动执行。
- [ ] master Push 自动执行。
- [ ] Tag Release。
- [ ] Docker Image 构建。
- [ ] GitHub Release 自动生成。

---

# 4. E2：单元测试覆盖率

## 4.1 目标

不要追求：

```text
100% Coverage
```

开源项目推荐：

```text
核心逻辑高覆盖
边缘模块适度覆盖
UI 样式不强求
```

建议目标：

```text
核心模块：80%+
全仓库：60%+
```

---

## 4.2 第一批必须覆盖模块

### Auth

```text
Login
Access Token Validate
Refresh Rotation
Refresh Reuse
Logout
revokeAll
multiLogin=false
Password Change
User Disabled
```

### Tenant

```text
tenant_id 自动注入
跨租户访问拒绝
Ownership Guard
Storage Tenant Isolation
```

### Replay Protection

```text
Timestamp Missing
Timestamp Expired
Nonce Missing
Nonce Replay
Signature Invalid
Idempotency Conflict
```

### Rate Limit

```text
Allow
Reject
Dimension
Route Key
Redis Failure Fallback
```

---

## 4.3 第二批测试

### Queue

```text
enqueue
dequeue
retry
maxAttempts
timeout
duplicate claim prevention
graceful stop
```

### Outbox

```text
appendEvent
fetchPending
markPublished
markFailed
retry
dead letter
subscriber failure
```

### Webhook

```text
HMAC Signature
Delivery Success
HTTP 4xx
HTTP 5xx
Timeout
Retry
Disable Webhook
Tenant Isolation
```

### API Version

```text
/api/v1
/openapi/v1
/internal
unknown version
deprecated version
sunset header
```

---

## 4.4 Coverage 工具

后端建议：

```text
Vitest
@vitest/coverage-v8
```

命令：

```text
npm run test
npm run test:coverage
```

CI 中：

```text
test
coverage
```

可以初期只上传报告，不阻塞。

稳定后再设置：

```text
lines 60
functions 60
branches 50
statements 60
```

---

## 4.5 测试目录建议

```text
src/
├── auth/
│   └── __tests__/
├── security/
│   └── __tests__/
├── queue/
│   └── __tests__/
├── outbox/
│   └── __tests__/
└── webhook/
    └── __tests__/

tests/
└── integration/
```

---

## 4.6 测试验收标准

- [ ] Auth Core 覆盖。
- [ ] Tenant Isolation 覆盖。
- [ ] Replay Protection 覆盖。
- [ ] Queue 覆盖。
- [ ] Outbox 覆盖。
- [ ] Webhook 覆盖。
- [ ] CI 自动执行。
- [ ] Coverage Report。
- [ ] 核心模块 ≥ 80%。

---

# 5. E3：分布式 Worker

## 5.1 当前状态

当前 Worker 是：

```text
HTTP Server Process
+
Worker
+
Outbox Publisher
```

同进程运行。

优点：

```text
简单
容易部署
开发方便
```

缺点：

```text
API 和 Worker 抢资源
无法独立扩容
Worker 崩溃影响主进程
任务处理能力受 API 节点数绑定
```

---

## 5.2 第一阶段：进程拆分

不需要马上上 Kafka、RabbitMQ。

先拆成：

```text
API Process
Worker Process
```

建议入口：

```text
src/app.ts
src/worker.ts
```

运行：

```text
npm run start:api
npm run start:worker
```

Docker：

```text
bls-server-api
bls-worker
```

都连接：

```text
MySQL
Redis
```

---

## 5.3 第二阶段：安全领取

任务领取必须满足：

```text
同一任务
只能被一个 Worker 领取
```

推荐：

```text
BEGIN

SELECT ...
FOR UPDATE
SKIP LOCKED

UPDATE
status='processing'

COMMIT
```

关键点：

```text
SELECT
+
UPDATE
必须同事务
```

---

## 5.4 Worker 心跳

建议增加：

```text
worker_id
locked_by
locked_at
heartbeat_at
```

Job 表状态：

```text
queued
processing
completed
failed
cancelled
dead
```

Worker：

```text
worker-01
worker-02
worker-03
```

领取：

```text
locked_by = worker-02
locked_at = now
```

---

## 5.5 宕机恢复

Worker 崩溃后：

```text
processing
且
locked_at 超过 timeout
```

应恢复为：

```text
queued
```

或：

```text
failed
→ retry
```

建议增加 Reaper：

```text
stale job scanner
```

每隔：

```text
30s / 60s
```

扫描超时任务。

---

## 5.6 幂等要求

Worker Handler 必须支持：

```text
At-Least-Once Delivery
```

不能假设：

```text
Exactly Once
```

推荐：

```text
idempotency_key
business_key
job_id
```

业务处理前先判断是否已完成。

---

## 5.7 Worker 指标

增加：

```text
job_queue_waiting
job_queue_processing
job_queue_failed_total
job_queue_completed_total
job_duration_seconds
job_retry_total
worker_alive
```

---

## 5.8 分布式 Worker 验收标准

- [ ] API 与 Worker 分进程。
- [ ] 多 Worker 可运行。
- [ ] 同一 Job 不重复领取。
- [ ] Transaction Claim。
- [ ] locked_by。
- [ ] locked_at。
- [ ] stale recovery。
- [ ] retry。
- [ ] dead letter。
- [ ] graceful shutdown。
- [ ] Metrics。
- [ ] Integration Test。

---

# 6. E4：Outbox 模式增强

## 6.1 目标

解决：

```text
业务数据写成功
但消息发送失败
```

例如：

```text
创建订单成功
↓
消息发送失败
↓
通知 / Webhook / Queue 没执行
```

Outbox 目标：

```text
Business Data
+
Outbox Event
```

在同一个数据库事务中提交。

---

## 6.2 标准流程

```text
BEGIN
↓
INSERT business_data
↓
INSERT outbox_event
↓
COMMIT
↓
Publisher Poll
↓
Claim Event
↓
Dispatch
↓
Success → Published
Failure → Retry
Max Retry → Dead
```

---

## 6.3 事件状态

建议：

```text
pending
processing
published
failed
dead
```

字段：

```text
event_id
tenant_id
event_type
aggregate_type
aggregate_id
payload_json
status
retry_count
next_retry_at
locked_by
locked_at
created_at
published_at
last_error
```

---

## 6.4 Publisher 分布式化

当前 Publisher 内嵌 API Process。

后期拆成：

```text
outbox-publisher process
```

或者直接由：

```text
Worker
```

执行。

推荐：

```text
API
→ write outbox

Worker
→ poll outbox
→ dispatch
```

这样部署更简单。

---

## 6.5 Subscriber 失败规则

禁止：

```text
handler failed
↓
log error
↓
markPublished
```

必须：

```text
handler success
→ markPublished

handler failed
→ markFailed
→ retry
→ dead
```

---

## 6.6 多 Subscriber 语义

如果一个 Event 对应多个 Subscriber，需要明确：

方案 A：

```text
一个 Event
多个 Handler
任意失败 → Event Failed
```

方案 B：

```text
outbox_event
+
outbox_delivery
```

每个 Subscriber 单独状态：

```text
delivery_id
event_id
subscriber
status
retry_count
```

开源项目建议：

```text
第一版方案 A
后期进阶方案 B
```

---

## 6.7 Outbox 验收标准

- [ ] Business + Event 同事务。
- [ ] 多 Publisher 不重复领取。
- [ ] Handler Failure 不会 Published。
- [ ] Retry。
- [ ] Dead Letter。
- [ ] last_error。
- [ ] Metrics。
- [ ] Integration Test。
- [ ] 至少一个真实业务模块接入。

---

# 7. E5：API 版本管理

## 7.1 目标

当前需要解决：

```text
接口改动
导致旧前端或第三方客户端失效
```

推荐：

```text
/api/v1
/openapi/v1
/internal
```

---

## 7.2 内部业务 API

推荐：

```text
/api/v1/system/user
/api/v1/system/role
/api/v1/system/config
```

当前旧接口：

```text
/api/system/*
```

可以过渡期保留。

迁移策略：

```text
Old
/api/system/user

New
/api/v1/system/user
```

保持：

```text
3～6 个月兼容窗口
```

---

## 7.3 OpenAPI

外部接口单独：

```text
/openapi/v1/*
```

不要与内部 Admin API 共用：

```text
JWT Auth
```

建议：

```text
API Key
HMAC Signature
Timestamp
Nonce
Rate Limit
IP Allowlist
```

---

## 7.4 Internal API

内部接口：

```text
/internal/*
```

建议限制：

```text
内网
Service Token
mTLS（可选）
```

开源基础版先：

```text
Internal Secret Header
+
Network Restriction
```

即可。

---

## 7.5 Deprecation

不要依赖客户端：

```text
X-API-Deprecated
```

来决定服务端是否 Deprecated。

应该由服务端路由配置：

```ts
{
  version: 'v1',
  deprecated: true,
  sunsetAt: '2027-01-01',
}
```

返回：

```text
Deprecation: true
Sunset: ...
Link: ...
```

---

## 7.6 API Version 验收标准

- [ ] Middleware 真正挂载。
- [ ] /api/v1 可访问。
- [ ] Old Route Compatibility。
- [ ] OpenAPI 独立认证。
- [ ] Internal API 保护。
- [ ] Deprecation Header。
- [ ] Sunset Header。
- [ ] Integration Test。
- [ ] API Migration Guide。

---

# 8. E6：Webhook 机制增强

## 8.1 目标

提供：

```text
用户系统
订单系统
支付系统
文件系统
安全事件
```

对外事件通知。

---

## 8.2 Webhook CRUD

必须支持：

```text
POST   /webhooks
GET    /webhooks
GET    /webhooks/:id
PUT    /webhooks/:id
DELETE /webhooks/:id
POST   /webhooks/:id/test
POST   /webhooks/:id/retry
```

字段：

```text
webhook_id
tenant_id
name
url
events
secret
status
created_at
updated_at
```

---

## 8.3 事件订阅

例如：

```text
USER_CREATED
USER_DISABLED
FILE_UPLOADED
ORDER_CREATED
PAYMENT_COMPLETED
SECURITY_EVENT
```

Webhook 只接收：

```text
订阅的 event_type
```

---

## 8.4 签名

建议：

```text
X-Webhook-ID
X-Webhook-Timestamp
X-Webhook-Signature
```

签名内容：

```text
timestamp + "." + body
```

HMAC：

```text
HMAC-SHA256(secret, payload)
```

避免只签 body。

---

## 8.5 Delivery Record

建议新增：

```text
sys_webhook_delivery
```

字段：

```text
delivery_id
tenant_id
webhook_id
event_id
request_body
response_status
response_body
attempt
status
next_retry_at
created_at
completed_at
```

用户可以查看：

```text
成功
失败
重试中
已终止
```

---

## 8.6 Retry 策略

建议：

```text
1 min
5 min
15 min
1 hour
6 hours
```

或者指数退避。

最大：

```text
5～10 次
```

---

## 8.7 Webhook 安全

必须：

```text
禁止 localhost
禁止 127.0.0.1
禁止内网 IP
禁止 metadata endpoint
```

避免 SSRF。

需要验证：

```text
DNS resolve
private IP
redirect destination
```

开源基础版至少：

```text
URL protocol = https/http
block localhost
block private CIDR
```

---

## 8.8 Test Webhook

必须检查：

```text
res.ok
```

不是：

```text
fetch 没 throw
= 成功
```

应该：

```text
2xx
→ Success

4xx / 5xx
→ Failed
```

---

## 8.9 Webhook 验收标准

- [ ] CRUD 完整。
- [ ] Tenant Isolation。
- [ ] Event Subscription。
- [ ] HMAC Signature。
- [ ] Timestamp Signature。
- [ ] Delivery History。
- [ ] Retry。
- [ ] Dead Letter。
- [ ] Worker 注册。
- [ ] HTTP Status 校验。
- [ ] SSRF Protection。
- [ ] Metrics。
- [ ] Integration Test。

---

# 9. 六项增强的推荐拆分

## Milestone A：工程质量

```text
CI/CD
+
Coverage
```

目标：

```text
每次提交可验证
```

---

## Milestone B：异步架构

```text
Distributed Worker
+
Outbox
```

目标：

```text
异步任务可靠执行
事件最终一致性
```

---

## Milestone C：开放能力

```text
API Versioning
+
Webhook
```

目标：

```text
接口可演进
第三方可集成
```

---

# 10. 推荐版本规划

## v0.2.0

```text
CI/CD
Test Coverage
Frontend CI
Backend CI
```

---

## v0.3.0

```text
Distributed Worker
Job Claim Transaction
Stale Job Recovery
Worker Metrics
```

---

## v0.4.0

```text
Outbox Reliable Delivery
Retry
Dead Letter
Real Business Integration
```

---

## v0.5.0

```text
API v1
OpenAPI v1
Deprecation Policy
Migration Guide
```

---

## v0.6.0

```text
Webhook CRUD
Webhook Signature
Delivery History
Retry
SSRF Protection
```

---

# 11. Codex 后期执行原则

后续开发要求：

```text
1. 每次只做一个 Enhancement。
2. 不跨 Phase 混改。
3. 必须有 Test。
4. 必须有 Migration。
5. 必须更新 Docs。
6. 必须更新 CHANGELOG。
7. 必须通过 CI。
8. 必须写 Integration Test。
9. 不允许只新增文件不接主链路。
10. 不允许仅靠 Commit Message 宣称完成。
```

---

# 12. 最终验收总表

## CI/CD

- [ ] Server CI。
- [ ] Admin CI。
- [ ] Test。
- [ ] Build。
- [ ] Release。
- [ ] Docker Image。

## Worker

- [ ] 分进程。
- [ ] 多 Worker。
- [ ] Transaction Claim。
- [ ] stale recovery。
- [ ] retry。
- [ ] dead letter。

## Outbox

- [ ] 同事务写事件。
- [ ] 不重复领取。
- [ ] Handler Failure 正确失败。
- [ ] Retry。
- [ ] Dead。
- [ ] 实际业务接入。

## API Version

- [ ] Middleware 挂载。
- [ ] /api/v1。
- [ ] OpenAPI。
- [ ] Internal API。
- [ ] Deprecation。
- [ ] Sunset。

## Webhook

- [ ] CRUD。
- [ ] Signature。
- [ ] Delivery History。
- [ ] Retry。
- [ ] Worker。
- [ ] SSRF Protection。

## Testing

- [ ] Auth。
- [ ] Tenant。
- [ ] Replay。
- [ ] Queue。
- [ ] Outbox。
- [ ] Webhook。
- [ ] Coverage Report。
- [ ] Core Coverage ≥ 80%。

---

# 13. 最终建议

这 6 项都适合作为：

```text
后期增强
```

不建议现在一次性同时开发。

推荐：

```text
先 CI/CD
↓
再测试
↓
再 Worker
↓
再 Outbox
↓
再 API Version
↓
最后 Webhook
```

核心原则：

> BLS-KOX 后期增强应以“可靠、清晰、可验证”为优先，而不是单纯增加模块数量。

最终目标：

```text
开源项目可稳定迭代
+
异步任务可扩展
+
事件可靠
+
接口可演进
+
第三方可集成
+
核心逻辑有测试保护
```
