# BLS-KOX Phase 2 修复清单

> 目标：在进入 Phase 3 之前，补齐生产环境安全配置、统一认证上下文、审计日志可信来源和安全事件映射问题。

---

# 一、当前已完成项

以下内容已经完成，可以保留：

- [x] JWT_SECRET 在生产环境进行强校验
- [x] DB_PASSWORD 在生产环境进行强校验
- [x] 已新增 Request Context
- [x] Request Context 基于 AsyncLocalStorage
- [x] 已提供：
  - `getRequestContext()`
  - `getCurrentTenantId()`
  - `getCurrentUserId()`
  - `getRequestId()`
  - `setAuthContext()`
- [x] Tenant Middleware 已使用 `verifyToken()`
- [x] Tenant Middleware 已将用户信息写入 Request Context
- [x] 已新增统一 Logger
- [x] Logger 支持：
  - debug
  - info
  - warn
  - error
- [x] 生产环境使用结构化 JSON 日志
- [x] 生产环境默认关闭 debug
- [x] Logger 已具备敏感字段脱敏
- [x] SecurityEventType 已补充更多安全事件类型
- [x] Security Risk Level 已覆盖主要安全事件

---

# 二、P0 必须修复项

## P0-1 修复生产环境 CORS 空白名单回退问题

### 当前问题

当前逻辑存在：

```text
NODE_ENV=production
+
CORS_ORIGINS 未配置
+
CORS_ORIGIN 默认 *
↓
回退到任意 Origin
```

这会导致生产环境在忘记配置白名单时，实际仍然接受任意跨域来源。

### 修复要求

生产环境必须使用严格白名单。

推荐逻辑：

```ts
origin: (ctx) => {
  const origin = ctx.get('Origin');

  if (!origin) {
    return '';
  }

  if (env.isProduction) {
    return env.corsOrigins.includes(origin)
      ? origin
      : '';
  }

  return env.corsOrigin === '*'
    ? origin
    : env.corsOrigin;
}
```

同时建议生产环境启动时校验：

```ts
if (
  env.isProduction &&
  env.corsOrigins.length === 0
) {
  throw new Error(
    'Production must configure CORS_ORIGINS',
  );
}
```

### 验收标准

- [ ] 生产环境未配置 CORS_ORIGINS 时启动失败
- [ ] 非白名单 Origin 被拒绝
- [ ] 白名单 Origin 正常通过
- [ ] 开发环境仍可使用宽松策略

---

## P0-2 禁止生产环境使用 CORS_ORIGINS=*

### 当前问题

当前规则允许：

```text
CORS_ORIGINS=*
```

生产环境下，这相当于继续放开全部 Origin。

### 修复要求

启动时检查：

```ts
if (
  env.isProduction &&
  env.corsOrigins.includes('*')
) {
  throw new Error(
    'Wildcard CORS origin is not allowed in production',
  );
}
```

### 验收标准

- [ ] production + `CORS_ORIGINS=*` 启动失败
- [ ] development 可按需要保留宽松配置
- [ ] credentials=true 时不会出现任意 Origin 反射

---

## P0-3 Replay Middleware 删除 jwt.decode()

### 当前问题

当前流程：

```text
Tenant Middleware
→ verifyToken()
→ setAuthContext()

Replay Middleware
→ jwt.decode()
→ 再解析 userId/tenantId
```

这会造成：

- 重复解析 JWT
- 使用未验证 Payload
- Request Context 没有真正成为统一可信身份来源

### 修复要求

Replay Middleware 改为：

```ts
const requestContext =
  getRequestContext();

const tenantId =
  requestContext?.tenantId ??
  undefined;

const userId =
  requestContext?.userId ??
  undefined;
```

删除：

```ts
import jwt from 'jsonwebtoken';
```

删除：

```ts
extractJwtPayload()
```

删除 Replay 中对 JWT 的二次 decode。

### 验收标准

- [ ] Replay Middleware 不再 import jsonwebtoken
- [ ] Replay Middleware 不再调用 jwt.decode()
- [ ] tenantId/userId 统一来自 Request Context
- [ ] 匿名接口仍能正常处理

---

## P0-4 Security Audit 写入失败不能静默吞掉

### 当前问题

当前：

```ts
catch {
  // 安全日志写入失败不阻塞主流程
}
```

虽然“不阻塞主流程”是正确的，但完全静默会导致审计链路失效而无人知晓。

### 修复要求

保留“不阻塞业务”的原则，但必须记录错误。

示例：

```ts
} catch (error) {
  logger.error(
    'Security audit log write failed',
    {
      event:
        'security_audit_write_failed',

      eventType:
        input.eventType,

      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : String(error),
    },
  );
}
```

注意：

禁止直接记录完整 input。

### 验收标准

- [ ] 审计日志写失败不阻断业务
- [ ] 失败时统一 logger.error
- [ ] 不记录 password/token/secret
- [ ] 日志包含 eventType 和错误摘要

---

## P0-5 API_SIGN_SECRET 生产环境校验

### 当前问题

当前：

```ts
signSecret:
  process.env.API_SIGN_SECRET ?? ''
```

生产环境即使缺少 API_SIGN_SECRET 也能启动。

但系统存在 signature 模式接口。

### 修复要求

推荐：

```ts
const apiSignSecret =
  process.env.API_SIGN_SECRET
    ?.trim() ?? '';

if (
  env.isProduction &&
  replayEnabled &&
  !apiSignSecret
) {
  throw new Error(
    'API_SIGN_SECRET is required when replay protection is enabled',
  );
}
```

更优雅的版本：

```text
只有启用了 signature 规则
才要求 API_SIGN_SECRET
```

如果当前不方便扫描规则，第一版可以：

```text
production
+
REPLAY_ENABLED=true
→ API_SIGN_SECRET 必填
```

### 验收标准

- [ ] 生产环境启用 Replay 时，缺少 API_SIGN_SECRET 启动失败
- [ ] 开发环境允许本地配置
- [ ] Secret 不写入日志
- [ ] Secret 不硬编码进源码

---

# 三、P1 建议修复项

## P1-1 修正 SecurityErrorCode → SecurityEventType 映射

### 当前问题

当前仍存在错误映射，例如：

```text
40101
→ TIMESTAMP_EXPIRED
```

但实际应该：

```text
40101
→ TIMESTAMP_MISSING
```

未知错误也不应该默认：

```text
TIMESTAMP_EXPIRED
```

### 修复要求

建议完整映射：

```ts
const eventMap:
  Record<number, SecurityEventType> = {
    40101:
      SecurityEventType.TIMESTAMP_MISSING,

    40102:
      SecurityEventType.TIMESTAMP_INVALID,

    40103:
      SecurityEventType.TIMESTAMP_EXPIRED,

    40104:
      SecurityEventType.NONCE_MISSING,

    40901:
      SecurityEventType.NONCE_REPLAY,

    40105:
      SecurityEventType.SIGNATURE_MISSING,

    40106:
      SecurityEventType.SIGNATURE_INVALID,

    40902:
      SecurityEventType.IDEMPOTENCY_KEY_MISSING,

    40903:
      SecurityEventType.IDEMPOTENCY_PROCESSING,

    40904:
      SecurityEventType.IDEMPOTENCY_CONFLICT,
  };
```

默认：

```ts
const eventType =
  eventMap[err.securityCode] ??
  SecurityEventType
    .SECURITY_VALIDATION_FAILED;
```

### 验收标准

- [ ] 错误码和事件类型准确对应
- [ ] 未知错误不再归类 TIMESTAMP_EXPIRED
- [ ] Idempotency 事件具备完整映射
- [ ] Security Dashboard 数据可准确统计

---

## P1-2 actorFromCtx 使用可信 Request Context

### 当前问题

当前 actorFromCtx 仍可能从：

```text
x-tenant-id
```

读取 tenantId。

该 Header 可被客户端伪造，不应该作为安全审计身份来源。

### 修复要求

优先使用：

```ts
const requestContext =
  getRequestContext();
```

建议：

```ts
export function actorFromCtx(
  ctx: Context,
): Partial<AuditActor> {
  const requestContext =
    getRequestContext();

  return {
    tenantId:
      requestContext?.tenantId ??
      '000000',

    userId:
      requestContext?.userId ??
      null,

    username:
      requestContext?.username ??
      null,

    clientIp:
      requestContext?.clientIp ??
      ctx.ip,

    userAgent:
      requestContext?.userAgent ??
      null,

    requestId:
      requestContext?.requestId ??
      null,
  };
}
```

不要信任：

```text
x-tenant-id
```

作为安全日志 Actor 身份。

### 验收标准

- [ ] Actor tenantId 来自 verified JWT Context
- [ ] Actor userId 来自 Request Context
- [ ] 客户端伪造 x-tenant-id 不影响安全日志身份
- [ ] 匿名请求仍能记录 anonymous/000000

---

## P1-3 Request ID 增加格式和长度校验

### 当前问题

当前直接接受：

```text
X-Request-Id
```

用户可以传任意长度字符串。

### 修复要求

增加：

```ts
function normalizeRequestId(
  value?: string,
): string {
  if (
    value &&
    /^[A-Za-z0-9_-]{8,64}$/.test(value)
  ) {
    return value;
  }

  return randomUUID();
}
```

更严格方案：

```text
internalRequestId
→ 服务端生成

externalRequestId
→ 客户端传入，仅用于关联
```

### 验收标准

- [ ] 超长 Request ID 被拒绝或替换
- [ ] 非法字符被替换
- [ ] 日志不会被污染
- [ ] 内部追踪 ID 稳定唯一

---

## P1-4 统一 App 启动日志

### 当前问题

app.ts 中仍存在：

```ts
console.log()
console.error()
```

Logger 已经建立，应逐步统一。

### 修复要求

改为：

```ts
logger.info(
  'Server started',
  {
    port: env.port,
    host: env.host,
  },
);
```

错误：

```ts
logger.error(
  'Application error',
  {
    error: serializeError(error),
  },
);
```

不要在生产环境直接输出 Redis、DB 内部地址。

### 验收标准

- [ ] app.ts 不再直接 console.log
- [ ] app.ts 不再直接 console.error
- [ ] 生产日志统一 JSON 结构
- [ ] 日志包含 requestId/tenantId/userId（请求内）

---

# 四、P2 可与 Phase 3 一起处理

## P2-1 Client IP 获取和可信代理

### 当前问题

当前：

```ts
ctx.ip || x-forwarded-for
```

由于 ctx.ip 通常总有值，x-forwarded-for 基本不会生效。

在 Docker + Nginx 场景中，可能拿到：

```text
Nginx / Docker 内网 IP
```

而不是用户真实 IP。

### 修复要求

根据部署结构配置：

```ts
app.proxy = true;
```

但仅当：

```text
Koa 只能通过可信 Nginx 访问
```

否则客户端可以伪造：

```text
X-Forwarded-For
```

建议 Phase 3 Rate Limit 上线前完成。

### 验收标准

- [ ] Rate Limit 使用真实可信 IP
- [ ] 外部无法绕过代理直接访问 Koa
- [ ] Nginx 正确设置 X-Forwarded-For
- [ ] Docker 网络配置明确

---

# 五、推荐修改文件

```text
bls-server/src/

├── app.ts

├── config/
│   └── env.ts

├── core/
│   ├── logger.ts
│   ├── request-context.ts
│   └── security-audit.ts

├── middleware/
│   └── tenant.ts

└── middlewares/
    └── replayProtection.ts
```

---

# 六、Phase 2 推荐测试清单

## Env Security

- [ ] production + 无 JWT_SECRET → 启动失败
- [ ] production + 无 DB_PASSWORD → 启动失败
- [ ] production + Replay enabled + 无 API_SIGN_SECRET → 启动失败
- [ ] development 可正常启动

## CORS

- [ ] 白名单 Origin 正常
- [ ] 非白名单 Origin 拒绝
- [ ] production + 空 CORS_ORIGINS → 启动失败
- [ ] production + CORS_ORIGINS=* → 启动失败
- [ ] 无 Origin 请求不受影响

## Request Context

- [ ] requestId 正常生成
- [ ] 非法 requestId 被替换
- [ ] tenantId 来自 verified JWT
- [ ] userId 来自 verified JWT
- [ ] anonymous 请求上下文正常
- [ ] Service 层能读取 getCurrentTenantId()

## Replay Context

- [ ] Replay 不再调用 jwt.decode()
- [ ] Replay 使用 Request Context
- [ ] 登录匿名接口正常
- [ ] authenticated 接口 tenantId/userId 正确

## Security Audit

- [ ] 审计日志写成功
- [ ] 审计 DB 失败不阻断业务
- [ ] 审计 DB 失败产生 logger.error
- [ ] 客户端伪造 x-tenant-id 不影响 Actor
- [ ] 错误码准确映射 EventType

---

# 七、Phase 2 最终验收标准

只有以下全部满足，Phase 2 才视为正式完成：

- [ ] JWT_SECRET 生产强校验
- [ ] DB_PASSWORD 生产强校验
- [ ] API_SIGN_SECRET 按安全策略强校验
- [ ] CORS 使用严格白名单
- [ ] 生产环境空白名单 fail closed
- [ ] 生产环境禁止 wildcard Origin
- [ ] Request Context 成为统一请求身份上下文
- [ ] Replay 不再 jwt.decode()
- [ ] Actor 信息来自可信 Request Context
- [ ] Security Audit 写失败有错误日志
- [ ] SecurityErrorCode 与 EventType 准确映射
- [ ] Request ID 有长度和字符限制
- [ ] 生产日志统一 Logger
- [ ] Client IP 策略在 Rate Limit 上线前明确

---

# 八、推荐执行顺序

```text
1. 修复 CORS fail-closed
2. 禁止 production wildcard CORS
3. 修复 API_SIGN_SECRET 校验
4. Replay 改用 Request Context
5. actorFromCtx 改用 Request Context
6. Security Audit catch 接 logger
7. 修正 ErrorCode → EventType
8. Request ID 校验
9. app.ts 统一 Logger
10. 补测试
11. Phase 2 验收
12. 进入 Phase 3
```

---

# 九、最终结论

当前 Phase 2 已经具备：

```text
安全配置基础
+
统一 Request Context
+
统一 Logger
+
安全事件模型
```

剩余风险主要集中在：

```text
CORS fail-open
+
身份上下文未完全统一
+
审计失败静默
+
安全事件映射不准确
+
请求标识和代理 IP 边界
```

建议完成本清单后，再进入 Phase 3：

```text
Rate Limit
+
Object Ownership Guard
+
Mass Assignment Audit
+
Tenant Integration Test
```
