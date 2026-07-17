# P11: API Versioning

## 概述

API 版本化通过路由前缀区分不同的 API 边界，为未来的版本升级提供基础设施。

## 路由前缀

| 前缀 | 鉴权方式 | 用途 |
|------|----------|------|
| `/api/v1/` | JWT (标准用户认证) | 前端业务接口 |
| `/api/` | JWT + Deprecation header | 旧路径（兼容），180 天后下线 |
| `/openapi/v1/` | API Key + HMAC-SHA256 | 第三方开放接口 |
| `/internal/` | Service Token + IP 白名单 | 内部服务接口（监控、健康检查） |

## 使用方式

### 前端业务接口（/api/v1/）

```bash
# 新版本路径（推荐）
GET /api/v1/system/user/list

# 旧版本路径（兼容，带 Deprecation 头）
GET /api/system/user/list
```

旧路径响应头：
```http
Deprecation: true
Sunset: Thu, 09 Jan 2027 10:30:00 GMT
```

### OpenAPI（/openapi/v1/）

第三方调用需要 4 个请求头：

```http
POST /openapi/v1/orders
X-Api-Key: <api_key>
X-Timestamp: <unix_timestamp>
X-Nonce: <random_string>
X-Signature: <hmac_sha256>
```

签名算法：
```
HMAC-SHA256(METHOD:path:timestamp:nonce:body, api_secret)
```

Timestamp 必须在当前时间 ±5 分钟内。Nonce 通过 Redis 去重，同一窗口不可重复使用。

### Internal（/internal/）

仅允许内网 IP（`127.`, `10.`, `172.16-31`, `192.168.`）访问，且需携带 Service Token：

```bash
# 健康检查
GET /internal/health
X-Internal-Token: <INTERNAL_SECRET>

# Prometheus 指标
GET /internal/metrics
Authorization: Bearer <INTERNAL_SECRET>
```

环境变量配置：
```env
INTERNAL_SECRET=CHANGE_TO_A_RANDOM_INTERNAL_SECRET
INTERNAL_IP_ALLOWLIST=127.,10.,172.16.  # 逗号分隔的 IP 前缀
```

## 版本升级流程

当需要发布 v2 版本时：

1. 创建 `/api/v2/` 路由（可通过 `app.ts` 添加新的 rewrite 规则）
2. v1 路径添加 `Deprecation: true` 头
3. 前端逐步迁移到 v2
4. v1 路径在 Sunset 日期后下线

## 相关文档

- [架构设计](./architecture.md) — 请求链路与中间件
- [认证体系](./auth.md) — JWT Token / Refresh Token
- [安全能力](./security.md) — 防重放、限流
