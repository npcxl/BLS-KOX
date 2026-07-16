# 限流

## 概述

BLS-KOX 提供多维度限流能力，基于 Redis Lua 脚本实现。

## 限流维度

| 维度 | 说明 | Key 示例 |
|------|------|----------|
| `ip` | 客户端 IP | `rate:ip:192.168.1.1:POST:/api/auth/login` |
| `user` | 用户 ID | `rate:user:U001:POST:/api/common/excel/export` |
| `tenant` | 租户 ID | `rate:tenant:T001:POST:/api/common/excel/export` |
| `account` | 登录账号 | `rate:account:admin:POST:/api/auth/login` |

## Lua 脚本

Redis 原子 INCR + EXPIRE：

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
```

## 默认规则

| 路径 | 方法 | 维度 | 限制 |
|------|------|------|------|
| `/api/auth/login` | POST | IP | 20 次/分钟 |
| `/api/auth/login` | POST | account | 5 次/5 分钟 |
| `/api/common/excel/export` | POST | user | 5 次/分钟 |
| `/api/common/excel/export` | POST | tenant | 200 次/小时 |
| `/api/system/storage/upload` | POST | user | 30 次/分钟 |
| `/api/**` | POST/PUT/PATCH/DELETE | user | 300 次/分钟 |
| `/api/**` | GET/HEAD/OPTIONS | user | 600 次/分钟 |

## Java 使用

### 注解方式

```java
@RateLimit(key = "login:ip:#{#request.remoteAddr}", limit = 20, windowSeconds = 60)
@PostMapping("/login")
public ApiResponse login(HttpServletRequest request) {
    // ...
}
```

### 注解参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `key` | 限流 Key（支持 SpEL） | 必填 |
| `prefix` | Key 前缀 | `"rate:"` |
| `limit` | 窗口内最大请求数 | 必填 |
| `windowSeconds` | 时间窗口（秒） | 60 |
| `message` | 超限提示 | `"请求过于频繁，请稍后再试"` |

## Koa 使用

```typescript
import { createRateLimiter } from '@/distributed';

const rl = createRateLimiter(getRedisClient());

// 中间件中使用
app.use(async (ctx, next) => {
  const result = await rl.check({
    key: `login:ip:${ctx.ip}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!result.allowed) {
    ctx.status = 429;
    ctx.body = { code: 429, message: '请求过于频繁' };
    return;
  }
  await next();
});
```

## 响应格式

超限时返回 `429 Too Many Requests`：

```json
{
  "code": 429,
  "message": "请求过于频繁，请稍后再试"
}
```

Response Headers：

```
X-RateLimit-Remaining: 5
X-RateLimit-Reset: 1700000000
Retry-After: 30
```

## 故障降级

Redis 不可用时，限流**放行（fail-open）**，避免阻塞正常请求。
同时记录 Prometheus 指标 `redis_operation_errors_total` 用于告警。
