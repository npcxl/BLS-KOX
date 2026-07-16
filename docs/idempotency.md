# 幂等性

## 概述

幂等性确保同一操作多次执行的结果与执行一次相同。BLS-KOX 基于 Redis 实现请求级幂等控制。

## 工作原理

```
客户端                        服务端
  │                             │
  │  POST /api/order            │
  │  Idempotency-Key: abc123    │
  │ ──────────────────────────► │
  │                             │ 1. SET NX idempotent:abc123:lock
  │                             │ 2. 执行创建订单逻辑
  │                             │ 3. SET idempotent:abc123:result
  │  ◄──────────────────────────│ 4. 返回结果
  │                             │
  │  POST /api/order (重试)     │
  │  Idempotency-Key: abc123    │
  │ ──────────────────────────► │
  │                             │ 1. GET idempotent:abc123:result
  │  ◄──────────────────────────│ 2. 直接返回缓存结果
```

## 状态机

| 状态 | Redis Key | 说明 |
|------|-----------|------|
| 处理中 | `{prefix}:{key}:lock` = `"processing"` | 首次请求，正在执行 |
| 已完成 | `{prefix}:{key}:result` = `"{...}"` | 结果已缓存 |
| 冲突 | lock 存在但 fingerprint 不同 | 409 Conflict |
| 已过期 | Key 不存在 | 可重新执行 |

## Java 使用

### 注解方式

```java
@Idempotent(prefix = "payment:", ttlSeconds = 3600)
@PostMapping("/pay")
public ApiResponse pay(@RequestBody PayRequest req) {
    // 业务逻辑
}
```

请求时需携带 Header：

```
Idempotency-Key: pay-20260101-001
```

### 注解参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `prefix` | Key 前缀 | `"idempotent:"` |
| `ttlSeconds` | 结果缓存时间（秒） | 600 |

## Koa 使用

```typescript
import { createIdempotencyService } from '@/distributed';

const idem = createIdempotencyService(getRedisClient());

router.post('/api/order', async (ctx) => {
  const result = await idem.check(ctx, async () => {
    // 业务逻辑
    return { code: 200, data: { orderId: 'xxx' } };
  }, { prefix: 'order:', ttlSeconds: 600 });
  ctx.body = result;
});
```

## 响应码

| HTTP 状态码 | 场景 |
|-------------|------|
| 200 | 首次请求成功 / 缓存结果返回 |
| 409 | 请求正在处理中（重复提交） |
| 409 | Idempotency-Key 相同但请求体不同（冲突） |

## Redis Key 约定

```
idempotent:{prefix}:{idempotency-key}:lock    # 处理中锁（TTL 60s）
idempotent:{prefix}:{idempotency-key}:result  # 结果缓存（TTL 可配，默认 600s）
```

## 适用场景

| 场景 | 说明 |
|------|------|
| 支付/扣款 | 防止重复扣款 |
| 订单创建 | 防止重复下单 |
| 库存扣减 | 防止超卖 |
| 积分发放 | 防止重复发放 |

## 注意事项

1. **幂等键的唯一性**：客户端生成全局唯一的 Idempotency-Key（建议 UUID v4）
2. **结果一致性**：缓存结果时应包含完整的响应体，包括 code、message、data
3. **TTL 设置**：根据业务容忍度设置，支付类建议 3600s 以上
4. **故障降级**：Redis 不可用时跳过幂等检查，记录告警日志
