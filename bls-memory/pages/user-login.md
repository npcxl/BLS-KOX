# Page — Login (`/user/login`)

> **Document version:** 1.1.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-20
>
> *Uncommitted note:* the login flow, the two-stage login captcha and the frontend captcha modal
> described here are **not yet committed** (verified against working tree at `61aaf9a` +
> uncommitted captcha changes).

## 1. Summary

| Item | Value |
|---|---|
| Route | `/user/login` (`bls-admin/config/routes.ts`, `layout: false`) |
| Component | `bls-admin/src/pages/user/login/index.tsx` |
| Purpose | Account + password login; resolves the tenant by request **domain**; stores access/refresh tokens |
| Backend module | `bls-server/src/api/auth/index.ts` (`AuthService`), `bls-server/src/api/auth/captcha/index.ts`, `bls-server/src/security/captcha/*` |
| Menu permission | none (public route) |
| Shared docs | `00-common/01-redis.md`, `02-replay-protection.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md` |
| Captcha | two-stage login captcha → dedicated page memory [pages/login-captcha.md](login-captcha.md) |

Public routes list (`bls-admin/src/app.tsx`): `/user/login`, `/user/register`,
`/user/register-result`. The login page loads public theme + public system config instead of the
authenticated ones.

---

## 2. Frontend → API map

| User action | Service function (file) | Method | Endpoint |
|---|---|---|---|
| Submit the form | `login({username, password, type:'account', captchaToken?})` — `bls-admin/src/services/ant-design-pro/api.ts` | POST | `/api/auth/login` |
| Load public theme for the page | `publicThemeConfig()` — `bls-admin/src/services/ant-design-pro/api.ts` | GET | `/api/system/config/public-theme` |
| Load public system config | `publicSystemConfig()` — `bls-admin/src/services/ant-design-pro/api.ts` | GET | `/api/system/config/public-system` |
| Load current user after login | `currentUser()` | GET | `/api/auth/profile` |
| Restore session on app start | `ensureValidSession()` — `bls-admin/src/auth/auth-manager.ts` | POST | `/api/auth/refresh` |
| *(captcha)* read config + component shape | `getCaptchaConfig({username?})` — `bls-admin/src/services/auth/captcha.ts` | GET | `/api/auth/captcha/config` |
| *(captcha)* the official widget fetches a challenge itself | `<altcha-widget challenge="…">` | GET | `/api/auth/captcha/challenge` |
| *(captcha)* submit the solved ALTCHA payload | `verifyCaptcha({payload, username, stage})` | POST | `/api/auth/captcha/verify` |

### Login flow with the ALTCHA captcha

`captchaConfig.enabled === false` → the original flow (submit → `POST /api/auth/login`).
When enabled:

1. `GET /api/auth/captcha/config` on mount; when not enabled nothing else happens (back-compatible).
2. `<AltchaCaptcha>` (`components/AltchaCaptcha/index.tsx`) mounts the **official**
   `<altcha-widget>` with `challenge="/api/auth/captcha/challenge"`, `auto="onload"`,
   `language="zh-cn"` and `display` taken from the config (`invisible` by default). The official
   Web Worker solves the Proof-of-Work in the background — no custom code runs here.
3. The widget dispatches `verified` with the payload; the page posts it to
   `POST /api/auth/captcha/verify` and keeps the returned one-shot `captchaToken` in a ref.
   - `requireVisible:true` → the page switches `display` to `visible`, re-mounts the widget
     (`captchaInstance`) and shows “请完成下方安全验证”.
   - any other `reason` → show the mapped Chinese hint and re-mount for a fresh challenge.
4. `onExpired` (`statechange` → `expired`) re-mounts the widget so a new challenge is fetched.
5. `POST /api/auth/login` with `captchaToken` in the body.
6. Login errors `40010/40011/40012/40013` → clear token + payload, re-read the config, retry the
   captcha flow **once** (`captchaRetryRef`); `50301` → show “人机验证服务暂不可用”.

### Request body built by the frontend

```json
{ "username": "<input>", "password": "<md5(password)>", "type": "account", "captchaToken": "<one-shot, only when captcha is enabled>" }
```

The password is MD5-hashed **in the browser** before it is sent
(`md5` from `bls-admin/src/services/ant-design-pro/api.ts`). The backend expects that and
stores `argon2id(md5(password))`.

### After a successful login

1. `tokenStore.setTokenPair({accessToken: msg.token, refreshToken: msg.refreshToken})`.
   The server already prefixes the access token with `Bearer `.
2. `tokenStore.setCurrentUser(msg.user)`.
3. Remember the username if `rememberUsername` is checked
   (`tokenStore.setRememberedUsername`), otherwise clear it.
4. `message.success('登录成功！')`.
5. Set `initialState.currentUser`, or call `fetchUserInfo()` (`GET /api/auth/profile`).
6. Redirect with `getSafeRedirectUrl(redirect)`:
   default `/dashboard`; rejects a `redirect` that is not same-origin or does not start with `/`.

Errors: a business error renders inside `<LoginMessage>`; a thrown error shows
`error.response.data.message || errmsg || '账号或密码错误'`.
A `submittingRef` guard prevents double submission.

---

## 3. Backend endpoint

### `POST /api/auth/login`

- Auth: **public** (no `jwtAuth`).
- Handler: `login` in `bls-server/src/api/auth/index.ts`.
- Body: `{username?, password?, captchaToken?}` read inline. **No Zod schema.** Any client-supplied
  `tenantId` is ignored.
- Behaviour (`AuthService.loginByDomain`):
  0. **ALTCHA captcha gate (only when the feature is active)**: `captchaService.consumeLoginToken()` —
     missing token → `40010 CAPTCHA_REQUIRED`; bad signature / binding mismatch → `40011
     CAPTCHA_INVALID`; expired → `40012 CAPTCHA_EXPIRED`; already consumed → `40013
     CAPTCHA_REPLAYED`; Redis unavailable → `503 / 50301 CAPTCHA_SERVICE_UNAVAILABLE`
     (fail closed). The token is consumed **before** any username/password check.
  1. Resolve the domain via `buildRequestMeta` → `resolveTenantDomain`
     (`X-Forwarded-Host` only when `TRUST_PROXY=true` → `Host` without port → `Origin` →
     `localhost`).
  2. `sys_tenant WHERE domain_name = :d AND status='0' AND deleted=0`.
     Fallback to platform tenant `000000` **only** for `localhost` / `127.0.0.1` / `::1`.
     Otherwise throw `当前域名未绑定租户`.
  3. `sys_user WHERE username = :u AND tenant_id = :tid AND deleted=0`.
     Not found / wrong password → `用户已被停用` or `用户名或密码错误` (401).
     `status='1'` → `用户已被停用` (401).
  4. Verify password (Argon2id or MD5; Argon2id stores `argon2id(md5(pwd))`).
  5. Sign access (15 m) + refresh (7 d) tokens; create Redis sessions and Session Center entries.
  6. `publishEvent('LOGIN_SUCCESS' | 'LOGIN_FAILED')` (fire-and-forget to the event service).
  7. Success → `captchaService.resetLoginFailures()`; failure → `captchaService.recordLoginFailure()`
     (both only when the captcha feature is active). Captcha errors (`4001x` / `50301`) are **not**
     counted as login failures and never publish `LOGIN_FAILED`.
  8. Success and failure both call `writeLoginLog(...)` (writes `sys_login_log`), and a failure runs
     `detectBruteForce(...)` → `LOGIN_BRUTE_FORCE` security log above 5 failures / 15 min.
- Response success: `{code:200, data:{token, refreshToken, user}, message:'操作成功'}`.
  `user` is the same shape as `GET /api/auth/profile`.

`AuthService.profile()` returns: `userId, tenantId, username, nickname, realName, avatar,
gender, email, phone, deptId, isAdmin, status`, plus `permissions`, `perms`,
`roles[{roleKey, dataScope}]` and `menus` (tree).

---

## 4. Security rules for this page

| Protection | Rule |
|---|---|
| Replay | `/api/auth/login` POST → `nonce`, window **60 s**, nonce TTL **150 s** |
| Rate limit | `ip` **20 / 60 s** and `account` **5 / 300 s**; captcha endpoints: see below |
| IP block | global `blockedIpMiddleware` (Redis + `sys_ip_blacklist`) |
| Session | login writes `auth:session:{jti}`, `auth:refresh:{jti}`, Session Center `acc:`/`ref:` entries |
| Brute force | risk rule `rule_login_brute_force` (20 × `LOGIN_FAILED` / 300 s per IP → `BLOCK_IP` + `LOCK_ACCOUNT`) driven by the real `sys_login_log` rows written since the login-flow change, plus `LOGIN_BRUTE_FORCE` after 5 failures / 15 min for one account |
| Captcha | ALTCHA Proof-of-Work (official library) with an invisible→visible escalation, one-shot `captchaToken` consumed by the login handler. Rate limits: `/challenge` ip 60/60 s + device 30/300 s, `/verify` ip 30/60 s + account 20/300 s + device 30/300 s, `/config` ip 120/60 s. Full detail: [pages/login-captcha.md](login-captcha.md) |

The frontend always sends `X-Timestamp` + `X-Nonce` (added by the request interceptor), which is
what satisfies the nonce rule. Because there is no token yet, the nonce key is
`replay:anonymous:{clientIp}:{nonce}`.

---

## 5. Frontend-only validation

- `username` required, `password` required (Ant Design form rules).
- `rememberUsername` checkbox only stores the username in `localStorage`
  (key `rememberLoginUsername`); it does not extend the session.
- There is an unused `autoLogin: true` initial value — it is never read, so login does not
  actually auto-login.
- `getSafeRedirectUrl` prevents open redirects.

---

## 6. Known gaps / discrepancies

1. The template leftovers `pages.login.captcha.*` locale keys and `getFakeCaptcha` →
   `GET /api/login/captcha` (`bls-admin/src/services/ant-design-pro/login.ts`) are still dead code;
   the real captcha lives in `bls-admin/src/services/auth/captcha.ts` + `components/AltchaCaptcha`
   (official ALTCHA widget).
2. Captcha is implemented in the **Koa** backend only. `bls-java-server` / `bls-rust-server` do not
   implement `/api/auth/captcha/*` and ignore the `captchaToken` field, so when those backends are
   selected the login page simply keeps the pre-captcha behaviour (the frontend degrades gracefully:
   an unknown `code` on `POST /api/auth/login` just shows the message).
3. The captcha gate is skipped entirely when `CAPTCHA_DEV_BYPASS=true`; production startup refuses to
   boot with that variable set (see `bls-server/src/app.ts`).
4. `sys_login_log` **is** written now (success + failure) and `detectBruteForce` runs on failure, so
   the Login Log page and `rule_login_brute_force` have real data.
5. Account locking (raising `sys_user.status`) only happens through the event center action
   `LOCK_ACCOUNT`.

---

## 7. How to extend

- **Change the captcha policy** (thresholds, TTLs, secondary types, mode): edit the
  `sys.login.captcha.*` values in the System parameters page or `sql/Init.sql`
  (see [pages/system-config.md](system-config.md) and [pages/login-captcha.md](login-captcha.md)) —
  no code change is required.
- **Add a new secondary challenge type**: extend `CAPTCHA_SECONDARY_TYPES` in
  `bls-server/src/config/dynamic-config.ts`, add the generator in
  `bls-server/src/security/captcha/image.ts`, the payload + verification branch in
  `security/captcha/service.ts`, and the UI branch in `components/CaptchaChallenge/index.tsx`.
- **Add a new login factor**: extend `AuthService.loginByTenant`, keep the response shape
  `{token, refreshToken, user}` unchanged so the frontend keeps working.
- Update this document and the affected `00-common/*` tables after the change.
