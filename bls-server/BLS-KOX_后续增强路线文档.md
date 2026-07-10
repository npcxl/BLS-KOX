# BLS-KOX 后续增强路线文档

> 适用阶段：P3 / P4 完成后  
> 目标：将当前后端从“功能型后台”升级为“可观测、可扩展、可恢复、可审计的平台型 SaaS 后端”。

---

# 一、总体路线

```text
P5  Observability 可观测性
↓
P6  Queue / Worker 异步任务体系
↓
P7  Outbox / Event Bus 事件一致性
↓
P8  Migration / Backup 数据库治理与灾备
↓
P9  Data Scope 数据权限模型
↓
P10 Security Center 安全事件中心
↓
P11 API Versioning / OpenAPI
↓
P12 Webhook Platform
↓
P13 File Security
↓
P14 Configuration Center
```

---

# 二、P5：Observability 可观测性

## 目标

建立：

```text
Log
+
Metrics
+
Trace
+
Alert
```

当前已有 Logger 和 Request Context，可直接继续扩展。

## 建议指标

### HTTP

```text
http_requests_total
http_request_duration_seconds
http_request_errors_total
```

建议维度：

```text
method
route
status
```

避免将 `userId`、`tenantId`、原始动态 path 作为 Prometheus 高基数 Label。

### Security

```text
security_events_total
rate_limit_rejected_total
replay_rejected_total
idempotency_conflict_total
refresh_reuse_detected_total
cross_tenant_access_total
login_failed_total
```

### Infrastructure

```text
db_query_duration_seconds
db_query_errors_total
redis_operation_errors_total
redis_operation_duration_seconds
active_sessions
websocket_connections
job_queue_waiting
job_queue_failed
```

## Trace 链路

```text
Nginx
↓
Koa
↓
Request Context
↓
Service
↓
Database
↓
Redis
↓
Security Audit
↓
Worker
↓
Webhook
```

所有日志统一携带：

```text
requestId
traceId
tenantId
userId
```

## 第一批告警

```text
5xx Error Rate > 5%
P95 Latency > 1s
DB Error 持续增长
Redis Error 持续增长
Refresh Reuse Detected > 0
Cross Tenant Access > 0
Rate Limit Reject 突增
```

## 验收标准

- [ ] `/metrics` 可被 Prometheus 抓取
- [ ] HTTP 请求数、错误率、延迟可观察
- [ ] Security Event 有指标
- [ ] DB / Redis 有基础指标
- [ ] Logger 自动携带上下文
- [ ] 至少配置 5 条告警规则

---

# 三、P6：Queue / Worker 异步任务体系

## 目标

将长耗时和可重试任务从 HTTP 请求链路拆出。

适合：

```text
Excel Import
Excel Export
Email
SMS
Notification
Report Generate
Search Index Rebuild
Image Processing
Audit Archive
Webhook Delivery
```

## 推荐结构

```text
src/
├── queue/
│   ├── queue.ts
│   ├── worker.ts
│   ├── job-types.ts
│   └── jobs/
│       ├── export.job.ts
│       ├── import.job.ts
│       ├── notification.job.ts
│       └── webhook.job.ts
```

## API 模型

提交任务：

```text
POST /api/jobs
```

返回：

```json
{
  "jobId": "xxx",
  "status": "queued"
}
```

查询：

```text
GET /api/jobs/:jobId
```

状态：

```text
queued
processing
completed
failed
cancelled
```

## Worker 必须支持

```text
retry
exponential backoff
timeout
dead letter
concurrency
graceful shutdown
```

## Job Ownership

每个 Job 必须绑定：

```text
tenantId
userId
jobType
createdAt
```

查询 Job 时必须做 Tenant Isolation。

## 验收标准

- [ ] HTTP 可异步提交 Job
- [ ] Worker 独立执行
- [ ] Job 可查询状态
- [ ] Retry / Backoff 生效
- [ ] Failed Job 可进入 Dead Letter
- [ ] Worker 支持 Graceful Shutdown
- [ ] Job 查询有 Tenant Isolation

---

# 四、P7：Outbox Pattern 与事件系统

## 目标

解决：

```text
数据库提交成功
但 Redis / MQ / Webhook / Notification 失败
```

导致的业务不一致问题。

## Outbox Table

建议：

```text
outbox_event
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
created_at
published_at
```

状态：

```text
pending
processing
published
failed
dead
```

## 事务模型

```text
BEGIN

业务数据 INSERT / UPDATE
+
Outbox Event INSERT

COMMIT
```

Worker：

```text
SELECT pending
↓
publish
↓
success → published
↓
failed → retry
```

## 第一批事件

```text
USER_CREATED
USER_DISABLED
ORDER_CREATED
PAYMENT_COMPLETED
FILE_UPLOADED
SESSION_REVOKED
SECURITY_CRITICAL_EVENT
```

## 验收标准

- [ ] 业务操作和 Event 在同一 DB Transaction
- [ ] Worker 可重试发送
- [ ] Event 发布幂等
- [ ] Failed Event 可进入 Dead Letter
- [ ] Outbox Worker 支持水平扩展

---

# 五、P8：Migration / Backup / Disaster Recovery

## Migration

不要长期只依赖 `Init.sql`。

建议：

```text
migrations/
├── 20260710_001_init.sql
├── 20260710_002_add_session_index.sql
├── 20260711_001_add_outbox.sql
└── 20260712_001_add_job_table.sql
```

支持：

```text
migration up
migration status
migration rollback
```

记录：

```text
version
checksum
executed_at
execution_time
```

## Backup

建议：

```text
MySQL Daily Full Backup
MySQL Binlog
Redis AOF
Redis RDB
MinIO Replication
Configuration Backup
```

## Restore Drill

真正执行：

```text
Backup
↓
New Environment
↓
Restore
↓
Application Start
↓
Data Verify
```

## 验收标准

- [ ] Migration 可增量执行
- [ ] Migration 有状态记录
- [ ] 部署自动检查 DB Version
- [ ] MySQL 有定期备份
- [ ] Redis 有持久化
- [ ] MinIO 有备份策略
- [ ] 至少完成一次恢复演练

---

# 六、P9：Data Scope 数据权限模型

## 目标

RBAC：

```text
能不能访问功能
```

Data Scope：

```text
能看到哪些数据
```

## Scope

```text
ALL
TENANT
DEPT
DEPT_AND_CHILDREN
SELF
CUSTOM
```

## 示例

```text
普通销售 → SELF
销售主管 → DEPT_AND_CHILDREN
区域负责人 → CUSTOM
财务 → TENANT
平台管理员 → ALL
```

## 推荐模型

```text
RBAC
↓
Permission Check
↓
Data Scope Resolve
↓
Query Scope Injection
↓
Database
```

## 验收标准

- [ ] Role 可配置 Data Scope
- [ ] Query 可自动注入 Scope
- [ ] SELF / DEPT / TENANT 可测试
- [ ] Scope 不依赖 Controller 手工拼接
- [ ] 数据导出同样受 Scope 限制

---

# 七、P10：Security Event Center

## 目标

将 Security Audit 从“记录日志”升级为：

```text
采集
↓
聚合
↓
评分
↓
告警
↓
处置
```

## Event Source

```text
LOGIN_FAILED
LOGIN_BRUTE_FORCE
TOKEN_INVALID
TOKEN_EXPIRED
REFRESH_REUSE
NONCE_REPLAY
SIGNATURE_INVALID
RATE_LIMIT
CROSS_TENANT_ACCESS
PERMISSION_DENIED
MASS_ASSIGNMENT_ATTEMPT
```

## Risk Rule 示例

```text
5 分钟内同 IP 登录失败 > 20
→ HIGH

1 小时同账号跨多个地区登录
→ HIGH

Refresh Token Reuse
→ CRITICAL

Cross Tenant Access
→ CRITICAL

Signature Invalid 连续触发
→ HIGH
```

## Action

```text
Alert Only
Block IP
Lock Account
Revoke Session
Revoke All Sessions
Require Re-auth
```

## 验收标准

- [ ] Security Event 可统一查询
- [ ] Risk Rule 可配置
- [ ] 高风险事件可通知
- [ ] Critical Event 可自动 revoke session
- [ ] 误报可人工解除

---

# 八、P11：API Versioning

建议：

```text
/api/v1
/api/v2
/openapi/v1
/internal
```

分类：

```text
/api/v1
前端业务接口

/openapi/v1
第三方开放接口

/internal
内部服务接口
```

接口重大变更时：

```text
v1 保持兼容
v2 新接口
```

同时增加：

```text
Deprecated Header
Sunset Date
Migration Document
```

---

# 九、P12：Webhook Platform

## 功能

```text
Webhook Endpoint
Webhook Secret
Event Subscription
HMAC Signature
Timestamp
Nonce
Retry
Dead Letter
Delivery Log
```

状态：

```text
pending
sending
success
retrying
failed
dead
```

## 验收标准

- [ ] 支持 HMAC 签名
- [ ] 支持 Timestamp / Nonce
- [ ] 支持 Retry
- [ ] 支持 Dead Letter
- [ ] 可查看 Delivery Log
- [ ] 支持手工重放

---

# 十、P13：文件安全体系

## 上传

```text
文件大小限制
扩展名白名单
MIME 校验
Magic Number 检测
随机 Object Key
恶意文件扫描
Tenant Isolation
```

## 下载

```text
Private File
↓
Permission Check
↓
Ownership Check
↓
Signed URL
```

禁止私有文件使用永久公开 URL。

## 生命周期

```text
temporary
active
archived
deleted
```

支持自动清理策略。

---

# 十一、P14：Configuration Center

## Static Config

使用 ENV：

```text
JWT_SECRET
DB_PASSWORD
REDIS_HOST
CORS
TRUST_PROXY
```

## Dynamic Config

使用 DB / Redis：

```text
Multi Login
Upload Limit
Rate Limit Rule
Feature Flag
Notification Config
```

建议统一 Zod Schema：

```ts
const EnvSchema = z.object({
  NODE_ENV: z.enum([
    'development',
    'test',
    'production',
  ]),
  JWT_SECRET: z.string().min(32),
  DB_PASSWORD: z.string().min(1),
});
```

---

# 十二、最终优先级

## 第一优先级

```text
P5 Observability
P6 Queue / Worker
P8 Migration
```

直接提升：

```text
可排障
可扩展
可部署
```

## 第二优先级

```text
P7 Outbox
P9 Data Scope
P10 Security Center
```

提升：

```text
业务一致性
权限能力
安全运营
```

## 第三优先级

```text
P11 API Versioning
P12 Webhook
P13 File Security
P14 Config Center
```

---

# 十三、推荐执行顺序

```text
1. 完成 P3 / P4 最终收尾
2. P5 Metrics + Trace + Alert
3. P6 Queue / Worker
4. P8 Migration System
5. P7 Outbox Pattern
6. P9 Data Scope
7. P10 Security Center
8. P13 File Security
9. P11 API Versioning
10. P12 Webhook Platform
11. P14 Config Center
```

---

# 十四、最终目标架构

```text
Client
↓
API Gateway / Nginx
↓
Request Context
↓
Replay / Rate Limit / Auth
↓
RBAC
↓
Data Scope
↓
Business Service
↓
Database Transaction
├── Business Tables
└── Outbox Event
↓
Queue / Worker
├── Notification
├── Export
├── Webhook
├── Search Index
└── Security Action

Observability
├── Logs
├── Metrics
├── Trace
└── Alert

Security Center
├── Event
├── Risk Rule
├── Alert
└── Response
```

---

# 十五、最终结论

P3 / P4 完成后，不建议继续无序增加业务中间件。

后续重点应从：

```text
“功能是否存在”
```

转向：

```text
系统是否可观察
系统是否可恢复
系统是否可扩展
系统是否能处理异步任务
系统是否能保证事件一致性
系统是否具备数据级权限
系统是否具备安全运营能力
```

优先完成：

```text
P5 Observability
+
P6 Queue / Worker
+
P8 Migration
```

这三项对当前 BLS-KOX 的平台化价值最高。
