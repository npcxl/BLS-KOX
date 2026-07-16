# 缓存策略

## 缓存层次

| 层次 | 技术 | 用途 | 生命周期 |
|------|------|------|----------|
| 会话缓存 | Redis | JWT Session、Refresh Token | Access 15min / Refresh 7d |
| 权限缓存 | Redis | 角色权限列表 | Token 有效期内 |
| 字典缓存 | Redis | 字典数据 valueEnum | 配置更新时刷新 |
| 配置缓存 | Redis | 系统参数 | 配置更新时刷新 |
| 幂等结果 | Redis | 请求结果缓存 | 默认 600s |
| 限流计数 | Redis | 滑动窗口计数器 | 窗口周期 |

## Redis Key 命名规范

```
{prefix}:{module}:{identifier}

示例：
  session:index:{tenantId}:{userId}:acc:{jti}
  dict:data:{dictType}
  config:system:{configKey}
  lock:{resource}:{id}
  rate:{dimension}:{key}:{route}
  idempotent:{module}:{key}:lock
  idempotent:{module}:{key}:result
```

## 缓存失效策略

| 策略 | 场景 | 实现 |
|------|------|------|
| TTL 自动过期 | Session、限流、幂等 | `EXPIRE` / `PX` 参数 |
| 主动删除 | 字典更新、配置更新 | 更新时 `DEL` |
| 版本号 | 权限变更 | Token 中携带版本号 |

## Java 配置

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}
      database: 0
      timeout: 5000ms
      lettuce:
        pool:
          max-active: 20
          max-idle: 10
          min-idle: 5
```

## Koa 配置

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_KEY_PREFIX=bls:
```

## 故障降级

Redis 不可用时的降级策略：

| 能力 | 降级行为 |
|------|----------|
| Session 校验 | 放行（fail-open），Token 本身包含过期时间 |
| 限流 | 放行（fail-open），避免阻塞正常请求 |
| 分布式锁 | 跳过锁，记录日志告警 |
| 幂等控制 | 跳过幂等检查 |
| 字典/配置缓存 | 从数据库直接查询 |

## 监控指标

- `redis_connected_clients` — 连接数
- `redis_used_memory` — 内存使用
- `redis_keyspace_hits` / `redis_keyspace_misses` — 命中率
- `bls_lock_acquired_total` / `bls_lock_failed_total` — 分布式锁
- `bls_ratelimit_rejected_total` — 限流拒绝
- `bls_idempotent_cache_hit_total` / `bls_idempotent_conflict_total` — 幂等
