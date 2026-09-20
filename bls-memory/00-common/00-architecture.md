# 00 — Architecture & Request Pipeline (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

This document describes the parts of BLS-KOX that every page depends on.
Read it once; page documents assume it.

---

## 1. Modules and ports

| Module | Tech | Dev port | Notes |
|---|---|---|---|
| `bls-admin` | React 19, Ant Design Pro 6, UmiJS Max | 9000 | Admin UI |
| `bls-server` | Koa 3, TypeScript, Kysely, Zod | 6001 (Docker 7001) | Main backend |
| `bls-java-server` | Spring Boot 3.3.5, Java 21, MyBatis-Plus | 8080 | Alternative backend, same API contract |
| `bls-ai-service` | Node + TS | Docker 7201 | SSE chat, OCR, model provider |
| `bls-event-service` | Node + TS | Docker 7101 | Optional event/audit service |
| MySQL 8.0 / Redis 7 / MinIO | infra | — | Shared |

Only **one** backend (Koa or Java) runs at a time. Switch by editing
`bls-admin/config/proxy.ts` (dev) or the Nginx `upstream` (prod).

### Nginx path split (prod)

```
/api/ai/chat/conversations   -> bls-server:7001     (conversation CRUD)
/api/ai/                     -> bls-ai-service:7201 (SSE chat, models, OCR)
/api/                        -> bls-server:7001
/ws/realtime                 -> bls-server:7001 (WebSocket)
/files                       -> MinIO / static files
```

---

## 2. Koa request pipeline (middleware order)

`bls-server/src/app.ts` `createApp()` registers, in order:

```
1.  errorHandler
2.  helmet (CSP, frame-ancestors none)
3.  cors (credentials: true; origin allow-list in production)
4.  koaBody({ multipart: true, formidable: { multiples: false } })
5.  bodyParser({ enableTypes: ['json', 'form'] })
6.  traceMiddleware()            // distributed trace id
7.  requestContextMiddleware     // AsyncLocalStorage: requestId, tenantId, userId, clientIp
8.  httpMetricsMiddleware
9.  tenantMiddleware             // verifies JWT, sets tenant context (never trusts client tenant id)
10. replayProtectionMiddleware() // timestamp + nonce + signature + idempotency
11. blockedIpMiddleware()        // Redis + sys_ip_blacklist
12. rateLimitMiddleware()        // Redis INCR + EXPIRE
13. api version rewrite          // /api/v1/* -> /api/*
14. apiVersion()
15. router.routes()
16. router.allowedMethods()
17. Swagger UI:      GET /api/docs, GET /api/openapi.json
18. /openapi/v1/*    -> openApiAuth() (API Key + HMAC + Timestamp + Nonce)
19. /internal/*      -> internalAuth()  (Service token + IP allow-list); /internal/health, /internal/metrics
```

Important consequences:

- **Replay, IP block and rate limit are global** — they run before routing, so they apply to
  every `/api/*` route automatically. A page never needs to add them by hand.
- `/internal/*` and `/openapi/v1/*` are **separate mounts** with their own auth.
- Because replay protection runs *before* routing, a request missing `X-Timestamp`/`X-Nonce`
  on a write endpoint is rejected even if the route does not exist.

---

## 3. Response envelope

All business endpoints return:

```json
{ "code": 200, "message": "操作成功", "data": <any>, "total": <number, only for paged lists> }
```

- `code = 200` means success. Non-200 is a business error.
- HTTP status is usually also set (401/403/404/409/429/500).
- Pagination request params: `pageNum` (1-based) and `pageSize` (**max 100**).
- Errors are produced by `bls-server/src/core/errors.ts` and formatted by
  `bls-server/src/middleware/error-handler.ts`.
- Security middleware (replay/rate-limit/IP-block) bypasses the error handler and writes
  the body directly, e.g. `{ code: 42901, message: '请求过于频繁，请稍后再试', data: null }`.

Special security error codes:

| Code | Meaning |
|---|---|
| 40101 | Timestamp missing / session invalid (context dependent — see note) |
| 40102 | Timestamp format invalid |
| 40103 | Timestamp expired |
| 40104 | Nonce missing or invalid format |
| 40105 | Signature missing |
| 40106 | Signature invalid |
| 40901 | Replay detected (nonce already used) → event `NONCE_REPLAY` |
| 40902 | Idempotency-Key missing |
| 40903 | Same Idempotency-Key still processing |
| 40904 | Same Idempotency-Key with different body (conflict) |
| 42901 | Rate limit exceeded |

> Note: `40101` is reused by the Session Center (`SessionInvalidError`) to mean
> "session revoked, please log in again". The frontend treats `code === 40101` on HTTP 401
> as "session invalid" and forces re-login.

---

## 4. Koa router auto-scan (`bls-server/src/core/router.ts`)

A root router with prefix `/api` is created, then `scanAndRegister()` walks `src/api/**`.
Only `index.ts` files are loaded (`*.model.ts`, `*.schema.ts`, tests are skipped).

Three registration modes:

| Module exports | Result |
|---|---|
| `export default <Koa Router>` only | Custom endpoints only. Mounted under `/api/<dir>`. Response `data`/`rows` are snake→camel converted by `wrapCamel()`. |
| `export default <Koa Router>` **and** `export const config = { table, pkField, ... }` | **Mixed mode**: custom router first, then `defineCrudModule(config)` fills the standard CRUD endpoints. |
| `export const config = { table, pkField, ... }` (no default router) | Every other lowercase exported function is auto-registered as a route; method is inferred from the name (`getX`→GET, `addX`/`createX`/`saveX`→POST, `updateX`/`editX`→PUT, `deleteX`/`removeX`→DELETE); camelCase→kebab-case path. Then `defineCrudModule` is mounted. |

Auto-auth rule when auto-registering functions: a function is **public** (no `jwtAuth`) if its
name is one of `login`, `logout`, `refresh`, or starts with `public`/`Public`. Everything else
gets `jwtAuth()`.

`/api/v1/auth/login` is transparently rewritten to `/api/auth/login`, so versioned and
unversioned paths behave identically. Non-`v1` `/api/*` responses carry
`Deprecation: true` and a `Sunset` header.

---

## 5. Generic CRUD factory (`bls-server/src/core/crud.ts`)

`defineCrudModule(config)` generates:

| Method | Path | Purpose |
|---|---|---|
| GET | `/list` | Paged list |
| GET | `/:id` | Single row |
| POST | `/add` | Create |
| PUT | `/edit` | Update |
| DELETE | `/remove` | Delete (soft by default) |
| PUT | `/status` | Change status |

Key config fields and security behaviour:

- `table`, `pkField` — required.
- `tenantField` (default `tenant_id`), `globalTable: true` to opt out of tenant filtering.
- `softDelete` (default **true**) → sets `deleted = 1`; all reads filter `deleted = 0`.
- `statusField` (default `status`), `orderBy` (default pk desc).
- `searchFields` — keyword LIKE whitelist. `filterFields` — exact-match query whitelist
  (no filterFields ⇒ arbitrary query params are never used as column names).
- `createFields` / `updateFields` — write whitelists. Unknown fields are silently ignored.
- System fields are **never** writable: `tenant_id`, `deleted`, `create_by`, `create_time`,
  `update_by`, `update_time`.
- `permPrefix` → each action requires `${permPrefix}:${action}` via `hasPerm()`.
- `schema: { create, update }` — Zod schemas (also used to derive the whitelist).
- `dataScope` — off by default; can map to `ALL/TENANT/DEPT/DEPT_AND_CHILDREN/SELF/CUSTOM`.
- `transactional` (default false) — wrap writes in a transaction.
- `onWrite` / `onTransactionCommitted` — run **after** a successful write (cache purge, events).
- Tenant id is always injected server-side; `tenant_id` from the request body is deleted.
- Affected-row count of `0` on edit/remove → **404** (not found in this tenant / data scope).
- `error-handler.ts` maps errors to the standard envelope.

---

## 6. Hard project rules

- **Tenant isolation**: every multi-tenant table must filter by `tenant_id`. The platform
  tenant id is the string **`000000`** (not the number `0`) and has cross-tenant power.
- **Soft delete**: `deleted` is `tinyint`, `0` = alive, `1` = deleted. List/edit/delete
  queries must filter `deleted = 0`.
- **Status**: `status` is `char(1)`, `0` = enabled/normal, `1` = disabled.
- **Naming**: DB columns `snake_case`; TS/Java variables `camelCase`; files/dirs `kebab-case`.
- **Time columns**: always `create_time` / `update_time`. Sort order column is `sort_num`.
- **Primary keys**: Snowflake-generated `varchar(32)` strings (`generateSnowflakeId()`);
  seed rows may use short ids like `000001`.
- **Passwords**: Argon2id (`bls-server/src/shared/utils/password.ts`). Never store plaintext.
  The frontend hashes the password with **MD5 before sending** (legacy contract); the stored
  value is `argon2id(md5(password))`.
- **Secrets**: copy from `.env.example` / `.env.docker.example`, replace every `CHANGE_TO_*`.
- **API compatibility**: when changing an API, change **both** backends to keep path, method,
  params, response fields, permission code, pagination and error behaviour identical.

---

## 7. Verify after change

```powershell
# frontend
cd bls-admin; npm run tsc; npm run test

# Koa backend
cd bls-server; npm run lint; npm run test

# Java backend
cd bls-java-server; mvn test

# if the DB changed
#   -> update sql/Init.sql and check docs/ for the related document
```

---

## 8. Where to look next

- Cross-cutting security: `00-common/01-redis.md`, `02-replay-protection.md`,
  `03-rate-limiting.md`, `04-auth-and-permissions.md`,
  `05-security-log-and-event-center.md`, `06-file-and-excel-security.md`.
- Legacy long-form docs: `docs/index.md`, `docs/crud.md`, `docs/security.md`,
  `docs/multi-tenant.md`, `docs/auth.md`, `docs/backend-koa.md`, `docs/backend-java.md`.
- Database schema: `.codex/skills/bls-kox/references/database-schema.md` and `sql/Init.sql`.
