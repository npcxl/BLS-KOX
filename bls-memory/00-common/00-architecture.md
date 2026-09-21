# 00 — Architecture & Request Pipeline (shared)

> **Document version:** 1.3.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the `4001x`/`50301` captcha error codes, the router sub-directory recursion
> and the envelope-less `/api/auth/captcha/challenge` exception were verified against `753d86a` +
> uncommitted captcha changes.

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
12b. operationLogMiddleware()     // 阶段五：所有写操作 → sys_operation_log（在安全中间件之后）
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
| 40301 | Package entitlement missing (phase 3) — `EntitlementError`, HTTP 403 |
| 40905 | Quota exceeded (phase 3) — `QuotaExceededError`, HTTP 409 |
| 40010 | `CAPTCHA_REQUIRED` — login captcha is enabled but `captchaToken` is missing (`CaptchaRequiredError`, HTTP 400) |
| 40011 | `CAPTCHA_INVALID` — unknown token or binding mismatch (`CaptchaInvalidError`, HTTP 400) |
| 40012 | `CAPTCHA_EXPIRED` — captchaToken timed out (`CaptchaExpiredError`, HTTP 400) |
| 40013 | `CAPTCHA_REPLAYED` — captchaToken already consumed (`CaptchaReplayedError`, HTTP 400) |
| 50301 | `CAPTCHA_SERVICE_UNAVAILABLE` — Redis unavailable / provider not configured (`CaptchaUnavailableError`, HTTP 503) |

`4001x` / `50301` responses also carry `details.errorCode` with the string constant, so the
frontend can branch on either the number or the name.

> Note: `40101` is reused by the Session Center (`SessionInvalidError`) to mean
> "session revoked, please log in again". The frontend treats `code === 40101` on HTTP 401
> as "session invalid" and forces re-login.

---

## 4. Koa router auto-scan (`bls-server/src/core/router.ts`)

A root router with prefix `/api` is created, then `scanAndRegister()` walks `src/api/**`.
Only `index.ts` files are loaded (`*.model.ts`, `*.schema.ts`, tests are skipped).

The scanner **always recurses into sub-directories** (it used to skip them when the parent had an
`index.ts`). This is what lets `src/api/auth/index.ts` (function routes) and
`src/api/auth/captcha/index.ts` (a custom router mounted at `/auth/captcha`) coexist. Keep the
convention when adding a nested module: the child's own `new Router({ prefix: '/<parent>/<child>' })`
must carry the full path after `/api`, exactly like `api/system/config`.

Three registration modes:

| Module exports | Result |
|---|---|
| `export default <Koa Router>` only | Custom endpoints only. Mounted under `/api/<dir>`. Response `data`/`rows` are snake→camel converted by `wrapCamel()`. |
| `export default <Koa Router>` **and** `export const config = …` | **Mixed mode**: custom router first (its matches win), then `defineCrudModule(config)` fills the standard CRUD endpoints. |
| `export const config = …` (no default router) | Every other lowercase exported function is auto-registered as a route; method is inferred from the name (`getX`→GET, `addX`/`createX`/`saveX`→POST, `updateX`/`editX`→PUT, `deleteX`/`removeX`→DELETE); camelCase→kebab-case path. Then `defineCrudModule` is mounted. |

`config` is whatever the module exports — either the legacy object literal
(`{ table, pkField, createFields, … }`) or the value returned by `defineCrudConfig({ … })`
(config style, §5). `wrapCamel()` is applied to the custom router **once** (a second call would
create a second Router instance and split `routes()` from `allowedMethods()`).

Auto-auth rule when auto-registering functions: a function is **public** (no `jwtAuth`) if its
name is one of `login`, `logout`, `refresh`, or starts with `public`/`Public`. Everything else
gets `jwtAuth()`.

**A bad CRUD config aborts startup.** `defineCrudConfig()` (and `defineCrudModule()`) validate the
module while the scanner loads it; `core/router.ts` re-throws `CrudConfigError` with the module path
prefix instead of only logging a warning. A mis-configured module (illegal table/column identifier,
`enum` without `values`, `add`/`edit` enabled with no writable field, unresolvable status field, …)
therefore prevents the process from starting, and the message names the module path, table and field.

`/api/v1/auth/login` is transparently rewritten to `/api/auth/login`, so versioned and
unversioned paths behave identically. Non-`v1` `/api/*` responses carry
`Deprecation: true` and a `Sunset` header.

---

## 5. Generic CRUD factory (`bls-server/src/core/{crud,crud-config,crud-keys}.ts`)

Two equivalent declaration styles. **Config style** (`defineCrudConfig`) makes `fields` the single
source of truth and derives every whitelist, the search/filter behaviour, the response projection,
the Zod validation and the OpenAPI schema; the **legacy array style** keeps working unchanged.

> The config-style factory described here is committed as **`9b22800`** (`core/crud-config.ts`,
> `core/crud-keys.ts`, `core/crud.ts`, `core/router.ts`, `scripts/generate-openapi.ts`,
> `openapi.json`). See `CHANGELOG.md` 1.3.0/1.3.1.

### 5.1 Config style (recommended) — one file per standard module

```ts
// bls-server/src/api/business/product/index.ts  →  /api/business/product/*
export const config = defineCrudConfig({
  table: 'biz_product',
  pkField: 'product_id',
  name: '商品',
  permPrefix: 'business:product',
  fields: {
    product_name: { type: 'string', required: true, create: true, update: true, search: true, maxLength: 100 },
    category_id:  { type: 'string', create: true, update: true, filter: true },
    price:        { type: 'number', required: true, create: true, update: true, min: 0 },
    status:       { type: 'enum', values: ['0', '1'], create: true, update: true, filter: true, status: true },
    secret_key:   { type: 'string', create: true, update: true, select: false },
    create_time:  { type: 'datetime', select: true },
    update_time:  { type: 'datetime', select: true },
  },
  createDefaults: { status: '0' },
});
```

`fields` keys are **database column names (snake_case)**. Requests accept `snake_case` **and**
`camelCase`; responses are always camelCase. The directory path is the API prefix — no router code
is needed.

### 5.2 What `fields` derives

| Derived | From |
|---|---|
| `createFields` | `create: true` |
| `updateFields` | `update: true` |
| `searchFields` (keyword LIKE) | `search: true` |
| `filterFields` (exact query match) | `filter: true` |
| response projection (list + detail) | every field with `select !== false`, **plus the primary key** |
| `statusField` | the single field with `status: true` |
| Zod `create` / `update` | `type` + `required` + `nullable` + `min`/`max`/`minLength`/`maxLength`/`values` |
| OpenAPI request/response fields | `fields` (+ `actions`) |

### 5.3 Field options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `type` | `string \| number \| integer \| boolean \| enum \| datetime \| json` | **required** | drives Zod + OpenAPI |
| `values` | `string[]` | — | `enum` only, must be non-empty (and is rejected on other types) |
| `required` | `boolean` | `false` | required on create |
| `nullable` | `boolean` | `false` | explicit `null` allowed (distinct from "optional") |
| `create` / `update` | `boolean` | `false` | write whitelists |
| `search` / `filter` | `boolean` | `false` | keyword LIKE / exact query whitelist |
| `select` | `boolean` | `true` | `false` ⇒ the column never appears in list/detail (secrets) |
| `status` | `boolean` | `false` | marks the field used by `PUT /status` (at most one per module) |
| `min` / `max` | `number` | — | `number` / `integer` range |
| `minLength` / `maxLength` | `number` | — | `string` length |
| `default` | `unknown` | — | server-side default applied on create (trusted config) |
| `description` | `string` | — | OpenAPI description |

### 5.4 Module options

| Option | Default | Meaning |
|---|---|---|
| `table`, `pkField` | — | required; must be valid SQL identifiers |
| `fields` | — | single field source (§5.2/§5.3) |
| `actions` | all `true` | `{list, detail, add, edit, remove, status}` — a disabled endpoint is **not registered at all** |
| `createDefaults` | — | `object` or `(ctx) => object`; server-trusted create defaults |
| `unknownFields` | `'ignore'` | `'ignore'` = silently drop undeclared body keys; `'reject'` = 400 listing them |
| `tenantField` | `tenant_id` | tenant column; `globalTable: true` opts out of tenant filtering |
| `statusField` | `fields.status` or `status` | status column |
| `softDelete` | `true` | remove sets `deleted = 1`; every read filters `deleted = 0` |
| `orderBy` | pk desc | list sort column |
| `permPrefix` | — | each action requires `${permPrefix}:${action}` via `hasPerm()` (detail reuses `:list`) |
| `schema` | generated from `fields` | explicit Zod schemas, which win over generation |
| `dataScope` | off | `ALL/TENANT/DEPT/DEPT_AND_CHILDREN/SELF/CUSTOM` column mapping |
| `transactional` | `false` | wrap writes in a Kysely transaction |
| `onWrite` / `onTransactionCommitted` | — | run only **after** a successful write (after commit when transactional) |

Legacy array style (`createFields` / `updateFields` / `searchFields` / `filterFields` / `schema`)
is still supported. When both styles are present the **explicit array / schema wins**, and an array
entry that `fields` does not declare is a startup error. A config with **no** `fields` keeps the old
behaviour (projection = `selectAll`, no generated Zod).

### 5.5 Generated endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/list` | `${permPrefix}:list` | `pageNum`/`pageSize` (max 100), `keyword` LIKE, whitelist exact filters, response projection |
| GET | `/:id` | `${permPrefix}:list` | tenant + `deleted = 0` + data scope; 404 when absent |
| POST | `/add` | `${permPrefix}:add` | Zod, write whitelist, Snowflake PK, server-side tenant |
| PUT | `/edit` | `${permPrefix}:edit` | PK required, business fields partial; 0 rows → 404 |
| DELETE | `/remove` | `${permPrefix}:remove` | body `{ ids: [] }`; every id must be visible or the whole call → 404 |
| PUT | `/status` | `${permPrefix}:status` | value validated against the declared enum when present; 0 rows → 404 |

### 5.6 Security behaviour (identical for both styles)

- Tenant, soft-delete and data-scope conditions are built once by `applyScope()` and re-applied on
  the connection that actually executes the query (transaction or not) — switching to `trx` can
  never drop them.
- `tenant_id` is always injected server-side from the request context; a body `tenantId` /
  `tenant_id` is deleted, and a missing tenant context fails closed on multi-tenant tables.
- Audit fields (`create_by`, `create_time`, `update_by`, `update_time`) are **never** writable from
  a request body — only `createDefaults` (server-trusted) may set them.
- `deleted` and the primary key are server-controlled on create.
- Unknown fields are dropped (or rejected with `unknownFields: 'reject'`), so mass assignment and
  "any query param as a column name" are both impossible.
- 0 affected rows on edit/remove/status (and a missing row on detail) → **404**.
- `onWrite` / `onTransactionCommitted` never run on a 404 or after a rollback.
- `error-handler.ts` maps errors to the standard envelope (§3).

### 5.7 Configuration is validated at startup

`defineCrudConfig()` validates while the module is loaded (= route scan) and **fails application
startup**; `core/router.ts` re-throws the `CrudConfigError` prefixed with the module path, so the
log names the module, table and field. Checks include:

- identifier syntax for `table`, `pkField`, `tenantField`, `statusField`, `orderBy`, every `fields`
  key and every `createDefaults` key;
- `enum` ⇒ non-empty `values`; no `values` on other types;
- `min`/`max` only on `number`/`integer`, `minLength`/`maxLength` only on `string`, `min <= max`;
- system fields (`tenant_id`, `deleted`, `create_by`, `create_time`, `update_by`, `update_time`)
  must not be opened for `create`/`update`;
- at most one `status: true`; `actions.status` requires a resolvable status field;
- `actions.add` / `actions.edit` require at least one create / update field;
- `createDefaults` may only reference declared fields or system fields.

> Behaviour change: a config with no writable field (no `fields`, no `createFields`/`updateFields`)
> used to fail at request time; since 1.3.0 it fails at startup. Declare a read-only module with
> `actions: { add: false, edit: false, remove: false, status: false }`.

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

## 6b. Production startup guards (phase 7)

`config/env.ts` refuses to boot in production when any of these is wrong:

| Requirement | Reason |
|---|---|
| `REDIS_ENABLED=true` | sessions, nonce/replay, rate limiting and idempotency all depend on Redis |
| `SECRET_ENCRYPTION_KEY` (base64, 32 bytes) | sensitive columns are stored with AES-256-GCM envelope encryption |
| `JWT_SECRET` / `DB_PASSWORD` / `CORS_ORIGINS` / `API_SIGN_SECRET` / `INTERNAL_SECRET` / `CAPTCHA_SECRET` | no placeholders (`CHANGE_TO_*`), no weak defaults |
| `INTERNAL_IP_ALLOWLIST` | must be valid CIDR / IP entries, otherwise startup fails |

Environment switches introduced in phase 7 (both default to `false` in production):

| Env | Default (prod / dev) | Effect |
|---|---|---|
| `METRICS_PUBLIC` | `false` / `true` | when false, `GET /api/metrics` returns 404; use `/internal/metrics` |
| `API_DOCS_ENABLED` | `false` / `true` | when false, `GET /api/docs` and `/api/openapi.json` return 404 |

**Unit tests never touch MySQL or Redis**: `core/database.ts` creates its pools lazily (module import
is side-effect free) and the Redis client is created with `lazyConnect`. Use
`npm run test:integration` (with `INTEGRATION_TEST=true`) for tests that really need a database.

**Migrations are serialised**: `scripts/migrate.ts` takes a MySQL advisory lock
(`GET_LOCK('bls_kox_migration', MIGRATION_LOCK_TIMEOUT)`) before applying files, so N instances can
start at once without racing.

**Backups** (`scripts/backup.ts`): each dump gets a `.sha256` sidecar, retention is `BACKUP_KEEP`
(default 30), `--verify` restores into a throwaway database and compares table counts, and
`--upload` (or `BACKUP_UPLOAD_ENABLED=true` + `BACKUP_S3_*`) pushes the file to MinIO/OSS/S3.

---

## 7. Verify after change

```powershell
# frontend
cd bls-admin; npm run tsc; npm run test

# Koa backend
cd bls-server; npm run lint; npm run test; npm run build; npm run openapi; npm run openapi:check
# integration tests need a real MySQL + Redis (CI does this):
#   mysql < sql/Init.sql && npm run db:migrate up && INTEGRATION_TEST=true npm run test:integration

# Java backend
cd bls-java-server; mvn test

# if the DB changed
#   -> update sql/Init.sql and check docs/ for the related document
```

Notes:

- `npm run lint` is `tsc --noEmit`; `npm run build` writes `dist/` (so `node dist/...` works when
  `tsx` is blocked by the sandbox: `node dist/scripts/generate-openapi.js`).
- **Node ≥ 22 is required** (`bls-server/package.json` → `engines`, repo-root `.nvmrc`, `Dockerfile`
  `node:22-alpine`, `kysely` 0.29 `engines`). On a machine whose default `node` is older, put a
  Node 22 binary first on `PATH` before running the commands.
- **The server fails fast on an unsupported runtime.** `core/runtime-guard.ts` runs
  `assertSupportedRuntime()` at the top of `app.ts` and probes the Node major version plus the
  globals the stack actually needs (`Array#toSorted`/`toReversed`, `Object.groupBy`,
  `structuredClone`, `ReadableStream`, `fetch`). On an old Node the process printed only
  `TypeError: arr.toSorted is not a function` from the worker/outbox poll loops (Kysely's query
  compiler uses `toSorted`) and `ReferenceError: ReadableStream is not defined`, while still
  listening on its port — now it prints an actionable message (module + required version + `nvm use`
  / Docker fix) and exits with code 1 **before** the HTTP server listens. `exit` is `true` only when
  the module is the process entry point, so importing `app.ts` (tests) never kills the runner.
  Tests: `core/__tests__/runtime-guard.test.ts`.
- `npm run openapi` regenerates and commits `bls-server/openapi.json`; run it whenever a route,
  parameter or permission changes.
- Unit tests are self-contained (in-memory Kysely test double in
  `bls-server/src/core/__tests__/fake-db.ts`); they do **not** need MySQL/Redis. Integration
  behaviour against a real database is not covered by them.

---

## 8. Where to look next

- Cross-cutting security: `00-common/01-redis.md`, `02-replay-protection.md`,
  `03-rate-limiting.md`, `04-auth-and-permissions.md`,
  `05-security-log-and-event-center.md`, `06-file-and-excel-security.md`.
- CRUD factory long-form reference: `docs/crud.md` (config style, field table, priority rules,
  standard-vs-complex module boundary) and `docs/backend-koa.md`.
- Legacy long-form docs: `docs/index.md`, `docs/security.md`,
  `docs/multi-tenant.md`, `docs/auth.md`, `docs/backend-java.md`.
- Database schema: `.codex/skills/bls-kox/references/database-schema.md` and `sql/Init.sql`.
