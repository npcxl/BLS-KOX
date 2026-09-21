# 登录人机验证（ALTCHA）

> 适用范围：`bls-server`（Koa 后端）+ `bls-admin`（登录页 / 系统参数页）。
> 页面级端到端记忆（含每个端点、每条校验、Redis key、审计字段、已知缺口）见
> [`bls-memory/pages/login-captcha.md`](../bls-memory/pages/login-captcha.md)。

## 1. 方案与原则

**不自研验证码。** 滑块拼图、图片裁切、鼠标轨迹识别、验证码算法一律不自己实现，改为集成成熟
开源自托管项目 **ALTCHA**：

- 项目：<https://github.com/altcha-org/altcha>（npm 包 `altcha`，v3）
- 服务端库：`altcha/lib` → `createChallenge()` / `verifySolution()`
- 前端组件：官方 Web Component `<altcha-widget>`（React 直接挂载，核心代码不改）

选择理由：开源可自托管、官方支持 TypeScript 服务端、提供 Web Component / React 用法、支持
invisible 静默验证与 Proof-of-Work、内置无障碍支持、无需接入任何第三方云服务、不需要自己写滑块算法。

职责边界：

| 关注点 | 归属 |
|---|---|
| challenge 生成、HMAC 签名、有效期 | `altcha/lib` |
| Proof-of-Work 求解（浏览器） | 官方 `<altcha-widget>`（Web Worker） |
| payload 服务端校验（密码学） | `altcha/lib` `verifySolution()` |
| `captchaToken`、Redis、绑定与一次性消费 | 本项目（不是验证码算法） |

### 两级语义

- **invisible（第一层，默认）**：`display="invisible"` + `auto="onload"`，后台完成 PoW，用户无感；
- **visible（第二层）**：命中策略时切换为官方可见组件（`display="standard"`），要求人工交互。

两层最终都由服务端校验 ALTCHA payload，然后签发**一次性 `captchaToken`**，由
`POST /api/auth/login` 消费。

### 已知能力边界（如实说明）

自托管 ALTCHA **不提供图片码 / 音频验证码生成**（`altcha/lib` 没有 code challenge 生成器，
该能力属于 ALTCHA Sentinel / Cloud）。因此可见层展示的是官方复选框/开关式 PoW 组件（自带 WCAG
无障碍支持），而不是图片拼图。

如果产品**确实**必须有图片拼图：把 `sys.login.captcha.provider` 切到 `tianai`，把
Tianai CAPTCHA 作为**独立内部服务**运行，Koa 只代理 challenge/verify 并照旧签发自己的
`captchaToken`。**禁止把 Java 验证码算法复制或改写成 TypeScript。**

安全控制始终是服务端的 PoW 校验；可见层是策略/交互升级，不是第二个密码学因子。

## 2. 系统参数

| 参数 | 类型 | 范围 / 枚举 | 默认值 |
|---|---|---|---|
| `sys.login.captcha.enabled` | bool | — | `true` |
| `sys.login.captcha.mode` | enum | `off` / `adaptive` / `always` | `adaptive` |
| `sys.login.captcha.provider` | enum | `altcha` / `tianai` | `altcha` |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `180` |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `120` |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `3` |

- 全部由 **Dynamic Config** 读取并缓存（`config:{tenantId}`，TTL 60s）；读取时做
  类型 → 范围 → 枚举校验，非法值回退默认并告警。
- 系统参数写入后 `onWrite → invalidateConfigCache(tid)` **立即清缓存**，新配置下一次请求即生效。
- 公开接口只下发 `{enabled, mode, provider, display, challengeUrl, fieldName}`，
  **不下发**阈值、PoW 难度与 HMAC 密钥。

环境变量（密钥/难度类配置不落库、不下发前端）：

| 变量 | 说明 |
|---|---|
| `ALTCHA_HMAC_KEY` | **生产必填**，≥ 32 位、非 `CHANGE_TO_*` 占位符，否则进程拒绝启动 |
| `ALTCHA_COST` | Proof-of-Work 难度（PBKDF2 迭代次数），默认 `50000` |
| `TIANAI_BASE_URL` | 仅 `provider=tianai` 时需要（独立验证码服务地址） |
| `CAPTCHA_DEV_BYPASS` | 仅开发环境可开启，生产环境出现该值直接阻止启动 |

数据落库位置（内容一致，纯 seed、无 DDL）：`sql/Init.sql`（`000406`–`000411`）与
`bls-server/migrations/20260922_017_login_captcha.sql`。旧版 9 参数的遗留行
（`silentThreshold` / `secondaryTypes` / `maxAttempts`）已不再使用，可手工删除。

## 3. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/captcha/config` | 公开配置 + 本轮组件形态（`invisible` / `visible`） |
| GET | `/api/auth/captcha/challenge` | **官方 ALTCHA challenge（原样返回，无 `{code,message,data}` 外层封装）** |
| POST | `/api/auth/captcha/verify` | 服务端校验 payload → 签发一次性 `captchaToken` |

`challenge` 是唯一不套封装的业务接口：官方 widget 的 `challenge` 属性直接读取该 JSON
（字段 `parameters` / `signature`）。所有接口均 `Cache-Control: no-store`。

`parameters.data` 内含 `{tenantId, usernameHash, display}`，且位于 **HMAC 签名内**，客户端无法伪造 ——
这是租户/账号绑定与「是否必须可见交互」能够由服务端强制的基础。challenge 的 `nonce` 同时写入
Redis（`captcha:challenge:{nonce}`，`SET NX EX`），保证**每个 challenge 只能使用一次**。

`verify` 请求体：

```json
{ "payload": "<官方 widget 的 base64(JSON) payload>", "username": "admin", "stage": "invisible" }
```

校验顺序（全部服务端）：

1. payload 结构校验（base64 → JSON → `{challenge:{parameters,signature}, solution}`）；
2. 绑定校验：`data.tenantId` 必须等于当前租户域名解析出的租户；`data.usernameHash` 非空时必须匹配；
3. **策略复核**：策略要求可见而请求声明 `invisible` → 返回 `requireVisible: true`，
   不签发凭证，且**不消耗 challenge**；
4. challenge 一次性：`GETDEL captcha:challenge:{nonce}`，取不到 → `CHALLENGE_EXPIRED`；
5. 官方 `verifySolution()`：过期 → 签名（防篡改）→ PoW 结果；
6. 签发一次性 `captchaToken`。

返回：

```json
{ "passed": true,  "captchaToken": "…", "expiresAt": 1789000000000 }
{ "passed": false, "reason": "SOLUTION_INVALID" }
{ "passed": false, "reason": "VISIBLE_REQUIRED", "requireVisible": true }
```

登录接口新增字段：

```json
POST /api/auth/login
{ "username": "admin", "password": "<md5>", "type": "account", "captchaToken": "<一次性凭证>" }
```

错误码：`40010 CAPTCHA_REQUIRED` / `40011 CAPTCHA_INVALID` / `40012 CAPTCHA_EXPIRED` /
`40013 CAPTCHA_REPLAYED` / `50301 CAPTCHA_SERVICE_UNAVAILABLE`（响应同时带 `details.errorCode`）。

## 4. 可见交互升级策略

`evaluateCaptchaPolicy()` 命中任一条件即切换为 **visible**（不再完全静默）：

| 条件 | reason |
|---|---|
| `mode=always` | `MODE_ALWAYS` |
| 同账号连续登录失败达到 `forceAfterFailures`（15 分钟窗口，登录成功清零） | `ACCOUNT_FAILURES` |
| 同一 IP 短时间内尝试 ≥ 3 个账号 | `IP_ACCOUNT_FANOUT` |
| IP 风险 HIGH/CRITICAL 或评分 ≥ 70（Security Event Center 规则引擎） | `IP_RISK_HIGH` |
| 登录限流压力 ≥ 10 | `RATE_LIMIT_PRESSURE` |
| 登录平台超管账号（`sys_user.is_admin = 1`） | `PRIVILEGED_ACCOUNT` |
| UA 明显异常（仅请求头层面，不做浏览器指纹识别） | `DEVICE_ANOMALY` |

该判定在 `/verify` 内**以真实 username 再评估一次**，因此「先取一个 invisible challenge 再登录」
无法规避升级。

## 5. captchaToken

- 32 字节随机数（`crypto.randomBytes`）→ `base64url`；**不做签名**，以 Redis 记录为准。
- Redis 只保存 `sha256(token)`；记录包含 `provider / tenantId / domainHash / usernameHash /
  ipHash / uaHash / stage / issuedAt / expiresAt`，TTL = `tokenTtlSeconds`（默认 **120 秒**）。
- 绑定：**当前域名** + **username hash** + **IP hash** + **User-Agent hash**。
- 一次性：`SET captcha:token-used:{hash} NX EX` 抢占 + `GETDEL` 取记录（无 `GETDEL` 时回退
  `MULTI/EXEC GET+DEL`）。并发请求只有一个能成功。
- 登录接口在**检查用户名 / 密码之前**消费；成功或失败都立即删除，禁止重复利用。
- 账号不存在与存在时响应结构完全一致，避免账号枚举。

## 6. 安全与可用性

- **限流**（IP / 账号 / 设备三维度）：`/challenge` ip 60/60s + device 30/300s；
  `/verify` ip 30/60s + account 20/300s + device 30/300s；`/config` ip 120/60s。
- **生产环境 Redis 不可用时 fail closed**：Redis 未启用或任何命令异常 → `503 / 50301`，
  登录一并被拒绝，不存在绕过分支；`provider=tianai` 但未配置 `TIANAI_BASE_URL` 同样 fail closed。
- **密钥**：`ALTCHA_HMAC_KEY` 只在环境变量中，绝不写日志、绝不下发前端（有测试断言）。
- **审计**：`CAPTCHA_*` 事件仅记录 `stage / provider / failureReason / tenantId / usernameHash /
  ipHash / requestId`，**不记录** HMAC 密钥、完整 payload、`solution`、challenge 签名与完整 Token。
- **不采集**鼠标轨迹、按键内容，不做浏览器指纹识别；仅使用请求头 UA 与 IP 聚合风险。
- 全部数据带 TTL，无永久键；接口 `no-store`。
- 前端依赖 **HTTPS / localhost**（官方 widget 需要 secure context）；`bls-admin-nginx.conf` 的 CSP
  必须包含 `worker-src 'self' blob: data:`，否则官方 PoW Worker 会被拦截。

## 7. 前端流程

登录页（`bls-admin/src/pages/user/login/index.tsx` + `components/AltchaCaptcha`）：

1. 打开页面请求 `GET /api/auth/captcha/config`。
2. `enabled=false` → 完全保持原登录流程。
3. `enabled=true` → 挂载官方 `<altcha-widget>`（`auto="onload"`、`language="zh-cn"`、
   `challenge="/api/auth/captcha/challenge"`），后台完成 Proof-of-Work。
4. widget 触发 `verified` → 页面把 payload 提交 `POST /api/auth/captcha/verify`，
   拿到一次性 `captchaToken`（用户无感）。
5. 若返回 `requireVisible: true` → 切换 `display="visible"`、重新挂载并提示用户完成可见验证。
6. widget 触发 `expired` → 自动重新挂载以获取新 challenge（「过期自动重新获取」）。
7. 点击登录 → `POST /api/auth/login` 携带 `captchaToken`。
8. 登录返回 `40010-40013` → 清空凭证、重读配置、自动重试一次；`50301` → 提示服务暂不可用。
9. 样式通过官方 `--altcha-*` CSS 变量对齐 Ant Design Pro（主色 `#1677ff`、圆角 8px），
   中文文案来自官方 i18n（`altcha/i18n/zh-cn`），**未修改 ALTCHA 核心验证代码**。

系统参数页（`pages/system/config/components/CaptchaSettingPanel.tsx`）提供「登录人机验证」开关与
高级配置（模式 / 提供方 / 两个 TTL / 连续失败阈值）；密钥类配置只提示来自环境变量。

## 8. 测试

`bls-server/src/security/captcha/__tests__/`：

| 文件 | 覆盖点 |
|---|---|
| `altcha-helper.ts` | 用官方库求解 challenge 并产出与 widget 完全一致的 base64 payload（测试契约的真实性） |
| `captcha-service.test.ts` | 功能关闭兼容、invisible 静默成功、payload 无效（结构/签名/解）、challenge 过期与一次性、challenge 与账号绑定、captchaToken 过期 / 重复消费 / 账号不匹配 / 域名不匹配 / 跨 IP / 跨 UA、并发消费只有一个成功、连续失败达到阈值后要求可见验证、`mode=always`、超管账号、Redis 不可用 fail closed、provider 未配置、TTL 无永久数据、Redis 中不出现明文 Token |
| `captcha-audit.test.ts` | 事件类型齐全；`detail` 字段白名单；不含 ALTCHA 密钥 / 完整 payload / `solution` / 签名 / 完整 Token / 明文用户名 |

命令：

```bash
cd bls-server && npm run lint && npm run test && npm run build && npm run openapi
cd bls-admin  && npm run tsc  && npm run build
```
