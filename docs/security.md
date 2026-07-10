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

## Session Center 安全

- Refresh Token Rotation
- Reuse Detection（复用后吊销全部会话）
- Logout 同步吊销 Access + Refresh
- 修改密码/禁用用户 → revokeAll

## 最佳实践

- 生产环境务必修改 `JWT_SECRET`
- Redis 设置密码
- Nginx 配置 `X-Forwarded-For`
- 开启 `TRUST_PROXY=true`
