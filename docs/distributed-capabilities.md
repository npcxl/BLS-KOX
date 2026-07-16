# 分布式能力

> **当前阶段**：模块化单体 + 分布式能力预留。
> **不是微服务**。不引入注册中心（Nacos/Eureka）、网关、分布式事务（Seata）。

## 实现状态

### 基础组件（已完成）

| 能力 | Java | 状态 |
|------|------|------|
| requestId / traceId | `TraceFilter` + MDC | ✅ 基础组件已实现 |
| 分布式锁 | `@DistributedLock` + AOP | ✅ 基础组件已实现 |
| 幂等控制 | `@Idempotent` + AOP | ✅ 基础组件已实现 |
| 限流 | `@RateLimit` + AOP | ✅ 基础组件已实现 |
| 指标采集 | `DistributedMetrics` (Micrometer) | ✅ 基础组件已实现 |

### 业务接入（已完成）

| 模块 | 接口 | 注解 |
|------|------|------|
| 认证 | `POST /api/auth/login` | `@RateLimit` |
| 认证 | `POST /api/auth/logout` | `@RateLimit` |
| 认证 | `POST /api/auth/refresh` | `@RateLimit` |
| 用户 | `POST /api/system/user/add` | `@Idempotent` |
| 用户 | `PUT /api/system/user/edit` | `@DistributedLock` |
| 用户 | `DELETE /api/system/user/remove` | `@DistributedLock` |
| 用户 | `PUT /api/system/user/changePassword` | `@RateLimit` |
| 用户 | `POST /api/system/user/kick` | `@DistributedLock` |
| 角色 | `POST /api/system/role/add` | `@Idempotent` |
| 角色 | `PUT /api/system/role/edit` | `@DistributedLock` |
| 角色 | `DELETE /api/system/role/remove` | `@DistributedLock` |
| 角色 | `PUT /api/system/role/{roleId}/menus` | `@DistributedLock` |
| 菜单 | `POST /api/system/menu/add` | `@Idempotent` + `@DistributedLock` |
| 菜单 | `PUT /api/system/menu/edit` | `@DistributedLock` |
| 菜单 | `DELETE /api/system/menu/remove` | `@DistributedLock` |
| 文件 | `POST /api/system/storage/upload` | `@RateLimit` + `@DistributedLock` |
| Excel | `POST /api/common/excel/export` | `@RateLimit` |
| Excel | `POST /api/common/excel/import` | `@RateLimit` + `@DistributedLock` |

### 待接入模块

| 模块 | 说明 |
|------|------|
| 部门管理 | add / edit / remove 待接入 `@DistributedLock` |
| 字典管理 | add / edit / remove 待接入 `@DistributedLock` |
| 租户管理 | add / edit / remove 待接入 `@DistributedLock` |
| Webhook | 创建/编辑/删除待接入 `@DistributedLock` |
| 存储配置 | 增删改待接入 `@DistributedLock` |

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

## 使用示例

### 分布式锁

```java
@DistributedLock(key = "order:create:#{#userId}", waitTime = 3, leaseTime = 10)
public void createOrder(String userId) {
    // 业务逻辑
}
```

### 幂等

```java
@Idempotent(prefix = "payment:")
public ApiResponse pay(@RequestBody PayRequest req) {
    // 业务逻辑
}
// 请求需带 Header: Idempotency-Key: xxx
```

### 限流

```java
@RateLimit(key = "login:ip:#{#request.remoteAddr}", limit = 20, windowSeconds = 60)
public ApiResponse login(HttpServletRequest request) {
    // 业务逻辑
}
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
