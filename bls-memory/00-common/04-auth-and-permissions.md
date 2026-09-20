# 04 — Auth, Permissions, Tenancy (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

Relevant files:

| Concern | File |
|---|---|
| JWT sign/verify | `bls-server/src/shared/utils/jwt.ts` |
| Auth endpoints + `AuthService` | `bls-server/src/api/auth/index.ts` |
| JWT middleware | `bls-server/src/middleware/auth.ts` |
| Permission middleware | `bls-server/src/middleware/permission.ts` |
| Tenant middleware | `bls-server/src/middleware/tenant.ts` |
| Request context | `bls-server/src/core/request-context.ts` |
| Session center | `bls-server/src/security/session/session-center.ts` |
| Data scope | `bls-server/src/security/data-scope/data-scope.ts` |
| Ownership | `bls-server/src/security/ownership.ts` |
| Password hashing | `bls-server/src/shared/utils/password.ts` |
| Frontend auth | `bls-admin/src/auth/{token-store,refresh-manager,auth-manager,jwt}.ts` |
| Frontend request auth | `bls-admin/src/requestErrorConfig.ts` |

---

## 1. Auth endpoints

Routes are auto-registered from `bls-server/src/api/auth/index.ts` under prefix `/api/auth`
(function name → path; `login`/`logout`/`refresh` are public, the rest require JWT).

| Method | Path | Auth | Body / notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{username, password, type?}`. `password` is **MD5-hashed by the frontend**. Response `data = {token, refreshToken, user}`; `token` already includes the `Bearer ` prefix. |
| POST | `/api/auth/logout` | public | Reads `Authorization` header; revokes the session + refresh keys. Always returns `code 200`. |
| POST | `/api/auth/refresh` | public | `{refreshToken}` → `{token, refreshToken}` (rotation). Returns `code 400/401/500` in body (not thrown). |
| GET | `/api/auth/profile` | **JWT** | Returns user fields + `permissions` + `perms` + `roles[{roleKey,dataScope}]` + `menus` (tree). |

There is **no** `/api/auth/register` on the server. The register page posts to `/api/register`
which has no handler (see `pages/user-register.md`).

### Login flow (`AuthService.loginByDomain`)

1. Resolve the tenant from the request **domain**, not from the body:
   `X-Forwarded-Host` (only when `TRUST_PROXY=true`) → `Host` (port stripped) → `Origin`
   → fallback `localhost`.
2. `sys_tenant WHERE domain_name = :d AND status='0' AND deleted=0`. Only for
   `localhost` / `127.0.0.1` / `::1` does it fall back to the platform tenant `000000`.
   Otherwise throw `当前域名未绑定租户`.
3. Look up `sys_user WHERE username = :u AND tenant_id = :tid`, `deleted=0`.
   Wrong user/password → `用户名或密码错误` (401). `status='1'` → `用户已被停用` (401).
4. Verify the password (see §5), then sign tokens and create sessions.

A client-supplied `tenantId` is **never** trusted.

---

## 2. Tokens and sessions

| Token | TTL env | TTL default | Payload |
|---|---|---|---|
| Access | `JWT_EXPIRES_IN` | `15m` | `{userId, username, tenantId, jti, tokenType:'access'}` |
| Refresh | `JWT_REFRESH_EXPIRES_IN` | `7d` | `{userId, username, tenantId, jti, tokenType:'refresh'}` |

`verifyToken` / `verifyRefreshToken` enforce `tokenType`, so an access token cannot be used as
a refresh token and vice versa.

Redis keys involved (details in `00-common/01-redis.md`):

- `auth:session:{accessJti}`, `auth:refresh:{refreshJti}`, `auth:user-sessions:{userId}`,
  `auth:refresh-used:{jti}`.
- Session Center: `session:{tenantId}:{userId}:{sessionId}` + `session-index:{tenantId}:{userId}`.
  Two session ids per login: `acc:{accessJti}` and `ref:{refreshJti}`.

### Refresh rotation + reuse detection

- On refresh, the old refresh `jti` is deleted and marked in `auth:refresh-used:{oldJti}` (7 d).
- If a refresh request arrives whose stored hash is missing/mismatched **and**
  `auth:refresh-used:{jti}` exists, that is a **reuse attack**:
  - write `REFRESH_TOKEN_REUSE` at risk `CRITICAL`,
  - `sessionCenter.revokeAll(tenantId, userId)` → all devices are logged out,
  - respond `401 refreshToken无效`.
- Risk rule `rule_refresh_reuse` (threshold 1, CRITICAL, `REVOKE_ALL_SESSIONS`) mirrors this.

### `jwtAuth()` behaviour (every protected request)

1. Parse `Bearer` token (scheme must be exactly `Bearer`).
2. `verifyToken` → payload.
3. `sessionCenter.validate(tenantId, userId, 'acc:'+jti)`. Failure →
   `SessionInvalidError` (**code 40101**) + `TOKEN_INVALID` security log.
   This is why "kick user offline" / "disable user" / "change password" take effect immediately.
4. `ctx.state.user = await authService.profile(userId, tenantId)` — the full profile with
   `perms`/`permissions`, `roles`, `menus`.
5. `setRequestContext({tenantId, userId, username})` so `getRequestContext()` is populated for
   replay / rate limit / audit.
6. `TokenExpiredError` → `TOKEN_EXPIRED` log + `401 登录已过期`.
   Other verify errors → `TOKEN_INVALID` log + 401.

---

## 3. `hasPerm(perm)` — permission checks

`hasPerm('system:user:add')` used as route middleware:

1. No `ctx.state.user` → `UnauthorizedError` (401).
2. Read the permission list from `user.perms ?? user.permissions`.
3. **Cross-tenant detection**: if the request contains a `tenantId` in query/body/params and
   the user is not the platform tenant and it differs from the user's tenant → write
   `CROSS_TENANT_ACCESS` (HIGH) to `sys_security_log`. The request still proceeds.
4. **Platform bypass**: `user.tenantId === '000000'` **or** `perms.includes('*')` → allow.
5. Otherwise the exact permission string must be present, else
   `ForbiddenError` (403) + `PERMISSION_DENIED` (MEDIUM) log.

### Permission code convention

```
system:<resource>:<action>     e.g. system:user:add, system:role:assignMenu
ai:<resource>:<action>         e.g. ai:workbench:view, ai:models:view
ops:<resource>:<action>        e.g. ops:release:create
```

- CRUD factory action names are fixed: `list`, `add`, `edit`, `remove`, `status`.
  With `permPrefix: 'system:config'` you get `system:config:list`, `...:add`, etc.
- Hand-written modules choose their own actions (e.g. `system:role:assignMenu`,
  `system:user:kick`, `system:security:blacklist:add`, `system:pageconfig:edit`).
- The Java backend uses the same codes with a `PERM_` prefix on the constant name
  (`PERM_system:user:list`).

> **Known frontend/backend mismatch to be aware of**: several pages declare
> `permissions.create = 'system:xxx:create'` while the backend requires `system:xxx:add`
> (e.g. theme). Always trust the backend code as the source of truth and align the frontend.

---

## 4. Tenant isolation

- `getCurrentTenantId()` → tenant from the request context (set by `jwtAuth`/`tenantMiddleware`),
  or `null`.
- `requireTenantId()` → **throws** `缺少租户上下文，禁止写操作` when absent (fail-closed).
  Every write endpoint must use it.
- `tenantWhere(table)` returns the `tenant_id = ?` condition, except for **global tables**
  which have no `tenant_id` column: `sys_menu`, `sys_package`, `sys_package_menu`.
- Platform tenant id is the **string** `'000000'` (`PLATFORM_TENANT_ID`), not `0`.
  Platform-tenant rows are the fallback for public config/dict/theme lookups.
- In the CRUD factory, `tenant_id` from the request body is deleted and re-injected server-side.
- `assertTenantResource(table, pkField, id)` (`security/ownership.ts`) resolves a row and
  throws 404 when it is missing or belongs to another tenant; an optional owner field can further
  restrict to the current user (403).

### Data scope

`dataScope` is **off by default** (CRUD factory default `dataScope: false`). When enabled it
maps to `ALL | TENANT | DEPT | DEPT_AND_CHILDREN | SELF | CUSTOM` and is resolved by
`resolveMaxScope()` + `buildScopeWhere()` in `security/data-scope/data-scope.ts`.
Roles store a `data_scope` column; `sys_role.data_scope` is validated as an enum but most
hand-written system modules do not consume it.

---

## 5. Passwords

- Frontend sends `md5(password)` (legacy contract, `bls-admin/src/services/ant-design-pro/api.ts`).
- Storage algorithm column: `sys_user.password_algorithm` (`md5` | `argon2id`).
- `md5` mode: accept an incoming 32-char MD5 as-is, otherwise MD5-hash it; compare lowercase.
- `argon2id` mode: stored value is `argon2id(md5(password))`, so the incoming MD5 is verified
  directly with `argon2.verify`.
- New/re-hashed passwords use Argon2id (`memoryCost 65536`, `timeCost 3`, `parallelism 4`).
- Users still on `md5` are transparently upgraded on the next successful login
  (log message `[auth] MD5 user logged in (migration pending)`).
- A successful MD5 login should be followed by an Argon2id rehash — when adding auth code,
  keep this migration path.

---

## 6. Frontend token strategy

- `bls-admin/src/auth/token-store.ts` — the only place that touches `localStorage`.
  Keys: `token`, `refreshToken`, `currentUser`, `lastTenantId`, `rememberLoginUsername`.
- **Pre-emptive refresh** (`ensureFreshToken` in `requestErrorConfig.ts`): before sending, if
  the access token is expired (30 s buffer in `auth/jwt.ts`), refresh first.
- **Single-flight** (`refresh-manager.ts`): concurrent refreshes share one in-flight promise —
  N parallel 401s produce exactly one `POST /api/auth/refresh`.
- **Periodic guard** (`components/TokenRefreshGuard.tsx`): every 60 s, refresh when ≤120 s remain.
- **401 handling**: login URL → ignore; `skipAuthRefresh`/skip-list → redirect to login;
  `code 40101` → confirm modal then re-login; already retried → re-login; otherwise refresh +
  retry **once**, deleting the stale `X-Timestamp`/`X-Nonce`/`X-Signature` headers.
- **Skip list** (`isRefreshSkippedUrl`): `/api/auth/login`, `/api/auth/refresh`,
  `/api/auth/register`, `/api/system/config/public-*`, `/api/system/tenant/public-*`.
- **Startup** (`ensureValidSession`): no token → `anonymous`; valid → `valid`;
  expired-with-refresh → refresh; failure → `expired` → redirect to login.
- Public routes (no layout): `/user/login`, `/user/register`, `/user/register-result`.

---

## 7. Checklist when adding a protected feature

1. Choose permission codes and add them to `sys_menu` (as buttons) in `sql/Init.sql`.
2. Add `jwtAuth()` + `hasPerm('<code>')` to the route (the CRUD factory does this for you).
3. Use `requireTenantId()` for writes and filter reads by `tenant_id` (unless the table is global).
4. Add the permission code to the frontend `usePermission()` gate / `permissions` prop.
5. Keep the Java backend in sync (same path, method, code, pagination, errors).
6. Add the page's replay + rate-limit rows to the page memory document.
