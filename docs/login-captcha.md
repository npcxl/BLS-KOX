# 登录人机验证（两级：ALTCHA 静默 → Tianai 二次验证）

> 适用范围：`bls-server`（Koa 后端）+ `bls-admin`（登录页 / 系统参数页）。
> 页面级端到端记忆（含每个端点、每条校验、Redis key、审计字段、已知缺口）见
> [`bls-memory/pages/login-captcha.md`](../bls-memory/pages/login-captcha.md)。

## 1. 方案与原则

**不自研验证码。** 滑块拼图、图片裁切、鼠标轨迹识别、验证码算法一律不自己实现：

- **第一层（静默）**：集成成熟开源自托管项目 **ALTCHA**（<https://github.com/altcha-org/altcha>，
  npm 包 `altcha` v3）。服务端用 `altcha/lib` 的 `createChallenge()` / `verifySolution()`，
  前端用官方 Web Component `<altcha-widget>`（React 直接挂载，核心代码不改）。
- **第二层（显式）**：集成 **Tianai CAPTCHA** 作为**独立部署的图形验证码服务**
  （`blockPuzzle` 滑块拼图 / `clickWord` 点选文字）。Koa 只做转发与本地会话管理，
  **禁止把 Java 验证码算法复制或改写成 TypeScript**。

职责边界：

| 关注点 | 归属 |
|---|---|
| 第一层 challenge 生成、HMAC 签名、有效期 | `altcha/lib` |
| 第一层 Proof-of-Work 求解（浏览器） | 官方 `<altcha-widget>`（Web Worker） |
| 第一层 payload 服务端校验（密码学） | `altcha/lib` `verifySolution()` |
| 第二层图片生成与答案判定 | **Tianai CAPTCHA 服务**（独立部署） |
| `captchaToken`、`sessionId`、Redis、绑定、阶段判定与一次性消费 | 本项目（不是验证码算法） |

### 两级语义

| 层 | 阶段值 | 触发 | 前端组件 |
|---|---|---|---|
| 第一层 | `silent` | 始终执行 | ALTCHA `<altcha-widget display="invisible" auto="onload">`，后台解 PoW，用户无感 |
| 第二层 | `secondary` | 服务端策略命中（`mode=always`、连续失败、IP 侧风险、超管账号、UA 异常等） | `TianaiCaptcha`（`blockPuzzle` / `clickWord`），**不复用 altcha-widget** |

两层都通过后，服务端签发**一次性 `captchaToken`**，由 `POST /api/auth/login` 消费。

### ALTCHA 可见组件不是第二层（重要）

ALTCHA 的 `display="standard"` 只是「需要用户点一下的 PoW」，脚本依然可以通过，**不能**当作
图形人机验证。因此：

- 第一层的 `display` 恒为 `invisible`（代码中类型只允许 `invisible | standard`，
  `visible` 不是 ALTCHA 的合法取值，也**不映射**业务阶段）；
- 真正的第二层只有 Tianai；未配置 Tianai 时第二层 **fail closed**，绝不会退化成「ALTCHA 可见组件」。

### 已知能力边界（如实说明）

- 自托管 ALTCHA 不提供图片码 / 音频验证码生成（`altcha/lib` 没有 code challenge 生成器，
  该能力属于 ALTCHA Sentinel / Cloud），所有图片题都来自第二层 Tianai。
- 第二层依赖外部服务：未配置 `TIANAI_BASE_URL`、健康检查失败、超时或上游报错，
  一律按 `503 / 50301 CAPTCHA_SERVICE_UNAVAILABLE` **拒绝登录**（fail closed，绝不放行）。
  为避免「保存配置后全员登不进去」，系统参数页保存前会先做一次 Tianai 可用性预检。

### ⚠ 必须使用安全上下文（HTTPS / localhost）

ALTCHA v3 的 Proof-of-Work 基于 **WebCrypto（`crypto.subtle`）**，浏览器只在**安全上下文**
提供它。官方代码会直接抛错：

```
Error: Secure context (HTTPS) required.
    at verify (altcha/dist …)
```

因此用 `http://<局域网IP>:8000` 访问时**第一层根本无解**（没有开关可以绕过），登录会被卡住。
`isSecureContext === true` 的场景：

| 访问方式 | 可用 |
|---|---|
| `https://任意域名` | ✅ 生产必须如此 |
| `http://localhost:8000` / `http://127.0.0.1:8000` | ✅ 本地开发推荐 |
| `http://<局域网IP>:8000` | ❌ 报 Secure context 错误 |

前端已对该情况做**显式处理**：检测到 `window.isSecureContext === false` 且验证码开启时，
不再挂在「正在后台完成安全校验…」，而是直接提示
「当前为非安全上下文（HTTP）：浏览器不允许执行人机验证，请改用 HTTPS 或 localhost 访问」，
并禁止提交（验证码关闭时不做限制，原登录流程不受影响）。

本地联调的三种做法：

1. 用 `http://localhost:8000` 访问（最简单）；
2. 给 dev server 配 HTTPS（`@umijs/max` dev 支持 `https: {}`）；
3. Chrome 临时把该源标记为安全：`chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   填入 `http://192.168.x.x:8000`（仅调试用，生产环境必须 HTTPS）。

## 2. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/captcha/config` | 公开配置 + **服务端判定**的 `requiredStage` |
| GET | `/api/auth/captcha/challenge` | 第一层 ALTCHA challenge（**官方结构原样返回**，无 `{code,...}` 包装，供 widget 直接消费） |
| POST | `/api/auth/captcha/verify` | 第一层校验 → 一次性 `captchaToken` |
| POST | `/api/auth/captcha/secondary/challenge` | 第二层 challenge（Tianai）+ 本地一次性 `sessionId` |
| POST | `/api/auth/captcha/secondary/verify` | 第二层校验 → 一次性 `captchaToken` |

全部为公共接口（无 `jwtAuth`），统一 `Cache-Control: no-store`。

```json
// GET /config 的 data
{
  "enabled": true, "mode": "adaptive",
  "primaryProvider": "altcha", "secondaryProvider": "tianai", "secondaryType": "blockPuzzle",
  "requiredStage": "silent",
  "challengeUrl": "/api/auth/captcha/challenge",
  "secondaryChallengeUrl": "/api/auth/captcha/secondary/challenge",
  "fieldName": "altchaPayload"
}

// 通过
{ "passed": true, "stage": "silent", "captchaToken": "<one-shot>", "expiresAt": 1700000000000 }
// 需要第二层
{ "passed": false, "reason": "SECONDARY_REQUIRED", "requiredStage": "secondary", "message": "需要完成额外安全验证" }
// 失败
{ "passed": false, "reason": "SOLUTION_INVALID" }
```

**不下发**阈值（`forceAfterFailures` / `cost`）、失败计数与内部风控原因；原因只写安全审计。

## 2.1 排障：登录报 `50301 CAPTCHA_SERVICE_UNAVAILABLE`

50301 只有两个来源，先看**是哪个请求**返回的（浏览器 Network）：

| 返回 50301 的请求 | 原因 | 处理 |
|---|---|---|
| `POST /api/auth/captcha/secondary/challenge`（或 `/secondary/verify`） | **策略要求第二层，但 Tianai 不可用**：`TIANAI_BASE_URL` 为空、服务不可达、超时、上游报错；或 `secondaryProvider` 被设成非 `tianai`（altcha 不提供图形验证码） | 部署 Tianai 并配置 `TIANAI_BASE_URL`；或临时把 `sys.login.captcha.mode` 设为 `off`（或 `enabled=false`） |
| `POST /api/auth/login` | **Redis 不可用**（`captcha:token:*` 消费失败即 fail closed） | 检查 Redis 连通性 / `REDIS_ENABLED`；恢复前所有登录都会被拒绝（设计如此） |

为什么"输完密码"才报错：用户名稳定后前端会带 `username` 重新拉策略，服务端一旦判定需要第二层
（`mode=always`、同账号连续失败 ≥ `forceAfterFailures`、IP 多账号、IP 高风险、超管账号、UA 异常），
就会立刻请求第二层 challenge；此时若 Tianai 未部署 → 50301，且**不会**签发 token，登录按钮保持禁用。

快速确认：

```bash
# 1) 该账号当前需要哪一层？（silent = 正常；secondary = 命中策略）
curl -s 'http://localhost:6001/api/auth/captcha/config?username=你的账号'
# 2) 服务端日志（新增）会直接说明原因与处理建议
#    [captcha] secondary provider unavailable, login will fail closed { hint: '设置 TIANAI_BASE_URL …' }
# 3) 连续失败计数（TTL 900s，到期自动恢复）
redis-cli --scan --pattern 'captcha:fail:*'
```

恢复方式（任选其一）：

1. **部署 Tianai** 并设置 `TIANAI_BASE_URL`（唯一"开着验证码还能登录"的正解）；
2. 临时把 `sys.login.captcha.mode` 改为 `off`（或 `enabled=false`）——系统参数页可改，立即生效；
3. 清掉失败计数 `redis-cli DEL captcha:fail:account:<tenantId>:<usernameHash>`（或等 15 分钟自动过期）。

> 服务器启动时会检查 `TIANAI_BASE_URL`：缺失即打印显著告警，避免"配了验证码却没人能登录"排查半天。

## 3. 谁决定什么（字段归属）

| 字段 | 决定方 | 说明 |
|---|---|---|
| `stage` | **服务端** | 第一层只能来自 HMAC 签名保护的 `challenge.parameters.data.stage`（必须为 `silent`），第二层来自被消费的本地会话 |
| token 中的 `provider` / `secondaryType` | **服务端** | 签发时按 `primaryProvider` / `secondaryProvider` 写入 |
| `requiredStage` | **服务端** | 由 `evaluateCaptchaPolicy()` 依据账号失败、IP 多账号、IP 风险、限流压力、超管账号、UA 异常与 `mode` 判定 |
| challenge `nonce` / `signature` / `expiresAt` / `data` | **服务端**（ALTCHA HMAC 签名） | 客户端不可篡改 |
| 第二层 `sessionId` / `upstreamId` / 绑定 / TTL | **服务端** | 24 字节随机 id，绑定租户 / 域名 / 账号 / IP / UA |
| `captchaToken` 与其 TTL | **服务端** | 32 随机字节，Redis 只存 `sha256` |
| `username` | 客户端 | 服务端做 hash，用于绑定与策略判定；不落原文 |
| `payload`（第一层） | 客户端 | 官方 widget 产出的 base64 JSON |
| `sessionId` + `data`（第二层） | 客户端 | `data` 是答案（坐标 / 点选位置），不含身份字段 |
| 请求体里的 `stage` / `display` / `provider` | — | **一律忽略**：提交 `stage=visible\|secondary` 不会产生任何效果 |

服务端强制的不变量：

1. 第一层先完成完整校验（过期 → 签名 → PoW），之后才读取签名内的 `data`；`stage !== 'silent'`
   → `STAGE_MISMATCH`。
2. 签名内的 `tenantId` / `usernameHash` 必须与当前请求一致（`BINDING_MISMATCH`），
   用户 A 解出的 challenge 不能给用户 B 用。
3. challenge `nonce` 签发时 `SET NX EX` 登记，校验时 `GETDEL` 原子消费：一次解答只能用一次。
4. **策略要求第二层时，第一层绝不签发 Token**，只返回 `requiredStage: "secondary"`。
5. 第二层会话 `GETDEL` 一次性消费，并重新校验绑定与 `expiresAt`。
6. `captchaToken` 一次性：`SET NX EX` 标记 + `GETDEL`，并发 `/login` 只有一个成功。

## 4. 配置

| 参数 | 类型 | 取值 / 范围 | 默认 |
|---|---|---|---|
| `sys.login.captcha.enabled` | bool | — | `true` |
| `sys.login.captcha.mode` | enum | `off` / `adaptive` / `always` | `adaptive` |
| `sys.login.captcha.primaryProvider` | enum | `altcha` / `tianai` | `altcha` |
| `sys.login.captcha.secondaryProvider` | enum | `altcha` / `tianai` | `tianai` |
| `sys.login.captcha.secondaryType` | enum | `blockPuzzle` / `clickWord` | `blockPuzzle` |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `180` |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `120` |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `3` |

环境变量：`ALTCHA_HMAC_KEY`（生产必填、≥32 位）、`ALTCHA_COST`、`TIANAI_BASE_URL`、
`CAPTCHA_DEV_BYPASS`（仅开发环境；生产出现即拒绝启动）。

- 参数通过 **Dynamic Config**（Redis 缓存 60s）读取，写入后立即失效缓存；
- 非法值严格回退默认值并告警，不会打挂登录页；
- 系统参数页通过 **`POST /api/system/config/batch`**（单事务、`system:config:edit`）保存，
  保存前会合并「库中现值 + 本次变更」，若生效配置启用了 Tianai 第二层则先做健康检查，
  不可用直接拒绝保存（避免把登录锁死）。

## 5. 前端流程

状态机：`bls-admin/src/hooks/useLoginCaptcha.ts` +
`bls-admin/src/pages/user/login/captcha-machine.ts`（纯 reducer，便于单测）：

```
loadingConfig → waitingUsername → solvingSilent → ready → submitting
                      ↘ secondaryRequired → solvingSecondary ↗
                      ↘ error（配置加载失败 → 禁止提交）
```

1. 挂载即读 `/captcha/config`；**配置未返回或加载失败时禁止提交**（不会默认「未开启」放行）。
2. 用户名稳定 400ms 后再按用户名刷新策略，并以 `?username=` 重新挂载 ALTCHA widget。
3. 第一层 payload 只提交一次（`verifyingRef` 防重复回调），提交后立即丢弃，不保存 payload。
4. 返回 `requiredStage: "secondary"` → 渲染 `TianaiCaptcha`，答案错误会重新获取 challenge
   （本地会话已被服务端消费）。
5. `expiresAt` 到点自动失效并重新验证。
6. **每次 `/login`（无论成败）都在 finally 清空本地 `captchaToken`**：服务端已消费，
   重试必须重新验证；验证码被拒（40010-40013）只提示，**不自动补发登录**。
7. 密码错误后重新拉取策略，达到阈值时下一次提交会出现第二层验证。

## 6. 部署第二层（Tianai CAPTCHA）

**仓库里没有第二层服务本体**：Koa 只做转发（`providers/tianai-provider.ts`），图形验证码由
**独立部署的 Tianai CAPTCHA 服务**提供。所以"第二层不成功"绝大多数情况是：① `TIANAI_BASE_URL`
没配；② 服务没起/端口不通；③ 上游接口契约与我们的 adapter 不一致。

### 6.1 需要满足的接口契约（三选一，满足即可）

| 方法 | 路径（可用环境变量覆盖） | 请求 | 期望响应 |
|---|---|---|---|
| GET | `/gen?type=blockPuzzle\|clickWord` | — | JSON，含 `id`（或 `challengeId` / `token`）+ 图片字段；允许裸对象或 `{data:{…}}` 包裹 |
| POST | `/check` | `{ id, data }`（`data` = 前端答案，如 `{x,y}` 或 `{points:[[x,y]]}`） | 通过：`{valid:true}` / `{success:true}` / `{passed:true}` / `{data:true}` / `{code:200}`；不通过：其余 |
| GET | `/health` | — | 任意 HTTP < 500 视为"服务可达"（保存配置时的预检用它） |

路径不一致时用 `TIANAI_GEN_PATH` / `TIANAI_CHECK_PATH` / `TIANAI_HEALTH_PATH` 覆盖，
**不要**为了适配路径去改代码。

### 6.2 方式 A：部署 tianai-captcha（Java，推荐）

上游项目：[`dromara/tianai-captcha`](https://gitee.com/dromara/tianai-captcha)（GitHub 同名镜像）。
用 `tianai-captcha-springboot-starter` 起一个**最小独立服务**，把上面的三个接口暴露出来：

```java
// 仅作示意：类名/方法名随 tianai-captcha 版本略有差异，请对照你引入的版本调整
@RestController
public class CaptchaBridgeController {

  @Autowired private ImageCaptchaApplication app;   // starter 自动装配

  @GetMapping("/health")
  public Map<String, Object> health() { return Map.of("status", "ok"); }

  @GetMapping("/gen")
  public Map<String, Object> gen(@RequestParam(defaultValue = "blockPuzzle") String type) {
    ImageCaptchaVO vo = app.generateCaptcha(type);   // type: blockPuzzle / clickWord
    Map<String, Object> data = new HashMap<>();
    data.put("id", vo.getId());
    data.put("backgroundImage", vo.getBackgroundImage());
    data.put("sliderImage", vo.getSliderImage());
    data.put("width", vo.getBackgroundImageWidth());
    data.put("height", vo.getBackgroundImageHeight());
    data.put("y", vo.getRandomY());
    data.put("wordCount", 2);                        // clickWord 用
    return Map.of("code", 200, "data", data);
  }

  @PostMapping("/check")
  public Map<String, Object> check(@RequestBody Map<String, Object> body) {
    ApiResponse<?> res = app.matching(String.valueOf(body.get("id")), body.get("data"));
    return Map.of("code", 200, "valid", res.isSuccess());
  }
}
```

启动与接线：

```bash
# 1) 构建（需要能访问 Maven 仓库；离线环境用私服或预下载的 jar）
mvn -q package
java -jar target/tianai-captcha-bridge-*.jar --server.port=9527

# 2) 自检（三条都必须符合 6.1 的期望响应）
curl -s http://127.0.0.1:9527/health
curl -s 'http://127.0.0.1:9527/gen?type=blockPuzzle'
curl -s -X POST http://127.0.0.1:9527/check -H 'Content-Type: application/json' -d '{"id":"<上一步的id>","data":{"x":1,"y":1}}'

# 3) 配置 Koa 后端（bls-server/.env）并重启
TIANAI_BASE_URL=http://127.0.0.1:9527

# 4) 系统参数页：mode=adaptive/always、secondaryProvider=tianai、secondaryType=blockPuzzle
#    保存时会自动做 /health 预检，不可用直接拒绝保存
```

> 若该服务与本项目同机部署，建议只监听 `127.0.0.1`（不要暴露到公网）；
> Koa 是**服务端**调用它，因此不受浏览器 CORS 影响。

### 6.3 方式 B：已有 Tianai（或兼容）服务

只要满足 7.1 的契约：直接填 `TIANAI_BASE_URL`（必要时加三个路径覆盖），无需部署步骤 A。
若上游需要鉴权头/自定义前缀，改 `providers/tianai-provider.ts` 的请求构造（保持三个方法契约不变）。

### 6.4 常见「部署不成功」对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动日志 `TIANAI_BASE_URL 未配置…将 fail closed` | 没配环境变量（**你现在的情况**） | 配好 `TIANAI_BASE_URL` 后重启；暂不部署就先 `mode=off` |
| `/secondary/challenge` 返回 50301 | 服务未启动 / 端口不通 / `/gen` 不是 2xx / 返回里没有 `id` | `curl` 7.2 的三条自检；确认路径是否需要覆盖 |
| `/secondary/verify` 返回 50301 | `/check` 超时或 5xx | 同上；注意 5xx 视为"服务不可用"而不是"答案错误" |
| 前端弹「验证码加载失败」但接口 200 | 图片字段名不匹配 | 对照 `TianaiCaptcha` 顶部 `BG_FIELDS` / `PIECE_FIELDS` / `WIDTH_FIELDS` / `Y_FIELDS` 增补字段名 |
| 保存系统参数被拒：「Tianai 验证码服务当前不可用」 | `/health` 返回 5xx 或不可达 | 修好服务再保存（这是防止"保存后全员登不进去"的保护） |
| 超管/连续失败账号登不进去且无法进后台改配置 | 第二层不可用 + 策略要求第二层 = fail closed（设计如此） | 用 SQL 临时 `mode=off` 解锁（见 2.1），或先部署第二层再启用 |

### 6.5 上线顺序建议

1. 先部署并自检第二层服务（6.2/6.3）；
2. 配 `TIANAI_BASE_URL` 重启 Koa，确认启动日志不再告警；
3. 系统参数页把 `mode` 从 `off` 调回 `adaptive`（保存时会自动预检）；
4. 用非超管账号验证一次 `silent` 路径，再用超管账号（或连续失败触发）验证 `secondary` 路径。

## 7. 测试

- 后端：`bls-server/src/security/captcha/__tests__/`（服务端行为 + 审计负载）、
  `src/api/system/config/__tests__/batch.test.ts`（保存前 Tianai 预检）；
  覆盖**伪造 stage 无效**、跨账号 challenge、Token 一次性与并发、公开配置不泄露内部原因、
  完整 silent → Tianai secondary → 登录 消费链路、Tianai 未配置/超时/错误全部 fail closed。
- 前端：`bls-admin` 的 `captcha-machine.test.ts`（状态机不变式）、
  `hooks/__tests__/useLoginCaptcha.test.tsx`（配置门槛、单飞校验、用户名变化失效、二级流程）、
  `pages/user/login/index.test.tsx`（页面级：未加载/加载失败禁止提交、带 token 提交、失败后不自动重发）。
