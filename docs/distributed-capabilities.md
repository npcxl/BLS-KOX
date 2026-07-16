# 分布式能力

> **当前阶段**：模块化单体 + 分布式能力预留。
> **不是微服务**。不引入注册中心（Nacos/Eureka）、网关、分布式事务（Seata）。

## 已实现能力

| 能力 | Koa (TypeScript) | Java (Spring Boot) | 存储 |
|------|-------------------|---------------------|------|
| **requestId / traceId** | `distributed/trace.ts` 中间件 | `distributed.trace.TraceFilter` + MDC | Header 传递 |
| **分布式锁** | `distributed/lock.ts` (SET NX) | `@DistributedLock` 注解 + AOP | Redis |
| **幂等控制** | `distributed/idempotency.ts` (Idempotency-Key) | `@Idempotent` 注解 + AOP | Redis |
| **限流** | `distributed/rate-limit.ts` (Lua INCR) | `@RateLimit` 注解 + AOP | Redis |
| **指标** | prom-client 安全指标 | `DistributedMetrics` (Micrometer Counter) | Prometheus |
| **健康检查** | `/api/health` | `/api/health` + Actuator `/internal/health` | - |

## 设计原则

1. **统一的 Redis 协议**：锁、限流、幂等使用相同的 Redis Key 前缀、Lua 脚本、Header 名称
2. **非侵入**：不修改前端代码，不修改现有业务接口签名
3. **渐进式**：每个能力独立可选，不强制使用
4. **Redis 故障降级**：Redis 不可用时，限流放行、锁失败降级

## 代码位置

### Java

```
com.bls.server.distributed/
├── lock/
│   ├── DistributedLock.java        # 注解定义
│   └── DistributedLockAspect.java  # AOP 切面
├── idempotent/
│   ├── Idempotent.java             # 注解定义
│   └── IdempotentAspect.java       # AOP 切面
├── ratelimit/
│   ├── RateLimit.java              # 注解定义
│   └── RateLimitAspect.java        # AOP 切面
├── trace/
│   ├── TraceFilter.java            # Filter（注入 MDC）
│   └── TraceContext.java           # 手动注入工具
└── metrics/
    └── DistributedMetrics.java     # Micrometer 指标
```

### Koa

```
bls-server/src/distributed/
├── lock.ts           # createDistributedLock()
├── idempotency.ts    # createIdempotencyService()
├── rate-limit.ts     # createRateLimiter()
├── trace.ts          # traceMiddleware() / getRequestId() / getTraceId()
└── index.ts          # 统一导出
```

## 使用示例

### Java：分布式锁

```java
@DistributedLock(key = "order:create:#{#userId}", waitTime = 3, leaseTime = 10)
public void createOrder(String userId) {
    // 业务逻辑
}
```

### Java：幂等

```java
@Idempotent(prefix = "payment:")
public ApiResponse pay(@RequestBody PayRequest req) {
    // 业务逻辑
}
// 请求需带 Header: Idempotency-Key: xxx
```

### Java：限流

```java
@RateLimit(key = "login:ip:#{#request.remoteAddr}", limit = 20, windowSeconds = 60)
public ApiResponse login(HttpServletRequest request) {
    // 业务逻辑
}
```

### Koa：分布式锁

```typescript
import { createDistributedLock } from '@/distributed';

const lock = createDistributedLock(getRedisClient());
const unlock = await lock.acquire('order:create:123', { leaseTime: 30 });
if (!unlock) throw new Error('获取锁失败');
try { /* 业务逻辑 */ } finally { await unlock(); }
```

## Redis Key 约定

| 能力 | Key 前缀 | 示例 |
|------|----------|------|
| 分布式锁 | `lock:` | `lock:order:create:123` |
| 幂等锁 | `idempotent:` | `idempotent:payment:abc123:lock` |
| 幂等结果 | `idempotent:` | `idempotent:payment:abc123:result` |
| 限流计数 | `rate:` | `rate:login:ip:192.168.1.1` |

## 日志格式

```
2026-01-01 12:00:00.000 [http-nio-8080-exec-1] INFO [req-xxx] [trace-yyy] [tenant-zzz] ...
```

包含 `requestId`、`traceId`、`tenantId`，方便日志关联。
