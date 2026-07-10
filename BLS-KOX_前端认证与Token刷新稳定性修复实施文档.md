# BLS-KOX 前端认证与 Token 刷新稳定性修复实施文档

> 项目：BLS-KOX  
> 仓库：npcxl/BLS-KOX  
> 当前默认分支最新检查基线：`cd30e404a9416219c8d46d49cda0f08e5046f448`  
> 项目方向：开源后台开发框架 / 管理系统模板  
> 本文范围：只处理前端认证、Token Refresh、页面初始化、字典缓存、请求重试与登录态恢复问题。

---

# 1. 问题背景

当前用户现象：

```text
登录后正常使用
↓
长时间不操作
↓
Access Token 过期
↓
刷新浏览器
↓
页面出现：
- 列表空数据
- 字典空
- 系统配置缺失
- 主题配置异常
- 菜单或用户状态异常
- 再刷新一次偶尔恢复
```

根据当前代码，问题不是单点故障，而是以下链路组合：

```text
Access Token 过期
+
页面启动时立即并发请求
+
部分初始化请求 skipErrorHandler
+
Refresh Token 逻辑放在 errorHandler
+
鉴权配置失败后 fallback public data
+
部分业务状态将异常结果转为空数组
+
空数组被缓存
```

最终造成“页面没有完全掉登录，但数据状态不完整”的半登录态。

---

# 2. 当前代码关键问题总结

| 编号 | 问题 | 优先级 |
|---|---|---|
| FE-AUTH-01 | 初始化请求 `skipErrorHandler=true` 绕过 Refresh | P0 |
| FE-AUTH-02 | App Bootstrap 没有先恢复 Session | P0 |
| FE-AUTH-03 | Refresh 放在 errorHandler 而不是统一认证请求层 | P0 |
| FE-AUTH-04 | 多个首屏请求并发撞 401，产生竞态 | P0 |
| FE-AUTH-05 | Auth Settings 失败后静默 fallback Public Settings | P1 |
| FE-DICT-01 | 字典空结果缓存缺少成功状态校验 | P1 |
| FE-AUTH-06 | Refresh 失败与 Session Invalid 状态处理混杂 | P1 |
| FE-AUTH-07 | 40101 被统一解释为“账号在别处登录” | P1 |
| FE-API-01 | 生产 `baseURL` 存在模板 Demo API 遗留风险 | P0 |
| FE-CACHE-01 | currentUser / dict / system config 缺少统一登录态切换清理 | P1 |
| FE-TEST-01 | 缺少 Refresh 并发和页面恢复测试 | P0 |

---

# 3. 当前真实故障链路

当前 Access Token 默认 15 分钟，Refresh Token 默认 7 天。

典型链路：

```text
T0 登录成功
Access Token = 15m
Refresh Token = 7d

T+30m 用户重新打开页面
↓
浏览器仍有 token 和 refreshToken
↓
getInitialState()
↓
fetchInitialSettings()
↓
Promise.all([
  themeCurrent(),
  systemCurrent()
])
↓
两个请求携带过期 Access Token
↓
401
↓
因为传了 skipErrorHandler=true
↓
不执行 refreshAccessToken()
↓
Promise.all reject
↓
catch
↓
fallback public settings
↓
页面拿到公共配置，不是当前用户私有配置
↓
fetchUserInfo()
↓
同样 skipErrorHandler=true
↓
401
↓
直接跳登录或返回 undefined
```

与此同时页面组件可能已经开始请求：

```text
字典
列表
权限
全局搜索
WebSocket
其他组件数据
```

普通请求可能触发 Refresh Token：

```text
普通请求 401
↓
refreshAccessToken()
↓
刷新成功
↓
新 Token 保存
```

但是前面初始化请求已经失败或 fallback。

最终状态：

```text
Token 已更新
但是 InitialState 已错误
Public Settings 已写入
currentUser 为空
字典可能是空
页面组件已经完成第一次空数据渲染
```

这就是当前最符合用户现象的原因。

---

# 4. FE-AUTH-01：禁止初始化请求绕过 Refresh

优先级：

```text
P0
```

当前存在：

```ts
queryCurrentUser({
  skipErrorHandler: true,
})
```

以及：

```ts
themeCurrent({
  skipErrorHandler: true,
})

systemCurrent({
  skipErrorHandler: true,
})
```

这些接口属于：

```text
Authenticated Bootstrap Requests
```

不应该跳过 Refresh Token 流程。

需要区分：

```text
skipMessage
```

和：

```text
skipAuthRefresh
```

不要继续使用一个：

```text
skipErrorHandler
```

同时表达：

```text
不弹错误提示
+
不刷新 Token
```

这两个完全不同的意图。

推荐请求扩展参数：

```ts
type AuthRequestOptions = {
  skipErrorMessage?: boolean;
  skipAuthRefresh?: boolean;
  authRequired?: boolean;
};
```

规则：

```text
skipErrorMessage=true
只是不显示 message
仍然允许 Refresh

skipAuthRefresh=true
只有 login / refresh / public endpoint 使用

authRequired=true
必须等待 Session Bootstrap
```

需要修改：

```text
bls-admin/src/requestErrorConfig.ts
bls-admin/src/app.tsx
bls-admin/src/services/ant-design-pro/api.ts
```

---

# 5. FE-AUTH-02：增加统一 Auth Bootstrap

优先级：

```text
P0
```

当前问题：

```text
业务初始化
早于
Session 恢复
```

必须调整成：

```text
Application Start
↓
Auth Bootstrap
↓
Session Ready
↓
Initial Data Bootstrap
↓
Render Protected App
```

推荐新增：

```text
bls-admin/src/auth/auth-manager.ts
```

或：

```text
bls-admin/src/services/auth/session.ts
```

核心接口：

```ts
export type AuthState =
  | 'anonymous'
  | 'valid'
  | 'refreshing'
  | 'expired';

export async function ensureValidSession(): Promise<AuthState>;
```

推荐逻辑：

```ts
export async function ensureValidSession(): Promise<AuthState> {
  const accessToken = tokenStore.getAccessToken();
  const refreshToken = tokenStore.getRefreshToken();

  if (!accessToken && !refreshToken) {
    return 'anonymous';
  }

  if (accessToken && !isJwtExpired(accessToken)) {
    return 'valid';
  }

  if (!refreshToken) {
    return 'expired';
  }

  const refreshed = await refreshSession();

  return refreshed ? 'valid' : 'expired';
}
```

应用启动：

```ts
export async function getInitialState() {
  if (isPublicRoute(history.location.pathname)) {
    return loadPublicInitialState();
  }

  const authState = await ensureValidSession();

  if (authState !== 'valid') {
    redirectToLogin();
    return createEmptyInitialState();
  }

  const [
    currentUser,
    authSettings,
  ] = await Promise.all([
    fetchUserInfo(),
    fetchAuthSettings(),
  ]);

  return buildInitialState({
    currentUser,
    authSettings,
  });
}
```

关键原则：

```text
Session 未 Ready
禁止加载 Protected Bootstrap Data
```

---

# 6. FE-AUTH-03：重构 Refresh Token 到统一认证请求层

优先级：

```text
P0
```

当前 Refresh Token 在：

```text
errorConfig.errorHandler
```

中执行。

不推荐继续这样设计。

原因：

```text
errorHandler
应该负责：
- 展示错误
- 日志
- 用户反馈

Auth Retry
应该负责：
- 401 检测
- Single Flight Refresh
- Token Rotation
- 原请求 Retry
- Refresh Failure Logout
```

必须拆分。

推荐结构：

```text
requestInterceptors
    ↓
attach Access Token
    ↓
request
    ↓
response/auth interceptor
    ↓
401?
 ┌──No──→ return response
 │
 Yes
 ↓
shouldRefresh?
 ↓
refreshSingleFlight()
 ↓
update token pair
 ↓
retry original request once
 ↓
return retry response
```

建议新增：

```text
bls-admin/src/auth/token-store.ts
bls-admin/src/auth/refresh-manager.ts
bls-admin/src/auth/auth-request.ts
```

---

# 7. Single Flight Refresh 设计

当前代码已经有：

```ts
let refreshingPromise: Promise<string | null> | null = null;
```

这个方向是正确的，需要保留并升级。

推荐：

```ts
let refreshPromise: Promise<TokenPair> | null = null;

export async function refreshSession(): Promise<TokenPair | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefresh()
    .then((pair) => {
      tokenStore.setTokenPair(pair);
      return pair;
    })
    .catch(() => {
      tokenStore.clear();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
```

硬性要求：

```text
同时 20 个接口 401
↓
只能有 1 个 /auth/refresh
↓
其他 19 个等待同一个 Promise
↓
Refresh 成功后 20 个请求各重试一次
```

禁止：

```text
20 个 401
↓
20 个 Refresh
```

因为后端 Refresh Token Rotation 会把旧 Token 标记为已使用。

并发 Refresh 会触发：

```text
Refresh Reuse Detection
↓
revokeAll()
```

因此前端 Single Flight 对这个项目不是优化项，而是认证正确性要求。

---

# 8. Token Pair 必须原子更新

优先级：

```text
P0
```

当前分别：

```ts
localStorage.setItem('token', ...)
localStorage.setItem('refreshToken', ...)
```

虽然浏览器单线程下问题概率较低，但 Refresh Rotation 场景建议统一 Token Store。

新增：

```text
bls-admin/src/auth/token-store.ts
```

示例：

```ts
export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refreshToken';

export const tokenStore = {
  getAccessToken() {
    return localStorage.getItem(ACCESS_KEY);
  },

  getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  },

  setTokenPair(pair: TokenPair) {
    localStorage.setItem(ACCESS_KEY, pair.accessToken);
    localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  },

  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('currentUser');
  },
};
```

所有代码禁止直接：

```text
localStorage.getItem('token')
localStorage.setItem('token')
```

应统一经过 Token Store。

开源项目角度这样更易维护。

---

# 9. FE-AUTH-04：页面初始化禁止多路独立撞 401

优先级：

```text
P0
```

应用启动应形成单一阶段：

```text
Phase 1
Auth Bootstrap

Phase 2
User Bootstrap

Phase 3
Settings Bootstrap

Phase 4
Protected App Render
```

推荐：

```ts
const authState = await ensureValidSession();

if (authState === 'valid') {
  const [user, settings] = await Promise.all([
    queryCurrentUser(),
    fetchAuthSettings(),
  ]);
}
```

不要：

```text
Theme 自己请求
System Config 自己请求
Profile 自己请求
Menu 自己请求
Dict 自己请求
```

全部在 Access Token 过期状态下同时启动。

---

# 10. FE-AUTH-05：Auth Settings 失败不要静默 fallback Public

优先级：

```text
P1
```

当前逻辑：

```text
fetchAuthSettings()
↓
失败
↓
fetchPublicSettings()
```

这会隐藏认证异常。

建议区分错误类型：

```text
401
→ Refresh / Login

403
→ Permission Error

5xx
→ Settings Load Error

Network Error
→ Retry / Offline UI

Public Route
→ Public Settings
```

只有公开页面：

```text
/user/login
/user/register
```

可以直接加载 Public Settings。

Protected Route 不应该：

```text
Auth Settings 失败
↓
自动 Public Settings
```

否则容易产生：

```text
页面看起来能打开
但当前租户配置丢失
```

推荐：

```ts
if (isPublicRoute(pathname)) {
  return fetchPublicSettings();
}

return fetchAuthSettings();
```

Auth Settings 失败应向上抛出，由 Bootstrap 层处理。

---

# 11. FE-DICT-01：修复字典缓存

优先级：

```text
P1
```

当前：

```ts
const data = res.data ?? [];
dictCache.set(dictType, data);
```

存在风险：

```text
响应结构异常
↓
undefined
↓
转 []
↓
写入 Cache
↓
后续一直返回 []
```

建议严格校验。

```ts
export async function fetchDictData(
  dictType: string,
): Promise<DictDataItem[]> {
  const cached = dictCache.get(dictType);

  if (cached) {
    return cached;
  }

  const res = await request<{
    code: number;
    data: DictDataItem[];
  }>('/api/system/dict/data/type', {
    method: 'GET',
    params: { dictType },
  });

  if (res.code !== 200) {
    throw new Error(`Dict request failed: ${dictType}`);
  }

  if (!Array.isArray(res.data)) {
    throw new Error(`Invalid dict response: ${dictType}`);
  }

  dictCache.set(dictType, res.data);

  return res.data;
}
```

注意：

```text
真实成功 + []
允许缓存

请求失败
禁止缓存

结构错误
禁止缓存
```

---

# 12. 字典请求增加 Promise 去重

当前同一页面多个组件可能同时请求同一字典：

```text
Component A → dict status
Component B → dict status
Component C → dict status
```

Map 只有完成后才写入，因此可能产生 3 个并发请求。

建议增加：

```ts
const dictCache = new Map<string, DictDataItem[]>();
const dictPending = new Map<string, Promise<DictDataItem[]>>();
```

逻辑：

```ts
if (dictCache.has(type)) return cache;

if (dictPending.has(type)) {
  return dictPending.get(type)!;
}

const promise = requestDict(type)
  .then((data) => {
    dictCache.set(type, data);
    return data;
  })
  .finally(() => {
    dictPending.delete(type);
  });

dictPending.set(type, promise);

return promise;
```

---

# 13. 登录态变化必须清理作用域缓存

优先级：

```text
P1
```

以下事件：

```text
logout
tenant switch
user switch
refresh failure
session revoked
```

必须统一执行：

```text
tokenStore.clear()
clearDictCache()
clearSettingsCache()
clearUserCache()
closeWebSocket()
resetInitialState()
```

建议新增：

```text
resetClientSession()
```

统一处理。

不要每个模块自己清一部分。

---

# 14. FE-AUTH-06：明确认证错误状态机

当前前端主要根据：

```text
HTTP 401
Business code 40101
```

处理。

建议定义：

```ts
enum AuthFailureReason {
  ACCESS_EXPIRED = 'ACCESS_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  REFRESH_EXPIRED = 'REFRESH_EXPIRED',
  REFRESH_REUSE = 'REFRESH_REUSE',
  USER_DISABLED = 'USER_DISABLED',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
}
```

如果暂时不改后端协议，前端至少封装：

```ts
function resolveAuthFailure(error): AuthFailureReason
```

避免：

```text
errorHandler 中大量 if
```

---

# 15. FE-AUTH-07：不要把所有 40101 都解释为异地登录

优先级：

```text
P1
```

当前前端：

```text
40101
→ Modal:
该账号在别处登录
```

这是过度推断。

Session Invalid 可能来自：

```text
管理员踢下线
密码修改 revokeAll
用户被禁用
multiLogin=false 新登录
Redis Session 被清理
Session 手动吊销
```

建议用户提示改成：

```text
当前会话已失效，请重新登录。
```

只有后端明确返回：

```text
SESSION_REPLACED
```

时再显示：

```text
该账号已在其他设备登录
```

---

# 16. Refresh 请求本身的特殊规则

Refresh 请求：

```text
POST /api/auth/refresh
```

必须：

```text
不触发 Refresh Retry
不递归刷新
不参与普通 401 重试
```

请求层判断：

```ts
function isRefreshRequest(url: string) {
  return url.includes('/api/auth/refresh');
}
```

规则：

```text
普通 API 401
→ refresh

Refresh API 401
→ clear session
→ login
```

---

# 17. 原请求最多 Retry 一次

推荐标记：

```ts
_authRetried?: boolean;
```

流程：

```text
Request
↓
401
↓
_authRetried=false
↓
Refresh
↓
Retry
↓
仍然 401
↓
不再次 Refresh
↓
Logout
```

禁止无限循环。

---

# 18. 页面数据请求错误不应自动转换为空数据

对列表请求统一约定：

错误时：

```text
保持旧数据
+
展示 Error State
```

不要：

```text
catch
↓
return []
```

建议页面状态：

```ts
type LoadState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'success'; data: T }
  | { status: 'error'; data?: T; error: Error };
```

开源项目不需要所有页面一次性改造，但：

```text
字典
权限
菜单
InitialState
系统配置
```

这些核心状态必须避免错误转空。

---

# 19. WebSocket 与 Token Refresh

需要检查 GlobalRealtimeProvider。

建议规则：

```text
WebSocket 建立
↓
发送当前 Access Token
↓
Token Refresh 成功
↓
如果 WS 协议认证状态依赖旧 Token：
重新认证或重连
```

建议 Refresh Manager 提供事件：

```ts
authEvents.emit('token-refreshed', tokenPair);
```

WebSocket Provider：

```ts
authEvents.on('token-refreshed', () => {
  reconnect();
});
```

Logout：

```ts
authEvents.on('logout', () => {
  closeSocket();
});
```

防止：

```text
HTTP 已刷新 Token
但 WebSocket 仍保持旧认证状态
```

---

# 20. API Base URL 修复

优先级：

```text
P0
```

当前发现生产配置存在模板地址风险：

```text
https://pro-api.ant-design-demo.workers.dev
```

必须改成：

方案 A，同源反代：

```ts
baseURL: ''
```

方案 B，环境变量：

```ts
baseURL: process.env.API_BASE_URL ?? ''
```

推荐开源项目：

```text
开发环境：
Umi Proxy

生产环境：
Nginx 同源 /api 反代

Frontend Request:
baseURL=''
```

这样最简单。

---

# 21. 推荐前端认证目录

建议：

```text
bls-admin/src/auth/
├── auth-manager.ts
├── auth-events.ts
├── refresh-manager.ts
├── token-store.ts
├── jwt.ts
└── auth-types.ts
```

职责：

```text
token-store.ts
Token Storage

jwt.ts
JWT exp decode

refresh-manager.ts
Single Flight Refresh

auth-manager.ts
ensureValidSession / logout / reset

auth-events.ts
Token Refresh / Logout Event

auth-types.ts
Types
```

---

# 22. 推荐完整请求流程

```text
UI
↓
request()
↓
Request Interceptor
  - attach token
  - X-Timestamp
  - X-Nonce
↓
API
↓
Response
↓
200
→ return

401
↓
是否 login/refresh/public?
Yes
→ reject

No
↓
original._authRetried?
Yes
→ reset session + login

No
↓
await refreshSingleFlight()
↓
失败
→ reset session + login

成功
↓
original._authRetried=true
update Authorization
retry original request
↓
return retry result
```

---

# 23. App Bootstrap 推荐流程

```text
Browser Refresh
↓
getInitialState
↓
isPublicRoute?
├─ Yes
│  ↓
│  public settings
│  ↓
│  render login
│
└─ No
   ↓
   ensureValidSession()
   ↓
   valid?
   ├─ No → reset + login
   └─ Yes
      ↓
      Promise.all
      ├─ profile
      └─ auth settings
      ↓
      build initialState
      ↓
      render protected app
```

字典和页面业务数据：

```text
必须在 Protected App Render 之后请求
```

---

# 24. 后端配合修复

虽然本文重点是前端，但 Token Refresh 需要后端语义统一。

建议：

```text
Refresh Token Invalid
HTTP 401
body code 401xx

Refresh Token Expired
HTTP 401
明确 code

Refresh Reuse
HTTP 401
明确 code

User Disabled
HTTP 403 或 401
明确 code

Session Revoked
HTTP 401
明确 code
```

不要仅返回：

```text
HTTP 200
body.code=401
```

前端请求层应该优先依赖 HTTP Status。

---

# 25. 必须增加的测试

## FE-TEST-01：Single Flight

模拟：

```text
10 个 API 同时 401
```

断言：

```text
/auth/refresh 只调用 1 次
10 个请求均 Retry
10 个请求最终成功
```

---

## FE-TEST-02：Refresh Rotation

模拟：

```text
旧 RT
↓
Refresh Success
↓
new AT + new RT
```

断言：

```text
Token Store 同时保存新 Pair
后续请求使用新 AT
下一次 Refresh 使用新 RT
```

---

## FE-TEST-03：Refresh Failure

模拟：

```text
Access Token expired
Refresh Token expired
```

断言：

```text
Token Store clear
Dict Cache clear
currentUser clear
redirect login
不出现死循环
```

---

## FE-TEST-04：App Bootstrap

模拟：

```text
Access expired
Refresh valid
```

顺序必须是：

```text
refresh
↓
profile
theme current
system current
```

禁止：

```text
theme/system 先 401
然后 refresh
```

---

## FE-TEST-05：Dict Cache

覆盖：

```text
success data
→ cache

success []
→ cache []

request reject
→ no cache

invalid response
→ no cache

same dict concurrent
→ one network request
```

---

## FE-TEST-06：Retry Once

模拟：

```text
API 401
Refresh success
Retry API still 401
```

断言：

```text
只 Refresh 1 次
然后 Logout
```

---

# 26. 修复文件清单

重点文件：

```text
bls-admin/src/requestErrorConfig.ts
bls-admin/src/app.tsx
bls-admin/src/services/ant-design-pro/api.ts
bls-admin/src/services/system/dict.ts
```

建议新增：

```text
bls-admin/src/auth/token-store.ts
bls-admin/src/auth/refresh-manager.ts
bls-admin/src/auth/auth-manager.ts
bls-admin/src/auth/auth-events.ts
bls-admin/src/auth/jwt.ts
```

建议测试：

```text
bls-admin/src/auth/__tests__/refresh-manager.test.ts
bls-admin/src/auth/__tests__/auth-manager.test.ts
bls-admin/src/services/system/__tests__/dict.test.ts
bls-admin/src/__tests__/app-bootstrap.test.ts
```

---

# 27. Codex 执行要求

将下面内容交给 Codex：

```text
请基于当前 master 最新提交修复前端认证稳定性问题。

只处理：
- Token Refresh
- Auth Bootstrap
- 401 Retry
- 字典缓存
- 登录态清理
- API baseURL
- 相关测试

不要修改 P6 Queue/Worker。
不要顺手重构无关页面。

目标场景：

用户超过 Access Token 有效期后，
刷新浏览器页面，
必须自动使用 Refresh Token 恢复登录，
然后正常加载 Profile、Theme、System Config、Dict 和页面数据。

禁止出现：
- 页面空数据
- 字典空
- Public Settings 错误 fallback
- 多个 Refresh 并发
- Refresh Rotation Reuse Detection 误触发
- 无限 Retry
- 半登录态

执行顺序：

1. 新增 token-store。
2. 新增 refresh-manager Single Flight。
3. 新增 auth-manager ensureValidSession。
4. 重构 request 401 retry。
5. 移除 Auth Bootstrap 接口对 Refresh 的绕过。
6. 重构 getInitialState 顺序。
7. 修复 Auth Settings silent fallback。
8. 修复 Dict Cache。
9. 增加缓存统一清理。
10. 修复生产 baseURL。
11. 增加测试。

必须验证：

A.
Access Token expired
Refresh valid
F5
→ 自动恢复
→ 页面正常

B.
10 请求同时 401
→ 1 refresh

C.
Refresh expired
→ 清理登录态
→ 登录页

D.
Dict 首次请求失败
→ 不缓存 []
→ 第二次可重新请求成功

E.
Retry 后仍 401
→ 不循环

F.
npm run lint
npm test
npm run build
全部通过
```

---

# 28. 验收 Checklist

## Auth Bootstrap

- [ ] Protected Route 启动前执行 ensureValidSession。
- [ ] Access Token 有效时不 Refresh。
- [ ] Access Token 过期时先 Refresh。
- [ ] Refresh 成功后才加载 Protected Initial Data。
- [ ] Refresh 失败跳登录。

## Refresh

- [ ] Single Flight。
- [ ] Token Pair 更新。
- [ ] 原请求 Retry。
- [ ] 最多 Retry 一次。
- [ ] Refresh 请求不递归。
- [ ] Login 请求不 Refresh。
- [ ] Refresh Failure 清状态。

## Initial State

- [ ] Profile 不绕过 Refresh。
- [ ] Theme Current 不绕过 Refresh。
- [ ] System Current 不绕过 Refresh。
- [ ] Protected Route 不 silent fallback Public Settings。
- [ ] currentUser 与 Token 状态一致。

## Dict

- [ ] Error 不缓存。
- [ ] Invalid Response 不缓存。
- [ ] Success [] 可以缓存。
- [ ] Pending Promise 去重。
- [ ] Logout 清缓存。
- [ ] Tenant/User Switch 清缓存。

## Request

- [ ] Request 自动带最新 Access Token。
- [ ] Nonce 每次 Retry 重新生成。
- [ ] Timestamp 每次 Retry 重新生成。
- [ ] Retry 使用新 Token。
- [ ] Retry 不重复使用旧防重放头。

## API Config

- [ ] 删除 Ant Design Demo API 地址。
- [ ] 开发 Proxy 正常。
- [ ] 生产同源 /api 正常。

## Tests

- [ ] Single Flight Test。
- [ ] Refresh Rotation Test。
- [ ] Refresh Failure Test。
- [ ] Bootstrap Test。
- [ ] Dict Cache Test。
- [ ] Retry Once Test。
- [ ] lint pass。
- [ ] test pass。
- [ ] build pass。

---

# 29. 特别注意：Replay Protection 与 Retry

当前项目请求会自动添加：

```text
X-Timestamp
X-Nonce
```

因此原请求 Retry 时必须重新经过 Request Interceptor。

不能直接复制旧 Headers 中：

```text
X-Timestamp
X-Nonce
```

否则 Retry 可能使用旧 Nonce。

推荐 Retry 前删除：

```ts
delete retryConfig.headers['X-Timestamp'];
delete retryConfig.headers['X-Nonce'];
delete retryConfig.headers['X-Signature'];
```

然后让 Request Interceptor 重新生成。

这对于 BLS-KOX 的 Replay Protection 非常重要。

---

# 30. 特别注意：Refresh Rotation 与多标签页

当前 Single Flight 只能解决：

```text
同一个浏览器 Tab
```

无法解决：

```text
Tab A Refresh
Tab B 同时 Refresh
```

开源项目基础版本可以先不做复杂锁，但建议增加：

```text
BroadcastChannel
```

作为后续增强。

例如：

```text
bls-auth
```

事件：

```text
TOKEN_REFRESHED
LOGOUT
```

Tab A 刷新后通知 Tab B 更新 Token。

这属于：

```text
P2 Enhancement
```

不阻塞本次修复。

---

# 31. 本轮完成标准

本轮修复后必须保证：

```text
用户离开页面 30 分钟
↓
Access Token 已过期
↓
刷新浏览器
↓
只发送 1 次 Refresh
↓
更新 AT / RT
↓
Profile 正常
↓
Theme 正常
↓
System Config 正常
↓
Dict 正常
↓
列表数据正常
↓
WebSocket 重新认证或重连
```

最终不能再出现：

```text
Token 已刷新
但页面是空的
```

这就是本轮最重要的验收标准。
