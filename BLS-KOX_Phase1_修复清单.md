# BLS-KOX Phase 1 修复清单

> 目标：在进入 Phase 2 之前，补齐 Replay Protection 与 Idempotency 的并发边界和异常处理问题。

---

## 一、当前已完成项

以下项目已经完成，可作为本轮保留项：

- [x] Replay 执行顺序已调整为：
  - Timestamp 校验
  - Nonce 格式校验
  - Signature 校验
  - Nonce Redis 去重
  - Idempotency 检查
- [x] Signature 模式已经做到“先验签，再消费 Nonce”
- [x] Nonce TTL 已增加运行时安全计算：
  - `max(configuredTtl, windowSeconds * 2 + 30)`
- [x] Idempotency 首次抢占已使用 `SET NX EX`
- [x] 已检查 `SET NX` 返回结果
- [x] 幂等缓存已经支持保存和恢复 HTTP Status
- [x] 业务异常抛出时已具备基础锁释放逻辑

---

# 二、必须修复项

## P0-1 非 2xx 响应导致 processing 锁残留

### 当前问题

当前中间件逻辑只在 `2xx` 时保存 completed 状态。

如果 Controller 正常返回：

```ts
ctx.status = 400;
ctx.body = {
  code: 40001,
  message: "库存不足",
};
```

但没有抛出异常，则不会进入 catch，也不会释放幂等锁。

可能导致：

```text
Idempotency-Key
→ processing
→ Controller 返回 400
→ 不保存 completed
→ 不释放 processing
→ 一直锁到 TTL 结束
```

例如当前支付接口 TTL 为 7200 秒，则可能锁 2 小时。

### 修复要求

在：

```ts
await next();
```

之后根据状态码明确处理：

```text
2xx
→ 保存 completed

4xx
→ 根据策略缓存业务结果或释放锁

5xx
→ 释放 processing，允许重试
```

第一版建议：

```text
2xx：保存 completed
4xx：释放锁
5xx：释放锁
```

后续可针对特定业务错误增加“可缓存 4xx”。

### 验收标准

- [ ] 400 响应后对应 Idempotency Key 不残留 processing
- [ ] 500 响应后允许再次重试
- [ ] 2xx 正常保存 completed
- [ ] 重试 completed 请求能恢复第一次响应

---

## P0-2 幂等锁增加所有权 Token

### 当前问题

当前 processing 值类似：

```text
processing
```

释放时直接：

```ts
DEL key
```

存在旧请求误删新锁的问题。

典型场景：

```text
请求 A 获得锁
→ 执行时间过长
→ 锁 TTL 到期

请求 B 获得同 Key 新锁

请求 A 随后异常
→ DEL key
→ 把请求 B 的锁删掉
```

### 修复要求

processing value 改为：

```text
processing:{lockToken}
```

例如：

```ts
const lockToken = crypto.randomUUID();

const lockValue = `processing:${lockToken}`;
```

SET：

```ts
SET key lockValue NX EX ttl
```

首次抢占返回：

```ts
{
  status: "new",
  lockToken,
}
```

释放时必须校验 ownership。

建议使用 Lua：

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

### 验收标准

- [ ] 请求 A 只能释放自己的锁
- [ ] 请求 A 无法删除请求 B 的锁
- [ ] 锁过期后新请求可正常获得锁
- [ ] release 使用原子 compare-and-delete

---

## P0-3 Idempotency-Key 绑定请求 Fingerprint

### 当前问题

当前 Key 主要由：

```text
tenantId
userId
idempotencyKey
```

组成。

风险：

同一个 Idempotency-Key 被用于不同路径或不同 Body 时，系统可能返回之前的缓存结果，而不是冲突。

例如：

第一次：

```http
POST /api/payment/create
Idempotency-Key: ABC123

{
  "amount": 100
}
```

第二次：

```http
POST /api/payment/create
Idempotency-Key: ABC123

{
  "amount": 999
}
```

应该返回：

```text
IDEMPOTENCY_CONFLICT
```

而不是直接返回第一次结果。

### 修复要求

生成 Fingerprint：

```text
METHOD
PATH
BODY_HASH
```

推荐：

```ts
const fingerprint = sha256(
  [
    params.method.toUpperCase(),
    params.path,
    stableStringify(params.body),
  ].join("\n"),
);
```

Redis processing 状态建议：

```json
{
  "state": "processing",
  "fingerprint": "xxx",
  "lockToken": "xxx"
}
```

completed 状态建议：

```json
{
  "state": "completed",
  "fingerprint": "xxx",
  "status": 201,
  "body": {
    "code": 200,
    "data": {}
  }
}
```

规则：

```text
Idempotency-Key 相同
+ Fingerprint 相同
→ 合法重试

Idempotency-Key 相同
+ Fingerprint 不同
→ 409 IDEMPOTENCY_CONFLICT
```

### 验收标准

- [ ] 同 Key 同请求正常命中缓存
- [ ] 同 Key 不同 Body 返回 409
- [ ] 同 Key 不同 Path 返回 409
- [ ] 同 Key 不同 HTTP Method 返回 409

---

## P0-4 幂等结果缓存失败不能覆盖已成功业务

### 当前问题

业务可能已经成功提交：

```text
MySQL commit 成功
```

随后：

```text
Redis saveIdempotentResult 失败
```

如果继续向上抛错，则客户端收到 500。

客户端重试后可能导致：

```text
重复下单
重复扣库存
重复发放
重复通知
```

### 修复要求

业务成功后保存幂等结果失败时：

```text
记录错误日志
不覆盖原业务成功响应
```

示例：

```ts
try {
  await svc.saveIdempotentResult(...);
} catch (error) {
  logger.error({
    event: "idempotency_cache_write_failed",
    error,
  });
}
```

对于强一致业务：

```text
支付
订单
库存
优惠券发放
积分变更
```

不能只依赖 Redis 幂等。

数据库层建议增加唯一约束，例如：

```sql
UNIQUE KEY uk_payment_request (
  tenant_id,
  idempotency_key
);
```

### 验收标准

- [ ] Redis 保存失败不会把已成功业务改成 500
- [ ] 错误会进入统一日志
- [ ] 强一致业务有数据库唯一约束或业务唯一号兜底
- [ ] 重复请求不能产生重复业务数据

---

# 三、建议优化项

## P1-1 配置值和实际运行值保持一致

当前运行时已经：

```ts
Math.max(
  rule.nonceTtlSeconds ?? 0,
  window * 2 + 30,
)
```

但默认配置仍存在：

```ts
windowSeconds: 120,
nonceTtlSeconds: 180,
```

建议直接改为：

```ts
windowSeconds: 120,
nonceTtlSeconds: 300,
```

避免维护人员误解。

### 验收标准

- [ ] 默认规则配置与运行逻辑一致
- [ ] 配置注释说明 TTL 最小安全要求

---

## P1-2 幂等缓存结构标准化

建议定义：

```ts
interface IdempotencyRecord {
  state: "processing" | "completed";

  fingerprint: string;

  lockToken?: string;

  status?: number;

  body?: unknown;

  headers?: {
    contentType?: string;
    location?: string;
  };
}
```

禁止缓存：

```text
Set-Cookie
Authorization
完整 Token
敏感响应 Header
```

### 验收标准

- [ ] Redis 数据结构统一
- [ ] processing/completed 状态可明确区分
- [ ] 状态恢复逻辑集中在 Service
- [ ] 中间件不自行解析复杂 Redis 格式

---

## P1-3 Security Event 映射继续细化

建议保证错误码与事件类型准确对应：

```text
TIMESTAMP_MISSING
TIMESTAMP_INVALID
TIMESTAMP_EXPIRED

NONCE_MISSING
NONCE_REPLAY

SIGNATURE_MISSING
SIGNATURE_INVALID

IDEMPOTENCY_KEY_MISSING
IDEMPOTENCY_PROCESSING
IDEMPOTENCY_CONFLICT
```

未知安全错误不要默认全部归为：

```text
TIMESTAMP_EXPIRED
```

建议增加：

```text
SECURITY_VALIDATION_FAILED
```

---

# 四、建议修改文件

重点检查和修改：

```text
bls-server/
└── src/
    ├── services/
    │   └── ReplayProtectionService.ts
    │
    ├── middlewares/
    │   └── replayProtection.ts
    │
    ├── config/
    │   └── replay-protection.ts
    │
    ├── shared/
    │   ├── utils/
    │   │   ├── signature.ts
    │   │   └── stable-stringify.ts
    │   │
    │   └── constants/
    │       └── security-error-code.ts
    │
    └── core/
        └── security-audit.ts
```

如已有同类工具文件，必须复用，不重复新建。

---

# 五、推荐 Idempotency 状态机

```text
请求进入
↓
生成 Fingerprint
↓
SET processing:{lockToken} NX EX ttl
│
├─ SET 成功
│   ↓
│   status = new
│   ↓
│   执行业务
│   │
│   ├─ 2xx
│   │   ↓
│   │   保存 completed
│   │
│   ├─ 4xx
│   │   ↓
│   │   根据策略释放或缓存
│   │
│   └─ 5xx / throw
│       ↓
│       Compare-And-Delete
│       ↓
│       允许重试
│
└─ SET 失败
    ↓
    GET 当前状态
    │
    ├─ processing + fingerprint 相同
    │   → 409 PROCESSING
    │
    ├─ completed + fingerprint 相同
    │   → 返回缓存结果
    │
    └─ fingerprint 不同
        → 409 IDEMPOTENCY_CONFLICT
```

---

# 六、必须补充的测试

## Replay Tests

- [ ] 正常 Timestamp
- [ ] Timestamp 缺失
- [ ] Timestamp 过期
- [ ] 未来 Timestamp 超窗口
- [ ] 正常 Nonce
- [ ] 相同 Nonce 第二次失败
- [ ] 不同 tenantId 相同 Nonce 不冲突
- [ ] 不同 userId 相同 Nonce 不冲突
- [ ] 错误 Signature 失败
- [ ] 错误 Signature 不消费 Nonce

## Idempotency Tests

- [ ] 第一次请求返回 new
- [ ] processing 返回 409
- [ ] completed 返回缓存结果
- [ ] HTTP Status 正确恢复
- [ ] 同 Key 同 Body 正常重试
- [ ] 同 Key 不同 Body 返回冲突
- [ ] 同 Key 不同 Path 返回冲突
- [ ] 非 2xx 响应不会残留 processing
- [ ] 5xx 后允许重试
- [ ] Redis 缓存写失败不覆盖业务成功响应
- [ ] 旧请求不能删除新请求锁
- [ ] 100 并发同 Idempotency-Key 时，仅 1 个请求获得 new

---

# 七、Phase 1 最终验收标准

只有以下全部满足，Phase 1 才视为完成：

- [ ] Signature 一定在 Nonce Redis 占位之前验证
- [ ] Nonce TTL 覆盖完整时间窗口
- [ ] Idempotency 首次资格通过原子 SET NX 获得
- [ ] processing 锁具有唯一 ownership token
- [ ] 锁释放使用原子 compare-and-delete
- [ ] Idempotency-Key 与请求 Fingerprint 绑定
- [ ] 非 2xx 不残留 processing
- [ ] 5xx 后允许安全重试
- [ ] 业务成功后 Redis 写失败不会改变业务响应
- [ ] completed 能恢复原 HTTP Status
- [ ] 并发测试验证只有 1 个请求实际进入业务逻辑
- [ ] Replay 和 Idempotency 都有自动测试覆盖

---

# 八、建议执行顺序

```text
1. 增加 Fingerprint
2. 增加 lockToken
3. Lua compare-and-delete
4. 修复非 2xx 状态处理
5. 修复缓存写失败语义
6. 标准化 IdempotencyRecord
7. 补测试
8. 执行并发压测
9. Phase 1 验收
10. 再进入 Phase 2
```

---

## 最终结论

当前 Phase 1 主干逻辑已经正确，剩余风险主要集中在：

```text
Idempotency 状态机
+
锁所有权
+
请求指纹
+
异常状态恢复
+
并发验证
```

建议完成以上修复后，再进入 Phase 2 的认证上下文、CORS、Request Context 和 Rate Limit 改造。
