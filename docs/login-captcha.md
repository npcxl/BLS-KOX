# 登录人机验证（两级 captcha）

> 适用范围：`bls-server`（Koa 后端）+ `bls-admin`（登录页 / 系统参数页）。
> 页面级端到端记忆（含每个端点、每条校验、Redis key、审计字段）见
> [`bls-memory/pages/login-captcha.md`](../bls-memory/pages/login-captcha.md)。

## 1. 目标

在“认证安全闭环”中补齐登录人机验证：

1. **第一层 · 静默验证**：用户无感。基于页面停留时间、鼠标 / 触控 / 键盘事件的**统计特征**、
   focus / visibility 变化、自动化标识、IP / 账号近期失败次数、限流与安全事件中心风险数据、
   可选 PoW 综合评分。
2. **第二层 · 可视化验证**：静默评分不足或命中强制策略时弹出，第一版实现**滑块拼图（slider）**
   与**图像旋转（rotate）**两种。
3. 两层验证通过后签发**一次性 `captchaToken`**，由 `POST /api/auth/login` 消费，验证通过后
   才允许检查用户名和密码。

必须遵守的可用性底线：**不能仅凭“没有鼠标移动”判定为机器人** —— 触控、纯键盘、无障碍用户
都能在默认阈值（70）下静默通过；真的拿不到人类行为信号时，用户只是多做一次可视化验证，
而不是被拒绝登录。

## 2. 系统参数

| 参数 | 类型 | 范围 / 枚举 | 默认值 | 说明 |
|---|---|---|---|---|
| `sys.login.captcha.enabled` | bool | `1/true/0/false` | `true` | 是否开启登录人机验证，可在系统参数页面开关 |
| `sys.login.captcha.mode` | enum | `off` / `adaptive` / `always` | `adaptive` | `off` 等价于关闭；`always` 直接进入第二层 |
| `sys.login.captcha.silentThreshold` | number | 0–100 | `70` | 静默评分通过阈值 |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `3` | 同账号近期连续登录失败达到该值强制第二层 |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `180` | challenge 有效期 |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `120` | `captchaToken` 有效期 |
| `sys.login.captcha.secondaryTypes` | csv | `slider` / `rotate` 子集 | `slider,rotate` | 可用二级验证类型 |
| `sys.login.captcha.maxAttempts` | number | 1–20 | `5` | 单个 challenge 最大尝试次数 |
| `sys.login.captcha.provider` | enum | `builtin` | `builtin` | 第一版只有内置实现 |

- 参数由现有 **Dynamic Config**（`bls-server/src/config/dynamic-config.ts`）读取并缓存：
  `config:{tenantId}`，TTL 60s。
- 参数校验在读取时完成：类型 → 范围 → 枚举 / CSV 白名单。非法值**回退默认值并告警**，
  不做宽松转换。
- 系统参数写入后由 CRUD 的 `onWrite` → `invalidateConfigCache(tenantId)` **立即清缓存**，
  新配置下一次请求即生效。
- 公开接口只下发 `{ enabled, mode, secondaryTypes }`，**不返回**阈值、失败次数、TTL、
  最大尝试次数等内部规则。

数据落库位置（两份内容一致，纯 seed、**无 DDL**）：

- `sql/Init.sql`（`000406`–`000414`，第 68–76 行）—— 全新环境执行 `Init.sql` 即完成初始化；
- `bls-server/migrations/20260922_017_login_captcha.sql`（`INSERT IGNORE`，可重复执行）——
  已部署的库通过 `npm run db:migrate up` 增量升级。

## 3. 接口

全部为**公共接口**（无需认证），且统一返回 `Cache-Control: no-store`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/captcha/config` | 公开配置，仅 `{enabled, mode, secondaryTypes}` |
| POST | `/api/auth/captcha/challenge` | 创建 challenge，返回 `{challengeId, stage, expiresAt, nonce, secondaryType?, payload?}` |
| POST | `/api/auth/captcha/silent/verify` | 第一层静默验证 |
| POST | `/api/auth/captcha/secondary/verify` | 第二层可视化验证 |
| GET | `/api/auth/captcha/image/:imageId` | 验证码图片（SVG，`no-store`） |

`payload` 只包含前端渲染需要的信息（画布尺寸、切片尺寸 / 位置、图片地址、容差、键盘提示），
**不含正确答案**。

`silent/verify` 请求体：

```json
{
  "challengeId": "...",
  "nonce": "...",
  "username": "admin",
  "startedAt": 1700000000000,
  "finishedAt": 1700000002600,
  "interactionSummary": {
    "dwellMs": 2600,
    "mouse": { "count": 24, "moves": 22, "avgSpeed": 0.8, "maxSpeed": 2.4, "avgInterval": 45, "stdInterval": 45 },
    "touch": { "count": 0 },
    "keyboard": { "count": 12, "avgInterval": 180, "stdInterval": 70 },
    "focus": { "blurCount": 0, "visibilityChanges": 0, "hiddenMs": 0 },
    "automation": { "webdriver": false, "plugins": 5, "languages": 3 }
  },
  "proof": { "nonce": "...", "difficulty": 4 }
}
```

`interactionSummary` 在服务端被**白名单化**（`sanitizeInteractionSummary()`）：只保留上表中的
统计字段并做范围裁剪，任何未声明字段（鼠标轨迹数组、按键内容、文本等）一律丢弃 ——
从结构上保证“不保存完整鼠标轨迹、按键内容或隐私数据”。

返回：

```json
// 通过
{ "passed": true, "captchaToken": "<一次性 Token>", "expiresAt": 1700000126000 }
// 未通过
{ "passed": false, "nextStage": "secondary", "secondaryChallenge": { "challengeId": "...", "stage": "secondary", "expiresAt": 0, "nonce": "...", "secondaryType": "slider", "payload": { } } }
```

登录接口新增字段：

```json
POST /api/auth/login
{ "username": "admin", "password": "<md5>", "type": "account", "captchaToken": "<一次性 Token>" }
```

## 4. 强制进入第二层的策略

即使 adaptive 模式下静默评分通过，命中以下任一条件也必须进入第二层（全部在服务端评估，
客户端**没有任何参数可以跳过**）：

| 条件 | 失败原因枚举 |
|---|---|
| 同账号近期连续登录失败 ≥ `forceAfterFailures`（15 分钟窗口，登录成功即清零） | `ACCOUNT_FAILURES` |
| 同一 IP 短时间内尝试 ≥ 3 个不同账号 | `IP_ACCOUNT_FANOUT` |
| IP 风险达到 HIGH / CRITICAL 或评分 ≥ 70（Security Event Center 规则引擎） | `IP_RISK_HIGH` |
| nonce 重放 / 被篡改 | `NONCE_REPLAY` |
| User-Agent / 设备特征明显异常，或 challenge 绑定信息与当前请求不一致 | `DEVICE_ANOMALY` |
| 登录平台超级管理员账号（`sys_user.is_admin = 1`） | `PRIVILEGED_ACCOUNT` |
| 登录限流压力 ≥ 10（`rate:ip:{ip}:/api/auth/login`） | `RATE_LIMIT_PRESSURE` |
| `mode = always` | `RISK_FORCED` |

## 5. captchaToken 设计

```
captchaToken = base64url({ v:1, c:challengeId, t:tenantId, e:expEpochSeconds }) + "." + base64url(HMAC-SHA256(payload, CAPTCHA_SECRET))
```

- 服务端**只保存 `sha256(captchaToken)`**（`captcha:token:{hash}`），不保存原始 Token。
- **只能消费一次**：原子 `SET captcha:token-used:{hash} NX EX` 抢占标记 → 再 `GETDEL` 取记录。
  - 抢占失败 → `CAPTCHA_REPLAYED`
  - 抢占成功但记录不存在 → `CAPTCHA_EXPIRED`
  - 并发请求只会有一个成功。
- **绑定**：`challengeId` + 租户 + **租户域名 hash** + `username` hash + **IP hash** + **UA hash**；
  任一不匹配 → `CAPTCHA_INVALID`（Token 已被消费，无法重试利用）。
- 登录接口在**检查用户名 / 密码之前**消费 Token；验证码失败与账号不存在返回结构完全一致，
  避免账号枚举。
- Token、签名密钥、答案、密码、行为轨迹都不写入日志 / 审计。
- 哈希与签名比较统一使用 `timingSafeEqual`。

业务错误码：

| code | HTTP | 含义 |
|---|---|---|
| 40010 | 400 | `CAPTCHA_REQUIRED` 缺少 captchaToken |
| 40011 | 400 | `CAPTCHA_INVALID` 无效（签名 / 绑定不匹配） |
| 40012 | 400 | `CAPTCHA_EXPIRED` 已过期 |
| 40013 | 400 | `CAPTCHA_REPLAYED` 已消费 |
| 50301 | 503 | `CAPTCHA_SERVICE_UNAVAILABLE` 验证服务不可用 |

响应体同时带 `details.errorCode` 字符串常量，前端可按数字或名称分支。

## 6. 第二层实现要点

- **slider**：服务端生成随机背景（随机渐变 + 随机形状 + 随机噪点）与随机切片位置，
  返回两张图（带缺角的背景图 + 同美术层裁剪出的切片图），并在 Redis 保存正确的 `x`。
- **rotate**：服务端生成带明确方向标记的图片并施加随机旋转角（20°–340°，步长 20°），
  Redis 保存该角度。
- 正确答案只存在 Redis；`payload` 只给容差（滑块 ±8px、旋转 ±15°）与键盘操作提示。
- 误差范围内即通过，**不是固定坐标比对**。
- attempts 使用原子 `INCR`；超过 `maxAttempts` 的第 N+1 次请求**立即失效**（正确答案也不再校验）。
- 验证成功后删除 challenge 再签发 `captchaToken`。
- 无障碍替代路径：两种类型都由 antd `Slider` 驱动，**方向键 + Enter 即可完成**，
  避免“只有滑块才能登录”。同时预留了新增其它 `secondaryTypes` 的扩展点。
- 第一版不使用自由画图 AI 识别。

## 7. 安全与可用性

- challenge、attempts、nonce、`captchaToken` 记录 / 消费标记、图片、失败计数全部存 Redis，
  且**全部带 TTL**，不产生永久数据（key 与 TTL 见 `bls-memory/00-common/01-redis.md`）。
- 一次性消费使用原子 `SET NX EX`（无 GETDEL 时回退 `MULTI/EXEC GET+DEL`），不依赖 Lua。
- **生产环境 Redis 不可用时 fail closed**：`CaptchaStore` 把“Redis 未启用”与任何 Redis 命令
  异常统一转换为 HTTP 503 `CAPTCHA_SERVICE_UNAVAILABLE`，登录流程同样被拒绝，绝不绕过验证码。
- 验证码接口按 **IP / 账号 / 设备** 三个维度限流（规则见 `00-common/03-rate-limiting.md`），
  防止无限创建 challenge 消耗 Redis 与 CPU。
- `challengeId` / `nonce` 使用 `crypto.randomBytes`；图片随机数使用 `crypto.randomInt`；
  禁止 `Math.random`。
- 验证码图片接口 `Cache-Control: no-store, no-cache, must-revalidate, private`。
- **生产启动校验**：`CAPTCHA_SECRET` 必填、≥ 32 位、不得为 `CHANGE_TO_*` 或弱口令；
  `CAPTCHA_DEV_BYPASS=true` 在生产环境**直接阻止启动**（`src/app.ts` + `src/config/env.ts`）。
  开发环境可用 `CAPTCHA_DEV_BYPASS=true` 显式绕过。

## 8. 安全审计

新增事件类型：

```
CAPTCHA_SILENT_PASSED       CAPTCHA_SILENT_FAILED      CAPTCHA_SECONDARY_REQUIRED
CAPTCHA_SECONDARY_PASSED    CAPTCHA_SECONDARY_FAILED   CAPTCHA_TOKEN_INVALID
CAPTCHA_TOKEN_REPLAYED      CAPTCHA_SERVICE_UNAVAILABLE
```

审计 `detail` **只允许**以下字段：

```
challengeId · stage · secondaryType · riskScore · failureReason ·
tenantId · usernameHash · ipHash · requestId
```

明确禁止写入：答案、密码、完整行为轨迹（`interactionSummary`）、完整 `captchaToken`、
明文用户名。风险规则新增 `rule_captcha_token_abuse`
（`CAPTCHA_TOKEN_INVALID` / `CAPTCHA_TOKEN_REPLAYED`，300s 内 ≥ 5 次 → HIGH）。

## 9. 前端流程

登录页（`bls-admin/src/pages/user/login/index.tsx`）：

1. 打开页面请求 `GET /api/auth/captcha/config`。
2. `enabled=false` → 完全保持原登录流程。
3. `enabled=true` → 启动行为采集（`src/auth/behavior-collector.ts`，只收集统计值），
   预热一个 silent challenge。
4. 点击登录 → 若没有 Token 则 `POST /api/auth/captcha/silent/verify`。
5. 通过 → 直接拿到 `captchaToken`，用户无感。
6. 未通过 → 弹出 `components/CaptchaChallenge` 二级验证弹窗。
7. 弹窗成功后拿到 `captchaToken`。
8. 调用 `POST /api/auth/login` 并携带 `captchaToken`。
9. challenge / Token 过期：`40012` / `40013` 等错误自动重新获取并重试一次。
10. 弹窗提供刷新验证码、关闭提示、加载状态与失败反馈。
11. 弹窗宽度 `min(canvasWidth + 96, 440)` 且 `max-width: 94vw`，PC 与移动端均可用（触摸 + 鼠标 + 键盘）。

系统参数页（`bls-admin/src/pages/system/config/components/CaptchaSettingPanel.tsx`）：
新增「登录人机验证」开关与「高级配置」折叠面板，直接读写上述 9 个 `sys_config` 参数，
保存后提示“立即生效”。

## 10. 测试与验证

`bls-server/src/security/captcha/__tests__/` 覆盖：

| 文件 | 覆盖点 |
|---|---|
| `silent.test.ts` | 摘要在白名单化；自动化标识硬失败；仅鼠标 / 仅触控 / 仅键盘均可静默通过；无交互不硬失败；过快 / 规律间隔扣分；PoW |
| `captcha-service.test.ts` | 功能关闭兼容、静默通过、静默失败进入二级、always 直接二级、连续失败强制二级、nonce 篡改、风险 / 超管强制、绑定不一致、challenge 过期、slider / rotate 成功失败与**误差边界**、超过 maxAttempts、Token 过期 / 重复消费 / 账号不一致 / 域名不一致 / 跨 IP、伪造签名、并发消费只有一个成功、Redis 不可用与命令异常 fail closed、配置即时生效、TTL 无永久数据 |
| `captcha-audit.test.ts` | 审计事件类型齐全；`detail` 字段白名单；不含答案 / 密钥 / 密码 / 轨迹 / 完整 Token / 明文用户名 |
| `image.test.ts` | SVG 合法、切片范围、随机性、旋转角取值、参考标记位置 |

命令：

```bash
cd bls-server && npm run lint && npm run test && npm run build && npm run openapi
```
