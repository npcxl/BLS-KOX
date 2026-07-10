# 认证体系

## Token 体系

```
Login
  ↓
Access Token (15min) + Refresh Token (7d)
  ↓
Session Center 双写: acc:{accessJti} + ref:{refreshJti}
```

## 认证流程

```
请求 → JWT 解析 → Session Center.validate('acc:{jti}')
  → 有效 → 注入 ctx.state.user → 继续
  → 失效 → 401 SessionInvalidError
```

## Refresh Token Rotation

```
Refresh 请求 → 验证旧 Refresh JTI
  → hash 不匹配 → 查 auth:refresh-used:{jti}
    → 已消费 → Reuse! → revokeAll → 审计 CRITICAL
  → 合法 → 标记旧 token 已用 → 签发新对 → 创建新 Session
```

## Logout

```
Logout → 删 auth:session + auth:refresh
  → Session Center revoke acc + ref → 完成
```

## 多端登录控制

`multiLogin=false` 时：
```
新登录 → revokeAll(current user's sessions)
  → 清理 legacy keys → 创建新 Session Pair
```

## Session Center

- 存储：Redis `session:{tenant}:{user}:{jti}`
- 索引：`session-index:{tenant}:{user}` (SET)
- 支持：create / get / validate / touch / revoke / revokeAll / detectReuse
