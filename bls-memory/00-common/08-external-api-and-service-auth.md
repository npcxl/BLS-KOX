# 08 — API Surface, Versioning & Service Auth (shared)

> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 9b22800 · **Last verified:** 2026-09-20

How every request can reach the Koa backend, and how each entry point is authenticated.
Also covers error formatting, HTTP metrics labels, Swagger and the OpenAPI generator.

Files: `bls-server/src/app.ts`, `bls-server/src/core/router.ts`,
`bls-server/src/middleware/{api-version,openapi-auth,internal-auth,error-handler,http-metrics}.ts`,
`bls-server/src/core/errors.ts`, `bls-server/src/scripts/generate-openapi.ts`.

---

## 1. Four entry points

| Prefix | Auth | Rewrite | Purpose |
|---|---|---|---|
| `/api/**` | per-route `jwtAuth()` + `hasPerm()` | — | The admin frontend. Also gets `Deprecation` / `Sunset` headers (see §2). |
| `/api/v1/**` | same as `/api` | `/api/v1/x` → `/api/x` | Versioned alias of the same routes. No deprecation headers. |
| `/openapi/v1/**` | `openApiAuth()` — API Key + HMAC + Timestamp + Nonce | `/openapi/v1/x` → `/api/x` | Planned external/partner API. **Currently always 403 — see §4.** |
| `/internal/**` | `internalAuth()` — service token + IP allow-list | none (only 2 routes) | Service-to-service: `GET /internal/health`, `GET /internal/metrics`. |

Plus unauthenticated infrastructure routes on the main router
(`bls-server/src/core/router.ts`):

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/health` | `{status:'ok'}` |
| GET | `/api/metrics` | Prometheus exposition (`metricsRegistry.contentType` / `metrics()`). **Not authenticated.** |
| GET | `/api/ready` | readiness probe |

and the docs routes (`app.ts`): `GET /api/docs` (Swagger UI HTML) and
`GET /api/openapi.json` (serves `bls-server/openapi.json`; 404 body
`{error:'openapi.json not found. Run: npm run openapi'}` when absent).

---

## 2. Versioning (`middleware/api-version.ts` + `app.ts`)

```ts
export const API_PREFIXES = { V1: '/api/v1', OPENAPI_V1: '/openapi/v1', INTERNAL: '/internal' };
```

Request order in `app.ts`:

1. `ctx.state.originalPath = ctx.path` — saved before any rewrite.
2. `/api/v1/*` → `ctx.path = '/api' + ctx.path.slice(7)` (transparent rewrite).
3. Any `/api/*` that is **not** `/api/v1/*` gets
   `Deprecation: true` and `Sunset: <now + 180 days, ISO>`.
4. `apiVersion()` sets `ctx.state.apiVersion` to `'v1' | 'openapi_v1' | 'internal'`
   (anything else falls back to `'v1'`). It does **not** reject anything.

⚠ Because rule 3 matches any `/api/*`, the infrastructure routes `/api/docs`, `/api/metrics`
and `/api/health` also carry `Deprecation` / `Sunset` headers. Harmless, but do not be surprised.

Use `/api/v1/...` for anything you want to survive a future breaking change; the unversioned
paths keep working and are what the frontend calls today.

---

## 3. `internalAuth()` — service-to-service

Applied only to the `/internal` mount. Consumed env:

| Env | Default | Notes |
|---|---|---|
| `INTERNAL_SECRET` | (empty) | Shared secret between `bls-server`, `bls-event-service` and `bls-ai-service`. |
| `INTERNAL_IP_ALLOWLIST` | `127.,10.,172.16.`…`172.31.,192.168.` | Comma-separated **string prefixes**, not real CIDR. |
| `NODE_ENV` | — | Switches strictness. |

Behaviour:

1. **IP check** — `ip.startsWith(prefix)` after stripping a leading `::ffff:`.
   Production + not allowed → `403 {code:403, message:'Internal access denied: IP not allowed'}`.
   Development → debug-log and continue.
2. **Secret presence** — `INTERNAL_SECRET` is resolved **once at module load**
   (`const INTERNAL_SECRET = getInternalSecret()`):
   - missing + production → **throws at startup** (`INTERNAL_SECRET is required in production`);
   - missing + dev → warn, `''`;
   - production + a `DEMO_ONLY_CHANGE_ME_*` or `CHANGE_TO_*` or `change_me_internal` /
     `please_change_me` value → **throws at startup**.
   If it resolves empty → `500 {code:500, message:'INTERNAL_SECRET is not configured'}`.
3. **Token** — `X-Internal-Token` header **or** `Authorization: Bearer <token>`.
   Missing → `401 {code:401, message:'Missing internal token'}`.
4. **Compare** — `sha256(secret) !== sha256(token)` → `403 {code:403, message:'Invalid internal token'}`.
   (The code comments claim a constant-time comparison; it is a plain digest `!==`.)
5. Success → `ctx.state.internal = true`.

Clients that call this: `bls-ai-service` (model config internal-list, usage reporting),
`bls-event-service`, and any internal tooling. Note that any request carrying
`X-Internal-Secret` **bypasses the replay-protection middleware** (see
`00-common/02-replay-protection.md` §3).

---

## 4. `openApiAuth()` — the external/partner API (**currently non-functional**)

Headers (all required): `X-Api-Key`, `X-Timestamp`, `X-Nonce`, `X-Signature`.
`NONCE_WINDOW_SECONDS = 300`.

Flow:

| Step | Failure response |
|---|---|
| 1. any header missing | `401 {code:401, message:'Missing openapi auth headers'}` |
| 2. `abs(now - X-Timestamp) > 300` (or unparsable) | `401 {code:401, message:'Timestamp expired or invalid'}` |
| 3. nonce replay: Redis `openapi:nonce:{nonce}` exists | `401 {code:401, message:'Nonce already used'}` |
| 4. `sys_api_key` lookup (`status='0'`) | `403 {code:403, message:'Invalid API Key'}` |
| 5. signature mismatch | `403 {code:403, message:'Invalid signature'}` |
| 6. success | `ctx.state.openApi = { apiKey }` |

- Nonce dedup: `SET openapi:nonce:{nonce} EX 300`. If Redis is unavailable the check is
  **skipped** (fail-open).
- Signature string: `` `${METHOD}:${PATH}:${TIMESTAMP}:${NONCE}:${BODY}` `` where
  `PATH = ctx.state.originalPath ?? ctx.path` and
  `BODY = ctx.request.rawBody ?? JSON.stringify(ctx.request.body ?? '')`,
  hashed with `HMAC-SHA256(apiSecret)` as hex, compared with plain `!==`.

### ⚠ Blocking defect

**There is no `sys_api_key` table, no model and no management endpoints anywhere in the repo.**
`sql/Init.sql` and every file in `bls-server/migrations/` were checked. The only references are
the query in `openapi-auth.ts` and the Rust port. Consequently step 4 throws
(`table doesn't exist` → caught, logged `[openapi-auth] db query failed`, `secret` stays `null`),
so **every** `/openapi/v1/*` request ends as `403 Invalid API Key`.

Related dead code: `SecurityEventType.API_KEY_CREATED` / `API_KEY_REVOKED` and their risk-level
entries exist in `core/security-audit.ts` but are **never emitted**.

To make the external API usable you must: create the `sys_api_key` table
(`api_key`, `api_secret`, `tenant_id`, `name`, `status`, `expire_at`, …), add CRUD endpoints with
a new permission code (`system:apikey:*`), seed the permission, emit
`API_KEY_CREATED` / `API_KEY_REVOKED` on create/revoke, and document the client-side signing
recipe (`METHOD:PATH:TIMESTAMP:NONCE:BODY`) — which is **different** from the browser replay
canonical string used internally.

---

## 5. Error formatting (`middleware/error-handler.ts`, `core/errors.ts`)

- Route not matched → `ctx.status = 404`, body `{code:404, message:'接口不存在'}`.
- Thrown errors → `{code, message, details?, stack?}`. `stack` is included only when
  `env.nodeEnv === 'development'` **and** the error is not an `AppError`.
  Non-`AppError` values are coerced to `new AppError('服务器内部错误')` (500).
  The error is also forwarded to `app.emit('error', …)` for logging.
- Error classes:

| Class | HTTP | `code` | Meaning |
|---|---|---|---|
| `UnauthorizedError` | 401 | 401 | not authenticated / bad credentials |
| `SessionInvalidError` | 401 | **40101** | session revoked — the frontend force-logs-out on this code |
| `ForbiddenError` | 403 | 403 | missing permission |
| `NotFoundError` | 404 | 404 | missing, or outside the tenant / data scope |
| `ValidationError` | 400 | 400 | Zod / manual validation failure |
| `ConflictError` | 409 | 409 | uniqueness or reference guard |
| `AppError` (generic) | 500 | 500 | unexpected |

Security middleware (replay, rate limit, IP block) bypasses this handler and writes its own body
(`{code: 40901|42901|403, …}`) — see `00-common/02-replay-protection.md` and `03-rate-limiting.md`.

---

## 6. HTTP metrics labels (`middleware/http-metrics.ts`)

Route label priority:

```ts
ctx._matchedRoute ?? ctx.state?.metricsRoute ?? '/unmatched'
```

`ctx.path` is deliberately **never** used, so cardinality stays bounded. Security middleware
rejection paths pre-set `ctx.state.metricsRoute` to the rule path for the same reason.

Emitted: `httpRequestsTotal{method,route,status}`, `httpRequestDurationSeconds{method,route}`
and `httpRequestErrorsTotal{method,route}` when `ctx.status >= 400`.

`/api/metrics` (unauthenticated) and `/internal/metrics` (service-auth) both expose the same
registry. Metric names are prefixed `bls_kox_*`.

---

## 7. OpenAPI generation (`scripts/generate-openapi.ts`)

```powershell
npm run openapi         # regenerate bls-server/openapi.json
npm run openapi:serve   # serve a mock spec + Swagger UI on OPENAPI_PORT (default 9090)
```

- Output: `bls-server/openapi.json` (OpenAPI 3.0.3, `info.title = 'BLS-KOX API'`,
  servers `http://localhost:6001` and `/api`, `securitySchemes.BearerAuth`).
  Served at runtime by `GET /api/openapi.json`, rendered by `GET /api/docs` (Swagger UI 5).
- Discovery: recursively walks `src/api/**/index.ts`.
  - default Koa router → reads `router.stack` for method + path;
  - permission codes are parsed from the **module source**: every `hasPerm('…')` inside a
    `router.<method>('<path>' …)` block is attached to that path (middleware closures cannot be
    introspected), with a middleware-source fallback;
  - a `config` object additionally synthesises the CRUD routes. Since 1.3.0 it calls the **same**
    `resolveCrudConfig()` the runtime uses (`core/crud-config.ts`), so the generated CRUD docs —
    endpoints, request fields, response projection, required flags and enum descriptions — can
    never drift from the implementation;
  - `actions` on the module config is honoured: a disabled endpoint is **not** documented (it is
    not registered either);
  - `fields` declarations take precedence over raw table columns, and request-body field names are
    emitted **camelCase** (the API contract) rather than as `snake_case` columns. Without `fields`
    the generator falls back to `*.model.ts` interfaces, explicit `createFields`/`updateFields`, or
    the `sql/Init.sql` column list;
  - plain function exports get routes with the method inferred from the function name;
  - request params extracted from TS interfaces, Zod schemas, and source regexes for
    `ctx.request.body/query/params` + `pickAllowed` whitelists;
  - `sql/Init.sql` is resolved relative to the **repo root** (`src/scripts` → `../../../sql/`), so
    table schemas really load (`[openapi] loaded 35 table schemas from Init.sql`);
  - `model.ts`, `*.routes.*`, `*.controller.*`, `*.service.*`, `*.repository.*`, `excel.*`
    are ignored.
  - a module with an invalid CRUD config logs
    `[openapi] <tag> CRUD 配置解析失败（回退原始配置）` and is documented from the raw config —
    the generator never aborts, but such a module would stop the **app** from starting (§5.7 of
    `00-common/00-architecture.md`).
- Current size: **138 paths / 149 operations, 23 tags, 109 request schemas**. Since it is a
  generated artifact, **regenerate it after adding or changing an endpoint** (the repo commits the
  file).

---

## 8. Known gaps

1. **`/openapi/v1` is unusable** — no `sys_api_key` table (`403 Invalid API Key` for all calls);
   `API_KEY_CREATED` / `API_KEY_REVOKED` are never emitted. See §4.
2. **`/api/metrics` is unauthenticated** and exposes the same data as the auth-protected
   `/internal/metrics`. Consider protecting it or dropping it.
3. **Non-constant-time comparisons** in `internalAuth` (sha256 digest `!==`) and `openApiAuth`
   (signature `!==`). Use `crypto.timingSafeEqual` if the threat model requires it.
4. **IP allow-list is prefix string matching**, not CIDR — `10.` also matches `10.1.2.3` *and*
   would match a hostname-ish string starting with `10.`. Acceptable for container networks,
   not for hostile networks.
5. `Deprecation` / `Sunset` headers are attached to every non-`/api/v1` `/api/*` response,
   including `/api/docs`, `/api/metrics`, `/api/health`.
6. `apiVersion()` never rejects an unknown prefix — it silently reports `'v1'`.

---

## 9. How to extend

- **Add a versioned endpoint**: keep writing plain `/api/<module>/<path>`; `/api/v1/...` works
  automatically. Never branch on `ctx.state.apiVersion` in business code.
- **Expose an endpoint to partners**: it is simplest to reuse the existing route under
  `/openapi/v1` (the mount rewrites to `/api`), but first implement §4.
- **Add an internal endpoint**: register it on the `/internal` router in `app.ts` (it is a
  separate `KoaRouter`), not in `src/api/`, otherwise it will be JWT-protected.
- **After any route change**: run `npm run openapi`, and update the owning page document +
  `CHANGELOG.md`.
