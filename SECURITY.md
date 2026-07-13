# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✅ |

## Reporting a Vulnerability

**请勿公开提交安全漏洞 Issue。**

如发现安全漏洞，请发送邮件至项目维护者，我们将在 72 小时内回复。

严重程度：
- **Critical**：远程代码执行、认证绕过 — 72h 内修复
- **High**：越权访问、Token 泄露 — 1 周内修复
- **Medium**：配置泄露、信息泄露 — 下个版本修复

## Security Capabilities

BLS-KOX 内置以下安全能力：

- 防重放攻击（Timestamp + Nonce + HMAC）
- 频率限制（IP + 账号多维度）
- 安全审计日志（登录/权限/签名）
- Session Center + Refresh Token Rotation
- 跨租户访问检测

---

## SQL Injection Prevention

BLS-KOX 在数据库访问层实现了**双层防 SQL 注入**机制：

### 1. Kysely ORM 参数化查询（主防线）

所有 CRUD 操作通过 [Kysely](https://kysely.dev/) 查询构建器执行，Kysely 自动将所有用户输入作为**参数化绑定值**传递，从根本上杜绝字符串拼接注入。

```typescript
// ✅ 安全：Kysely 参数化，column 和 value 分别传递
db.selectFrom('user').selectAll().where('id', '=', userInput)
// 生成: SELECT * FROM `user` WHERE `id` = ?  (参数化绑定)
```

所有业务 CRUD 模块均通过 `defineCrudModule`（`bls-server/src/core/crud.ts`）工厂函数生成，完全使用 Kysely 查询链式 API，**不存在原始 SQL 拼接风险**。

### 2. 原始 SQL 查询的命名占位符保护

对于必要的原始 SQL 查询，连接池强制启用 `namedPlaceholders: true`（`bls-server/src/core/database.ts`），所有参数通过命名占位符（`:param`）传递：

```typescript
// ✅ 安全：命名占位符 + 参数化
pool.execute('SELECT * FROM user WHERE id = :id', { id: userInput });
// 不安全的字符串拼接写法已从代码库中杜绝
```

### 防御层级

| 层级 | 机制 | 覆盖范围 |
|------|------|----------|
| 应用层 | Kysely 参数化查询构建器 | 100% CRUD 操作 |
| 驱动层 | `namedPlaceholders: true` | 100% 原始 SQL 查询 |
| 协议层 | MySQL Prepared Statement | 所有查询最终执行 |

---

## XSS / CSRF Protection

### XSS（跨站脚本攻击）防护

BLS-KOX 采用**三层纵深防御**策略：

| 层级 | 机制 | 说明 |
|------|------|------|
| Nginx 层 | `X-XSS-Protection: 1; mode=block` | 启用浏览器内置 XSS 过滤器 |
| Nginx 层 | `X-Content-Type-Options: nosniff` | 禁止 MIME 类型嗅探 |
| Koa 层 | `koa-helmet` 中间件 | 设置 11 项 HTTP 安全头（`bls-server/src/app.ts`） |
| 前端层 | `getSafeRedirectUrl()` | 登录重定向 URL 合法性校验，阻止 `//evil.com` 等开放重定向攻击（`bls-admin/src/pages/user/login/index.tsx`） |
| 前端层 | `dangerouslySetInnerHTML` 禁用 | 前端代码库中未使用任何 `dangerouslySetInnerHTML`，杜绝 DOM XSS 向量 |

### CSRF（跨站请求伪造）防护

| 层级 | 机制 | 说明 |
|------|------|------|
| 架构层 | SPA + JWT | 前端 SPA 使用 `Authorization: Bearer <token>` 头传递凭证，浏览器**不会自动附加** Bearer Token，天然免疫传统 CSRF |
| Cookie | `SameSite=Lax` | Refresh Token 存储在 httpOnly Cookie 中，Cookie 安全属性由 `bls-server` 服务端设置 |
| CORS | 精确白名单 | 生产环境强制使用 `CORS_ORIGINS` 精确白名单，启动时强校验：包含 `*` 直接报错退出（`bls-server/src/app.ts`） |

### Nginx 安全头（`nginx.conf` + `bls-admin-nginx.conf`）

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=7776000; includeSubDomains
```

---

## SLA 与监控告警绑定

以下安全 SLA 已与 Prometheus 告警规则直接绑定（`deploy/prometheus/rules/bls-kox-alerts.yml`）：

| 严重程度 | 响应时间 | 对应告警规则 | 告警级别 |
|----------|----------|-------------|----------|
| **Critical** | 72h 内修复 | `BLSKOXRefreshReuseDetected` — Refresh Token 复用检测 | `critical` |
| **Critical** | 72h 内修复 | `BLSKOXCrossTenantAccessDetected` — 跨租户越权访问检测 | `critical` |
| **Critical** | 72h 内修复 | `BLSKOXDatabaseErrorsIncreasing` — 数据库错误持续增长 | `critical` |
| **High** | 1 周内修复 | `BLSKOXHigh5xxErrorRate` — 5xx 错误率 > 5% | `critical` |
| **High** | 1 周内修复 | `BLSKOXRedisErrorsIncreasing` — Redis 错误持续增长 | `critical` |
| **Medium** | 下个版本修复 | `BLSKOXHighP95Latency` — P95 延迟 > 1s | `warning` |
| **Medium** | 下个版本修复 | `BLSKOXHighRateLimitRejectRate` — 限流拒绝率飙升 | `warning` |

### 告警 → 处置流程

```
Prometheus Alert 触发
  → AlertManager 路由 (severity=critical 即时通知, warning 聚合通知)
  → 运维 / 安全团队响应
  → 根据上表 SLA 时间窗完成修复
  → 复盘并更新告警阈值
```

> 告警规则完整定义见 `deploy/prometheus/rules/bls-kox-alerts.yml`，每个告警规则的 `annotations` 中包含 `sla` 字段标注了期望响应时间。

如你在代码审计中发现了绕过方法，请通过上述渠道联系。
