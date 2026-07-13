# Webhook Platform 文档

## 概述

Webhook 模块提供**可靠的事件回调机制**，当系统内发生特定业务事件（用户创建、订单完成、文件上传等）时，自动 POST 到注册的外部 URL。

与 Outbox Pattern 联动：事件先写入 `outbox_event` 表（事务保证），再由 Publisher 异步投递。

## 架构链路

```
业务操作 → appendEvent(trx)  →  outbox_event (同一事务)
                ↓
OutboxPublisher.poll()  →  fetchPending (原子 Claim)
                ↓
dispatch()  →  [Handler A, Handler B, Webhook Handler]
                ↓
webhookJob.handler()  →  HMAC 签名 → POST 目标 URL
                ↓
sys_webhook_delivery (投递日志)  → 成功/失败/重试
```

## 使用方式

### 1. 注册 Webhook

前端「Webhook管理」页面 → 点击「注册 Webhook」→ 填写：

| 字段 | 说明 |
|------|------|
| 名称 | 标识，如"订单通知" |
| 回调 URL | 目标服务器的接收端点（需 HTTPS，禁止内网） |
| 订阅事件 | 多选：`USER_CREATED` / `ORDER_CREATED` / `PAYMENT_COMPLETED` / `FILE_UPLOADED` / `SESSION_REVOKED` |

注册后自动生成 32 位 HMAC-SHA256 密钥，用于验签。

### 2. 测试发送

点「测试」→ 向目标 URL 发送测试 payload：

```json
{ "event": "test", "timestamp": "2026-07-13T..." }
```

### 3. 对接（接收方）

服务端收到 POST 请求，从 Header 获取签名并验证：

```
X-Webhook-Signature: abc123...  (HMAC-SHA256(payload, secret))
X-Webhook-ID: WH001
```

验证方式：

```javascript
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', YOUR_SECRET)
  .update(JSON.stringify(body)).digest('hex');
if (sig !== req.headers['x-webhook-signature']) {
  return res.status(401).json({ error: 'invalid signature' });
}
res.status(200).json({ ok: true });
```

### 4. 查看日志

点「日志」→ 侧边栏展示每次投递的状态（成功/失败/重试次数/响应码/错误信息）。

## 后端 API

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/system/webhooks` | `system:webhook:list` | 列表 |
| `POST` | `/system/webhooks` | `system:webhook:add` | 注册（自动生成 secret） |
| `PUT` | `/system/webhooks/:id` | `system:webhook:edit` | 修改 |
| `DELETE` | `/system/webhooks/:id` | `system:webhook:remove` | 删除 |
| `POST` | `/system/webhooks/:id/test` | `system:webhook:test` | 测试发送 |
| `GET` | `/system/webhooks/:id/logs` | `system:webhook:logs` | 投递日志 |
| `POST` | `/system/webhooks/:id/retry` | `system:webhook:logs` | 手动重试 |

## 数据库

| 表 | 说明 |
|----|------|
| `sys_webhook` | 注册的 Webhook 订阅（URL、事件类型、HMAC secret、启停状态） |
| `sys_webhook_delivery` | 每次投递日志（状态、响应码、错误、重试次数） |

## 安全防护

| 机制 | 说明 |
|------|------|
| **SSRF 防护** | 禁止 localhost / 127.0.0.1 / 内网 / Cloud Metadata IP，异步 DNS 解析后二次校验 |
| **HMAC 签名** | 每个 Webhook 独立 secret，SHA256 签名，接收方可验签防篡改 |
| **AbortController** | 投递 10s 超时，防阻塞 |
| **禁止重定向** | `redirect: 'manual'`，不自动跟随 3xx |
| **投递重试** | 失败自动重试（最多 5 次），指数退避 |

## 与 Outbox 集成

Webhook Handler 注册为 Outbox Subscriber：

```typescript
// src/outbox/subscribers.ts
outboxPublisher.subscribe(EventTypes.USER_CREATED, async (event) => {
  // 查找所有订阅该事件类型的 Webhook，逐个入队投递
  const webhooks = await db.from('sys_webhook')
    .where(...JSON_CONTAINS(events, USER_CREATED)...).where('status', '0');
  for (const wh of webhooks) {
    await enqueue({ jobType: 'webhook', jobData: { webhookId: wh.webhook_id, ... } });
  }
});
```

## 部署命令

```bash
# 数据库迁移
npm run db:migrate up

# 菜单权限（迁移自动执行）
# 角色管理 → 分配 system:webhook:* 权限给对应角色
```
