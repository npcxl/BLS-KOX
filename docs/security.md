# 安全能力

## 防重放攻击

四层防护：
1. **Timestamp** — 5 分钟过期
2. **Nonce** — 一次性随机数，Redis 缓存去重
3. **HMAC 签名** — 可选，服务端验证
4. **幂等 Key** — `X-Idempotent-Key` 非重复

配置：`REPLAY_ENABLED=true`

## 频率限制

多维度：
- **IP 限流** — 单 IP 每秒请求数
- **账号限流** — 单用户登录频率
- **API 限流** — 单接口并发
- **Redis 滑动窗口** — 精确到秒

429 时返回：`Retry-After: N` 头。

## 安全审计

`sys_security_log` 表记录：

| 事件类型 | 说明 |
|----------|------|
| `LOGIN_FAILED` | 登录失败 |
| `TOKEN_EXPIRED` | Token 过期 |
| `TOKEN_INVALID` | Token 无效 |
| `CROSS_TENANT_ACCESS` | 跨租户访问 |
| `REFRESH_TOKEN_REUSE` | RT 复用检测 |
| `SIGNATURE_INVALID` | 签名无效 |

## Security Event Center (P10)

自动处置链路：

```
安全事件 → writeSecurityLog() → collectEvent()
  ↓ 5min 聚合
  ↓ evaluateRisk() 评分
  ↓ 阈值触发:
    BLOCK_IP (Redis 1h 封禁)
    LOCK_ACCOUNT (禁用账户)
    REVOKE_ALL_SESSIONS (吊销全部会话)
```

入口处 `blockedIpMiddleware()` 检查 Redis + `sys_ip_blacklist` 表双重拦截。

## Data Scope 数据权限 (P9)

在 RBAC 基础上增加数据级控制：`ALL` / `TENANT` / `DEPT` / `DEPT_AND_CHILDREN` / `SELF` / `CUSTOM`。

详见 [Data Scope 文档](./outbox.md 中已覆盖)。

## Session Center 安全

- Refresh Token Rotation
- Reuse Detection（复用后吊销全部会话）
- Logout 同步吊销 Access + Refresh
- 修改密码/禁用用户 → revokeAll

## API 版本化安全 (P11)

不同路由前缀有不同安全边界：

| 前缀 | 鉴权 |
|------|------|
| `/api/v1/` | JWT (标准) |
| `/openapi/v1/` | API Key + HMAC-SHA256 + Timestamp + Nonce |
| `/internal/` | Service Token + IP 白名单 |

详见 [API 版本化文档](./api-versioning.md)。

## 最佳实践

- 生产环境务必修改 `JWT_SECRET`
- 配置 `INTERNAL_SECRET` 保护内部端点
- Redis 设置密码
- 开启 `BACKUP_ENABLED=true` 自动备份
- Nginx 配置 `X-Forwarded-For`
- 开启 `TRUST_PROXY=true`
