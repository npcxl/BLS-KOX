# P7 Outbox Pattern

## 概述

Outbox 模式用于可靠的事件发布，确保业务操作与事件写入在同一数据库事务内原子完成。避免"业务成功但事件丢失"或"事件发出但业务回滚"的不一致。

## 架构

```
业务事务 (BEGIN ... COMMIT)
├── INSERT INTO sys_user ...
└── appendEvent(trx, USER_CREATED)

        ↓ (事务提交后)

OutboxPublisher.poll()
├── fetchPending()  → atomic claim (FOR UPDATE SKIP LOCKED)
├── dispatch()      → 顺序执行所有注册的 handler
├── markPublished() → 全部成功
└── markFailed()    → 任一失败 → 重试 / dead letter
```

## 语义模型: At-Least-Once

当前 Publisher 对同一 `eventType` 下所有 handler 采用**顺序执行，全成功或全重试**策略：

```
Event → [Handler A, Handler B, Handler C]
  A 成功, B 成功, C 失败 →
    整个 Event markFailed →
    Retry → A, B, C 全部重新执行
```

### 幂等性要求 (P10)

**每个 Subscriber Handler 必须支持幂等**，因为：

1. Handler A 第一次成功 → C 失败 → Retry → A 再次执行
2. Stale Recovery 可能使事件重新入队
3. 网络故障导致 markPublished 失败但 handler 已执行

**幂等实现建议：**

- 使用 `event.eventId` 作为去重键，在处理前检查是否已处理过（如写入 `event_handled` 表或 Redis SET NX）
- 利用业务唯一键做幂等（如"同一订单只发一次通知"）
- 处理结果写入时使用 INSERT IGNORE 或 ON DUPLICATE KEY

## 关键设计决策

### P0: Stale Recovery 使用 `processing_at`

- **claim 时**写入 `processing_at = NOW()`
- **stale 判定**仅看 `processing_at <= NOW() - STALE_TIMEOUT`（5 分钟）
- **不再使用 `next_retry_at`** 判定 processing 是否 stale（该字段仅用于 pending 事件的退避调度）

### Dead Letter

重试次数 >= 3 次后进入 `dead` 状态，不再自动重试，需人工介入或定期任务清理。

### 退避策略

指数退避: `2^retryCount` 秒（2s / 4s / 8s）

## API

```typescript
// 在事务中写入事件（与业务共享同一 trx）
import { appendEvent, EventTypes } from './outbox/outbox';

await db.transaction().execute(async (trx) => {
  await trx.insertInto('sys_user').values(...).execute();
  await appendEvent(trx, {
    tenantId: 'xxx',
    eventType: EventTypes.USER_CREATED,
    aggregateType: 'user',
    aggregateId: 'username',
    payload: { username: 'xxx' },
  });
});
```

## Metrics

| 指标 | 类型 | 说明 |
|------|------|------|
| `bls_kox_outbox_pending` | Gauge | pending + processing 事件数 |
| `bls_kox_outbox_published_total` | Counter | 成功发布计数 |
| `bls_kox_outbox_dead_total` | Counter | 死信计数 |
| `bls_kox_outbox_retry_total` | Counter | 重试计数 |
| `bls_kox_outbox_publish_duration_seconds` | Histogram | 发布耗时分布 |
