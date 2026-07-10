# 认证体系

## 完整时序图

```
=== Login ===
User → POST /login {username, password}
  → DB 验证 → signToken(AT) + signRefreshToken(RT)
  → Redis: SET auth:session:{accessJti} + auth:refresh:{refreshJti}
  → SessionCenter: create acc:{jti} + ref:{jti}
  → 返回 {token, refreshToken}

=== API Access ===
Client → GET /api/xxx (Bearer AT)
  → verifyToken → SessionCenter.validate(acc:{jti})
  → Redis GET session → active ✓ → 200 OK

=== Refresh ===
Client → POST /refresh {refreshToken}
  → verifyRefreshToken → Redis GET auth:refresh:{jti}
  → hash ✓ → Redis SET auth:refresh-used:{oldJti}=1
  → SessionCenter: revoke ref:{old} + create acc:{new} + ref:{new}
  → 返回 {newToken, newRefreshToken}

=== Reuse Detection ===
Client → POST /refresh (REUSED RT)
  → Redis GET auth:refresh-used:{jti} → exists!
  → SessionCenter.revokeAll(userId)
  → 🔴 Security Audit CRITICAL → 401

=== Logout ===
Client → POST /logout
  → Redis: DEL auth:session + auth:refresh
  → SessionCenter: revoke acc + ref
  → 200 OK
```

## Token 体系

- **Access Token**: 15 分钟，短生命周期，减少泄露影响
- **Refresh Token**: 7 天，每次刷新后轮换（Rotation）
- **Session Center**: Redis 存储 `acc:{jti}`（Auth 校验）+ `ref:{jti}`（Refresh 吊销）
- **Reuse Detection**: 同一 Refresh Token 第二次使用 → 吊销全部会话

## 认证中间件

```typescript
// jwtAuth() - 所有需要登录的接口
router.get('/list', jwtAuth(), handler);

// 可选认证（登录可选）
router.get('/public-info', jwtAuth({ optional: true }), handler);
```

## Session Center API

| 方法 | 说明 |
|------|------|
| `create(session, ttl)` | 创建 Session |
| `validate(tid, uid, sid)` | 校验 Session 是否有效 |
| `touch(tid, uid, sid)` | 刷新活跃时间 |
| `revoke(tid, uid, sid)` | 吊销单个 Session |
| `revokeAll(tid, uid)` | 吊销用户所有 Session |
| `detectReuse(hash, tid, uid)` | 检测 RT 复用 |

## 多端登录控制

```typescript
// multiLogin=false → 新登录时 revokeAll 旧会话
if (!multi) {
  await sessionCenter.revokeAll(tenantId, userId);
}
```
