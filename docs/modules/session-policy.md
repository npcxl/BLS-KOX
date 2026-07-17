# 登录态策略

> 状态：current | 适用范围：Koa 后端

## 1. 核心机制

系统使用**双 Token + Redis Session Center + Event Center** 三层体系控制登录态。

### 双 Token

| Token | 有效期 | 存储方式 |
|-------|--------|----------|
| Access Token (Bearer) | 15分钟 | JWT，Payload 含 `userId/username/tenantId/jti/tokenType` |
| Refresh Token | 7天 | JWT，不带 Bearer 前缀 |

### Session Center（`session-center.ts`）

统一会话管理中心，Redis Key 规范：

| Key 模式 | 用途 |
|----------|------|
| `session:{tenantId}:{userId}:{sessionId}` | 会话详情 JSON（含 ip/ua/status/refreshHash 等） |
| `session-index:{tenantId}:{userId}` | 用户会话索引（Set 集合） |

### Event Center

安全事件自动处置：登录爆破→封IP+锁账号、Token复用→吊销所有会话、跨租户访问→告警等。

## 2. 多设备/单设备登录控制

通过 `sys_config` 表中 `sys.login.multiDevice` 配置切换（带 Redis 60s 缓存）：

### 多设备模式（`sys.login.multiDevice` = true，默认）

登录不清理旧 Session，多设备可同时持有独立 Token。

### 单会话模式（`sys.login.multiDevice` = false）

新登录时：

1. 清空 `auth:session:{jti}` 和 `auth:refresh:{jti}` 旧数据
2. `sessionCenter.revokeAll(userId)` 吊销所有旧会话
3. 所有旧设备下一次请求即被拒绝（40101：会话已失效）

## 3. 登录流程

```
POST /api/auth/login
  ├─ 支持两种方式：
  │   ├─ loginByTenant：直接传 tenantId
  │   └─ loginByDomain：根据域名自动匹配租户
  ├─ 密码校验（MD5 比对，兼容前端明文/MD5）
  ├─ 状态检查（status='1' 则拒绝）
  ├─ 获取 profile（角色/权限/菜单树）
  ├─ 签发双 Token（JWT + jti）
  ├─ 多设备检查 → 必要时清理旧会话
  └─ 写入 Redis：
      ├─ auth:session:{accessJti}
      ├─ auth:refresh:{refreshJti}  (SHA-256 hash)
      └─ auth:user-sessions:{userId} (Set)
```

## 4. Refresh Token 轮换（Rotation）

```
POST /api/auth/refresh
  ├─ 验证 refresh token
  ├─ 比对 auth:refresh:{jti} 的 hash
  ├─ 不匹配 → 复用检测：
  │   ├─ 首次 → 标记已使用
  │   └─ 二次使用 → CRITICAL → 吊销所有会话
  └─ 签发新 Access + Refresh Token
```

> 核心安全：Refresh Token 一次性使用，检测到复用立即吊销用户全部会话。

## 5. Auth 中间件校验

每个请求经过 `jwtAuth()` ：

1. 提取 Bearer Token → 验证 JWT
2. `sessionCenter.validate(tenantId, userId, acc:{jti})` → 检查 Redis 中会话是否为 active
3. 未通过 → 401 / 40101（会话失效）

路由豁免：`login`、`logout`、`refresh`、`public*` 前缀函数。

## 6. 登出

```
POST /api/auth/logout
  ├─ 清理 auth:session:{accessJti}
  ├─ 清理 auth:refresh:{refreshJti}
  └─ sessionCenter 吊销 acc:{accessJti} + ref:{refreshJti}
```

## 7. 总结

| 维度 | 多设备模式 | 单设备模式 |
|------|-----------|-----------|
| 配置值 | `sys.login.multiDevice` ≠ '0' | `sys.login.multiDevice` = '0' |
| 新登录 | 不清理旧会话 | 清理所有旧会话 |
| 旧设备 | 继续有效 | 下次请求 40101 |
| 实现复杂度 | 低 | 低（一行配置切换） |
