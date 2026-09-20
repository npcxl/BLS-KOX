# Page — Login (`/user/login`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/user/login` (`bls-admin/config/routes.ts`, `layout: false`) |
| Component | `bls-admin/src/pages/user/login/index.tsx` |
| Purpose | Account + password login; resolves the tenant by request **domain**; stores access/refresh tokens |
| Backend module | `bls-server/src/api/auth/index.ts` (`AuthService`) |
| Menu permission | none (public route) |
| Shared docs | `00-common/01-redis.md`, `02-replay-protection.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md` |

Public routes list (`bls-admin/src/app.tsx`): `/user/login`, `/user/register`,
`/user/register-result`. The login page loads public theme + public system config instead of the
authenticated ones.

---

## 2. Frontend → API map

| User action | Service function (file) | Method | Endpoint |
|---|---|---|---|
| Submit the form | `login({username, password, type:'account'})` — `bls-admin/src/services/ant-design-pro/api.ts` | POST | `/api/auth/login` |
| Load public theme for the page | `publicThemeConfig()` — `bls-admin/src/services/ant-design-pro/api.ts` | GET | `/api/system/config/public-theme` |
| Load public system config | `publicSystemConfig()` — `bls-admin/src/services/ant-design-pro/api.ts` | GET | `/api/system/config/public-system` |
| Load current user after login | `currentUser()` | GET | `/api/auth/profile` |
| Restore session on app start | `ensureValidSession()` — `bls-admin/src/auth/auth-manager.ts` | POST | `/api/auth/refresh` |

### Request body built by the frontend

```json
{ "username": "<input>", "password": "<md5(password)>", "type": "account" }
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
- Body: `{username?, password?}` read inline. **No Zod schema.** Any client-supplied
  `tenantId` is ignored.
- Behaviour (`AuthService.loginByDomain`):
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
| Rate limit | `ip` **20 / 60 s** and `account` **5 / 300 s** |
| IP block | global `blockedIpMiddleware` (Redis + `sys_ip_blacklist`) |
| Session | login writes `auth:session:{jti}`, `auth:refresh:{jti}`, Session Center `acc:`/`ref:` entries |
| Brute force | indirect: risk rule `rule_login_brute_force` (20 × `LOGIN_FAILED` / 300 s per IP → `BLOCK_IP` + `LOCK_ACCOUNT`) |
| Captcha | **none** on the login page and no server-side captcha verification |

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

1. **No captcha** on login, despite locale keys `pages.login.captcha.*` and an unused helper
   `getFakeCaptcha` → `GET /api/login/captcha` in
   `bls-admin/src/services/ant-design-pro/login.ts` (no backend route either).
2. **`sys_login_log` is not written by the login flow.** `writeLoginLog()` exists in
   `core/audit.ts` but is never called; login activity is published to the external event
   service instead. Therefore the Login Log page may be empty.
3. **Brute-force auto-action depends on a `LOGIN_FAILED` *security* log**, which the login
   handler does not write (it publishes an *event*). So `rule_login_brute_force` may not fire.
4. Account locking (raising `sys_user.status`) only happens through the event center action
   `LOCK_ACCOUNT`.

---

## 7. How to extend

- **Add captcha**: add a `getCaptcha` backend endpoint, render it on the page, verify it in the
  login handler before `loginByDomain`, and add a rate-limit rule for the captcha endpoint.
- **Write the login log**: call `writeLoginLog(...)` on both success and failure in the login
  handler so the Login Log page and brute-force detection work.
- **Add a new login factor**: extend `AuthService.loginByTenant`, keep the response shape
  `{token, refreshToken, user}` unchanged so the frontend keeps working.
- Update this document and the affected `00-common/*` tables after the change.
