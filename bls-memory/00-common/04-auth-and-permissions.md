# 04 — Auth, Permissions, Tenancy (shared)

> **Document version:** 1.2.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the captcha gate / `captchaToken` and the `/api/auth/captcha/*` endpoints
> were verified against `61aaf9a` + uncommitted captcha changes.

Relevant files:

| Concern | File |
|---|---|
| JWT sign/verify | `bls-server/src/shared/utils/jwt.ts` |
| Auth endpoints + `AuthService` | `bls-server/src/api/auth/index.ts` |
| Login captcha endpoints | `bls-server/src/api/auth/captcha/index.ts` |
| Login captcha logic | `bls-server/src/security/captcha/*` |
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
`/api/auth/captcha/*` lives in the sub-directory `src/api/auth/captcha/index.ts` and is mounted as
a **custom router** with prefix `/auth/captcha` (the router scanner recurses into sub-directories
even when the parent has its own `index.ts`).

| Method | Path | Auth | Body / notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{username, password, type?, captchaToken?}`. `password` is **MD5-hashed by the frontend**. Response `data = {token, refreshToken, user}`; `token` already includes the `Bearer ` prefix. |
| POST | `/api/auth/logout` | public | Reads `Authorization` header; revokes the session + refresh keys. Always returns `code 200`. |
| POST | `/api/auth/refresh` | public | `{refreshToken}` → `{token, refreshToken}` (rotation). Returns `code 400/401/500` in body (not thrown). |
| GET | `/api/auth/profile` | **JWT** | Returns user fields + `permissions` + `perms` + `roles[{roleKey,dataScope}]` + `menus` (tree). |
| GET | `/api/auth/captcha/config` | public | `{enabled, mode, secondaryTypes}` only |
| POST | `/api/auth/captcha/challenge` | public | `{username?, stage?}` → challenge (silent or secondary) |
| POST | `/api/auth/captcha/silent/verify` | public | stage-1 silent scoring → `captchaToken` or `nextStage:'secondary'` |
| POST | `/api/auth/captcha/secondary/verify` | public | stage-2 slider / rotate → `captchaToken` |
| GET | `/api/auth/captcha/image/:imageId` | public | Challenge SVG, `Cache-Control: no-store` |

There is **no** `/api/auth/register` on the server. The register page posts to `/api/register`
which has no handler (see `pages/user-register.md`).

### Login flow (`AuthService.loginByDomain`)

0. **Captcha gate** (`captchaService.consumeLoginToken`) — only when
   `sys.login.captcha.enabled=true` and `mode !== 'off'`. The one-shot `captchaToken` is consumed
   **before** `sys_user` is touched: missing → `40010 CAPTCHA_REQUIRED`, bad signature / binding →
   `40011 CAPTCHA_INVALID`, expired → `40012 CAPTCHA_EXPIRED`, already used → `40013
   CAPTCHA_REPLAYED`, Redis unavailable → `503 / 50301 CAPTCHA_SERVICE_UNAVAILABLE` (fail closed).
   Because the check precedes the user lookup and both branches return the same shape, the flow
   cannot be used to enumerate accounts. Full detail: `pages/login-captcha.md`.
1. Resolve the tenant from the request **domain**, not from the body:
   `X-Forwarded-Host` (only when `TRUST_PROXY=true`) → `Host` (port stripped) → `Origin`
   → fallback `localhost`.
2. `sys_tenant WHERE domain_name = :d AND status='0' AND deleted=0`. Only for
   `localhost` / `127.0.0.1` / `::1` does it fall back to the platform tenant `000000`.
   Otherwise throw `当前域名未绑定租户`.
3. Look up `sys_user WHERE username = :u AND tenant_id = :tid`, `deleted=0`.
   Wrong user/password → `用户名或密码错误` (401). `status='1'` → `用户已被停用` (401).
4. Verify the password (see §5), then sign tokens and create sessions.
5. Success → `captchaService.resetLoginFailures()` (clears the consecutive-failure counter);
   failure → `captchaService.recordLoginFailure()` (feeds `forceAfterFailures`). Captcha errors are
   never counted as login failures.

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

---

## 8. Production hardening (2026-09-21) — phases 1, 2 and 4

### 8.1 Tenant lifecycle is enforced on every entry point (phase 1)

`services/tenant-lifecycle.ts` owns the single predicate:

```ts
assertTenantUsable(row)  // deleted = 0 && status = '0' && offboard_status = 'none' && (expire_time IS NULL || expire_time > now)
assertUserUsable(user)   // deleted = 0 && status = '0'
```

It is called by **`loginByDomain` / `loginByTenant`**, **`jwtAuth`** (before the Session Center check),
**`refresh`** (before rotating) and the worker (`processJob`, which skips a job whose tenant is no
longer active). A client-supplied `tenantId` is still never trusted.

New behaviours:

| Topic | Behaviour |
|---|---|
| Tenant creation | `POST /api/system/tenant/add` is now a **transactional provisioning** (`api/system/tenant/provisioning.ts`): validate the package (exists + `status='0'`) → normalise/validate `domain_name` → `sys_tenant` → default `tenant_admin` role → `sys_role_menu` copied from `sys_package_menu` → default admin user (Argon2id) + `sys_user_role` → tenant `sys_config` / `sys_theme_config` copied from the platform tenant. Any failure rolls the whole transaction back. |
| Idempotency | The endpoint **requires an `Idempotency-Key` header**. The key is claimed with `SET NX`; a repeat call returns the first result (`idempotent: true`), a concurrent one returns `40903`. Redis missing → `503` (fail-closed). |
| `expire_time` | Validated as a **real datetime** (`YYYY-MM-DD` → `23:59:59`); `2026-02-31` is rejected with 400. |
| Disabling a tenant | No longer requires deleting users/roles first. It immediately calls `sessionCenter.revokeAllForTenant()`; restored tenants do **not** get their old sessions back. |
| Deleting a tenant | Asynchronous **offboarding**: `status='1'`, `offboard_status='pending'`, sessions revoked and a `tenant.offboard` job enqueued (`queue/jobs/tenant-offboard.job.ts`). Business rows are only soft-deleted by the job; `deleted` stays `0` so ops can still inspect/recover. |
| `GET /api/system/tenant/public-list` | Anonymous, and now returns **only the tenant bound to the current Host** (previously it listed every tenant — an information leak). |

### 8.2 Authorisation model corrected (phase 2)

`middleware/permission.ts` already had `tenantId === '000000' → allow everything`. That bypass is
**removed**. The only bypass is an explicit platform super-admin identity:

```ts
isPlatformSuperAdmin(user) =
  user.tenantId === '000000' && user.isAdmin === '1' &&
  (roles include roleKey 'admin' | 'platform_super_admin' || perms include '*')
```

A **normal user inside the platform tenant must pass `hasPerm` like anybody else.**

`AuthService.profile()` now carries the tenant predicate on **all four queries** (user / roles /
perms / menus): the user row is looked up by `user_id AND tenant_id`, and role/menu joins require
`r.tenant_id = :tid OR r.tenant_id = '000000'`.

**Package = permission ceiling.** `profile()` also reads the tenant's package permissions and returns
`effectivePermissions = rolePermissions ∩ packagePermissions` (as `perms` + `permissions`), and filters
the menu tree with the same rule. If a package has no permissions configured at all, the intersection
is skipped (with a warning) so a mis-seeded package cannot lock a tenant out.

`PUT /api/system/role/:roleId/menus` refuses to grant menus outside the tenant's package (`403`).

### 8.3 Authentication loop closed (phase 4)

| Topic | Behaviour |
|---|---|
| MD5 → Argon2id | On a successful login of a `password_algorithm='md5'` user the password is **re-hashed to Argon2id inside the same login flow** (and `password_update_time` is set). Failure to upgrade never blocks the login. |
| Forgot / reset password | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (`src/api/auth-password/`, mounted under `/api/auth`). Tokens live in `sys_password_reset_token`, stored as **SHA-256 only**, single-use (`UPDATE … WHERE used=0 AND expire_time > NOW()`), TTL 30 min, and a successful reset calls `sessionCenter.revokeAll()` + invalidates the user's other tokens. The forgot-password response is identical whether or not the account exists (no username/email enumeration). |
| Email delivery | `services/email-sender.ts` is an **explicit placeholder** (`LogOnlyEmailSender`): with no SMTP configured it logs and returns `delivered: false` / `EMAIL_TRANSPORT_NOT_CONFIGURED` — it never pretends to have sent anything. Set `AUTH_EXPOSE_RESET_TOKEN=true` in dev to receive the token in the response body. |
| Admin reset | `POST /api/system/user/resetPassword` (`system:user:resetPassword`), tenant-scoped, revokes all sessions and invalidates pending tokens. It is a write endpoint, so the existing replay/signature middleware applies unchanged. |
| Immediate revocation | Disabling a user (`PUT /system/user/edit` with `status='1'`), deleting a user, changing a password, admin reset and password reset all call `sessionCenter.revokeAll()`. |
| `refresh` | Re-checks **tenant** and **user** status before rotating (a stopped tenant/expired tenant/deleted user can no longer refresh). |
| Login logs | Both success and failure now call `writeLoginLog()` → `sys_login_log` is populated, and `detectBruteForce()` counts the real failure events (5 failures / 15 min → `LOGIN_BRUTE_FORCE`, which the Event Center can act on). |
| MFA / SSO / email verification | **Not implemented.** Only the token table supports the `verify_email` / `invite` purposes so the flow can be added without another migration. |

### 8.4 Package features (entitlements) and quotas (phase 3)

Two services own all of it — **never copy this logic into an endpoint**:

| Service | File | Responsibility |
|---|---|---|
| `EntitlementService` | `services/entitlement-service.ts` | Reads `sys_package_feature` for the tenant's package. `assertFeature(tenantId, featureKey)` throws **403 / code 40301** (`EntitlementError`) when the feature is not included. Not cached → package changes take effect immediately. |
| `QuotaService` | `services/quota-service.ts` | `consume()` / `release()` / `getState()` / `snapshot()` over `sys_package_quota` + `sys_tenant_quota_usage`. |

Feature keys: `feature.ai.chat`, `feature.webhook`, `feature.openapi`, `feature.audit.export`,
`feature.custom_domain`.

Quota keys: `max_users`, `max_storage_bytes`, `max_files`, `max_api_keys`, `max_webhooks`,
`max_ai_tokens_monthly`, `max_ai_cost_monthly`, `max_concurrent_jobs`. `quota_limit < 0` = unlimited.
`*_monthly` keys use a `YYYY-MM` period key, everything else uses `total`.

**Atomicity**: `consume()` performs one conditional statement —
`UPDATE … SET used = used + :delta WHERE … AND (:unlimited = 1 OR used + :delta <= :limit)` —
so N concurrent requests can never exceed the limit (the DB row lock serialises them).
`affectedRows === 0` → **409 / code 40905** (`QuotaExceededError`).

**Idempotency**: an optional `idempotencyKey` is claimed with Redis `SET NX` (24 h). A repeated call
returns the current state without consuming again; a failed call **releases** the key so the caller
can retry. Redis missing while a key was supplied → `503` (fail-closed).

**Downgrade**: limits are read live, so a smaller package limit immediately blocks new resources
(`used + delta > limit`) while existing data is untouched. Upgrades take effect immediately too.

Enforcement points (current):

| Entry point | Feature | Quota |
|---|---|---|
| `POST /api/system/user/add` | — | `max_users` (+1); `DELETE /remove` releases |
| `POST /api/system/storage/upload` | — | `max_files` (+1) and `max_storage_bytes` (+file size); released when the upload fails |
| `POST /api/ai/chat/conversations` | `feature.ai.chat` | — |
| `POST /api/system/ai-usage/report` | — | `max_ai_tokens_monthly` / `max_ai_cost_monthly`; over-limit is reported back (`quotaExceeded`) but never blocks the accounting insert |
| `POST /api/system/webhooks` | `feature.webhook` | `max_webhooks` (+1); `DELETE /:id` releases |
| `POST /api/system/api-key/add` | `feature.openapi` | `max_api_keys` (+1); revoke/delete releases |
| `POST /api/system/jobs` | — | `max_concurrent_jobs` (+1); the queue releases it when the job reaches a terminal state |

Read API: `GET /api/system/quota/my` (`system:quota:list`) returns `{ packageId, features[], quotas[] }`
with `limit` / `used` / `remaining` (`null` = unlimited) and the period key; the frontend uses it to
show consumption. `GET /api/system/quota/tenant/:tenantId` is restricted to the tenant itself or a
platform super admin.
