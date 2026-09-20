# Page — Register & Register Result (`/user/register`, `/user/register-result`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Routes | `/user/register`, `/user/register-result` (both `layout: false`) |
| Components | `bls-admin/src/pages/user/register/index.tsx`, `.../register-result/index.tsx`, service `.../register/service.ts` |
| Purpose | Self-service registration form; then a static "check your email" success page |
| Backend module | **none** — the endpoint does not exist on the server |
| Menu permission | none (public routes) |

---

## 2. Frontend → API map

| User action | Service function (file) | Method | Endpoint |
|---|---|---|---|
| Submit the register form | `fakeRegister(...)` — `bls-admin/src/pages/user/register/service.ts` | POST | `/api/register` |
| Redirect after success | `history.push('/user/register-result?account=<email>')` | — | — |
| Load public theme/config on the page | `publicThemeConfig()` / `publicSystemConfig()` | GET | `/api/system/config/public-theme` / `public-system` |

Register request body (mapped in `register/index.tsx`):

```json
{ "mail": "<email>", "password": "<raw password>", "confirm": "<raw>", "mobile": "<11 digits>", "captcha": "<code>", "prefix": "86" }
```

On success (`data.status === 'ok'`): `message.success('注册成功！')` then redirect to
`/user/register-result?account=<mail>`. **No token is issued and there is no auto-login.**

Result page: a purely presentational component that reads the `account` query parameter:
"你的账户：{email} 注册成功" + "激活邮件已发送…有效期24小时". No API call, no auth logic.

---

## 3. Backend endpoint

**There is no `/api/register` handler and no `/api/auth/register` route.**

- `bls-server/src/api/auth/index.ts` only exports `login`, `logout`, `refresh`, `profile`.
- `isRefreshSkippedUrl` lists `/api/auth/register`, but no such route is registered, so the
  frontend refresh logic simply never matches it.
- `bls-admin/mock/` is empty, so there is no dev mock either.

Consequence: on a real backend the register form submit fails (404 / business error).
The flow currently works only as a UI demonstration.

---

## 4. Security rules for this page

| Protection | Rule |
|---|---|
| Replay | `/api/register` would fall under the default write rule (`nonce`, window 120 s, TTL 300 s) — but there is no route to protect |
| Rate limit | default write bucket `user` 300 / 60 s (again, no route) |
| Public config reads | `GET /api/system/config/public-*` → replay `off`, rate limit read bucket 600 / 60 s |

If you implement registration, you **must** add:

1. A dedicated rate-limit rule by `ip` (and ideally `account`), e.g. 5 / 300 s.
2. A `nonce` replay rule for `POST /api/register` (the default already covers it).
3. Tenant resolution identical to login (register into a tenant resolved from the domain, or
   explicitly into the platform tenant).
4. Argon2id hashing (`hashPasswordArgon2`) — and be aware the login contract expects
   `argon2id(md5(password))`, so either hash `md5(password)` server-side or send the raw
   password and document the difference.
5. Duplicate checks: `username`/`email` unique per tenant → `ConflictError`.

---

## 5. Frontend-only validation

| Field | Rule |
|---|---|
| `email` | required, `type: 'email'` |
| `password` | required, min length 6 |
| `confirm` | required, must equal `password` (`checkConfirm` validator) |
| `mobile` | required, pattern `/^\d{11}$/` |
| `captcha` | required; the "获取验证码" button has **no handler** |

---

## 6. Known gaps / discrepancies

1. Registration backend is **not implemented** (`POST /api/register` → 404).
2. `captcha` is required but there is no captcha provider and the "get code" button is inert.
3. `confirm` is validated on the client but sent to the server (which does not exist).
4. No email activation flow exists; the result page text is static.
5. Passwords would be sent in plaintext here (unlike login, which sends MD5) — a decision to be
   made before implementing the backend.

---

## 7. How to extend (recommended shape)

1. Add `export const register = ...` (or a `publicRegister` function) to
   `bls-server/src/api/auth/index.ts` so the router auto-registers it. Remember: names starting
   with `public` skip `jwtAuth`.
2. Resolve the tenant from the domain exactly like login.
3. Validate with Zod: `email` (format), `password` (6–100), `mobile` (11 digits), `captcha`.
4. Insert into `sys_user` with `status='1'` (pending) or `'0'` depending on the product decision,
   Argon2id-hashed password, tenant id and a snowflake id.
5. Add a rate-limit rule (by IP) and keep the default replay nonce rule.
6. Point the frontend service at `/api/auth/register` and add the path to the
   `isRefreshSkippedUrl` list (already listed).
7. Update this document.
