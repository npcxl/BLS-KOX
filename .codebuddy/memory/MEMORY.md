# BLS-KOX — Long-term Memory (cross-session)

> Stable, cross-session facts only. Day-to-day detail goes into `YYYY-MM-DD.md`.
> Consolidated 2026-09-21 (captcha section merged, duplicates removed).

## I. Environment & tooling gotchas

- Default `node` is v16 but the project needs **≥22**; usable one:
  `C:\Users\18569\.workbuddy\binaries\node\versions\22.22.2\node.exe` (prepend its dir to `PATH`).
- JDK 21 at `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`; default `mvn` runs JDK 8 →
  set `JAVA_HOME`. `bls-java-server` cannot fetch deps here (Maven Central unreachable,
  `io.jsonwebtoken:jjwt-bom:0.12.6` missing) → `mvn compile/test` fails.
- **Writing any `.sql` file with the IDE edit/write tools can silently fail** — `sql/Init.sql` edits
  are dropped (reports success, nothing on disk), and `bls-server/migrations/*.sql` created with
  `write_to_file` can land as a **0-byte file** (this is how the login-captcha migration got
  committed empty in `753d86a`). Always generate `.sql` with a Node/shell script, then **verify**
  (`git diff sql/Init.sql` / `git status` / read the size) — never trust the tool's success message.
- **ALTCHA (login captcha layer 1) needs a secure context** — its Proof-of-Work uses WebCrypto
  (`crypto.subtle`) and the official code hard-throws `Secure context (HTTPS) required.` when
  `globalThis.isSecureContext === false` (no switch to bypass). So `https://…`, `http://localhost`,
  `http://127.0.0.1` work; `http://<LAN-IP>:3000` cannot solve layer 1 (login is then blocked
  server-side because the token is required). The login flow detects it (`envBlocked` /
  `ENV_UNSUPPORTED`); dev options are localhost, dev-server HTTPS, or
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (debug only). Production must be HTTPS.
- PowerShell caveats: `Get-Content`/`Select-String` decode as ANSI (UTF-8 Chinese → mojibake; judge by
  `git diff`); `node -e "..."` swallows quotes and treats the backtick as an escape char (a regex
  containing a SQL backtick matches nothing — use a temp `.js` file, or `[\x60]`); `findstr` piped
  into other commands fails. Prefer Node scripts or the IDE search tools.
- Rust sources repaired 2026-09-20: literal `?` (`0x3F`) had replaced 96 Chinese strings in
  `bls-rust-server/src/**/*.rs` (1:1 char restore from Koa text; clean at `d6785e0`, read back with
  `git show d6785e0:<file>`), plus 10 pagination `count` queries that swallowed DB errors
  (`unwrap_or(0)` → `.map_err(AppError::from)?`).
- **`bls-server` dependency self-check (2026-09-23)** — one registry
  (`src/observability/service-health.ts`) drives the startup report (printed **right after**
  `server.listen` — it cannot run before: the `bls-realtime-ws` row shares the HTTP port, so an
  earlier probe always reported ECONNREFUSED), `GET /api/ready` (200 + `degraded` / `503` only for core deps), internal
  `GET /internal/services`, and `npm run services:check`. Exactly **6** deps: mysql/redis (core),
  Koa's own `bls-realtime-ws` (conditional, WebSocket handshake probe), event-service/ai-service
  (optional, `EVENT_SERVICE_URL`/`AI_SERVICE_URL`), captcha-service (conditional, `TIANAI_BASE_URL`).
  **Java / Rust backends are drop-in alternatives, not dependencies — the user explicitly rejected
  listing them** (they are not "services Koa needs or integrates with"); likewise MinIO (no config
  source in Koa + port 9000 collides with the frontend dev server).
  `SERVICE_CHECK_STRICT` (prod default true) → refuse to boot when a core dep is down.
  Before touching it: keep `warmup` (dynamic imports / pool init) **outside** the timed probe —
  otherwise cold `import('kysely')` cost is misreported as "service down" and strict mode refuses
  to start a healthy instance. The report is a single table (no summary line / no hints section),
  CJK-width aware, target cell colored green/red (TTY only).
- **Never start a temporary `bls-server` on port 6001** to "test the boot": it races the user's
  `tsx watch` child (`EADDRINUSE on WebSocketServer`) and can kill their dev server. Use
  `APP_PORT=6009 npx tsx src/app.ts`, then kill the exact new node PIDs (diff before/after) —
  never by process name.

## II. Login captcha — unified ticket model (consolidated 2026-09-22)

The server alone decides everything; the browser only talks to Koa (the Java Tianai service is never
exposed). Two layers: layer 1 = ALTCHA invisible Proof-of-Work, layer 2 = **Tianai**
(`blockPuzzle` / `clickWord`, separate Java service proxied by Koa). ALTCHA's `display="standard"`
widget is **not** a second layer.

- Endpoints: `GET /api/captcha/config` → `{enabled, primaryProvider, fallbackProvider, tianaiEnabled,
  generateUrl, verifyUrl, fieldName}` (uppercase `ALTCHA`/`TIANAI`; no thresholds, no policy reasons);
  `POST /api/captcha/generate` → `{provider, challenge, sessionId?, expiresAt}`;
  `POST /api/captcha/verify` → `{status:'passed'|'failed'|'technical_error', provider, captchaTicket?,
  expiresAt?, reason?, requireFallback?, nextProvider?, escalationGrant?, escalationExpiresAt?}`.
  No `requiredStage`, no `mode` — both concepts were deleted.
- **`POST /api/auth/login` only accepts `captchaTicket`** (`captcha:ticket:{sha256(ticket)}`,
  GETDEL one-shot) and never trusts a provider result directly. `captchaToken` is the old name.
  Redis keys and used-markers only ever contain `sha256(ticket)`.
- Frontend may send only: `scene` / `provider` (intent) / `username` / `payload` (ALTCHA) /
  `sessionId` + `data` (Tianai) / `escalationGrant`. Ticket contents and the verdict are
  server-decided.
- **Layer 2 is gated by a one-shot escalation grant** (`captcha:escalation:{sha256(grant)}`): only
  `/captcha/verify` issues it, and only when the risk policy decides to escalate;
  `/captcha/generate?provider=TIANAI` must consume it (`GETDEL`) or get `40011`.
- **`captcha_tianai_enabled=false` (default)** = no layer 2; risk hits are only *noted*
  (`CAPTCHA_RISK_NOTED`, LOW). **`=true`** = a risk hit must complete Tianai; if the service cannot
  run (no `TIANAI_BASE_URL`, failed health check, timeout) → **fail closed 50302**. It must NEVER
  silently downgrade a high-risk account to "ALTCHA only + ticket" (that was a real security bug).
- Health check accepts **only 2xx + parseable JSON object**. On an upstream technical failure the
  response carries a **fresh** `escalationGrant` so the browser auto-refetches the challenge.
- Layer-2 payload is the **official Tianai `ImageCaptchaTrack` DTO**
  (`bgImageWidth/bgImageHeight/templateImageWidth/templateImageHeight/startTime/stopTime/
  trackList[{x,y,t,type}]`, `type ∈ DOWN|MOVE|UP|CLICK`). Sizes come only from the upstream response;
  no `randomY`, no 320×160 fallback, no custom `{points}`/`{x,y}`.
- `CAPTCHA_SECONDARY_REQUIRED` (escalated → no ticket) and `CAPTCHA_RISK_NOTED` (noted only → request
  still passes) are **mutually exclusive** within one `/verify` call.
- `POST /api/system/config/batch` saves the 8 flat captcha keys atomically (whitelist + single
  transaction) and health-checks Tianai **before** committing.
- **Gotcha that cost hours:** the ALTCHA branch of `service.ts` must read the challenge nonce from the
  **decoded** payload — `meta.payload` is a base64 **string**, so `challengeNonceOf(meta.payload.challenge)`
  is always empty and turns a *successful* PoW into `PAYLOAD_MALFORMED` ("人机验证数据无效"). The provider
  now returns `challengeNonce`; never re-derive it from the raw body. A provider-side exception
  (`VERIFY_ERROR`) must be `technical_error`, not `failed`.
- ALTCHA widget tip: its `challenge` attribute accepts a **JSON string** (parsed when it starts with
  `{`, no fetch) — that is how the frontend feeds Koa's `POST /generate` result to it. The bundle
  creates its PoW Web Worker from an inline `data:` URL, so **frontend CSP needs
  `worker-src 'self' blob: data:`** (`bls-admin-nginx.conf` updated).
- Tianai (Java) config prefix is **`captcha`** (not `tianai.captcha`), `init-default-resource: true` is
  required, and the built-in resources contain **templates + font only — no background image**, which
  must be registered manually (`CaptchaResourceInitializer`).
- **NEVER self-implement captcha algorithms** (user rule, 2026-09-21): no slider, no image slicing, no
  pointer-trajectory recognition, no custom captcha maths, no browser fingerprinting. Integrate a
  mature open-source project instead (here: self-hosted ALTCHA, npm `altcha` v3, Koa-only —
  `bls-server/src/security/captcha/*`). Self-hosted ALTCHA has **no image/audio challenge**; if a
  picture puzzle is mandatory, run Tianai as a separate service and let Koa proxy it (never port the
  Java algorithm to TS).
- **ESM-only npm dep from this CommonJS backend**: `altcha` is `"type": "module"`, so a static
  `import` gives TS1479 and a type-only import gives TS1541/TS1542. Load it with a **lazy dynamic
  `import()`** (cached promise) and declare the needed data shapes locally.
- **Router scan convention**: `bls-server/src/core/router.ts` recurses into sub-directories **even
  when the parent has an `index.ts`**, which is how `api/auth/index.ts` (function routes) and
  `api/auth/captcha/index.ts` (custom router) coexist. A nested custom module must put the full path
  after `/api` in its own `new Router({ prefix: '/x/y' })`.
- Config = **8 flat keys only**: `login_captcha_enabled`, `captcha_primary_provider`,
  `captcha_fallback_provider`, `captcha_ticket_ttl`, `captcha_tianai_enabled`,
  `captcha_challenge_ttl`, `captcha_force_after_failures`, `captcha_secondary_type`.
  Old `sys.login.captcha.*` is no longer read at runtime (migration `20260922_018`).
  Env vars: `ALTCHA_HMAC_KEY` (prod required), `ALTCHA_COST`, `TIANAI_BASE_URL`, `CAPTCHA_DEV_BYPASS`.
- Full memory: `bls-memory/pages/login-captcha.md`; also `docs/login-captcha.md`.

## III. Project conventions (follow when changing code)

- **`bls-event-service` is a separate Node service on `:7101`** (`cd bls-event-service && npm run dev`,
  `INTERNAL_SECRET` must match `bls-server/.env`). If it is down, `publishEvent` logs
  `event-service unreachable { error: 'fetch failed' }`, retries via the outbox and finally
  `[outbox] dead letter` — noisy but harmless; start the service.
- **`bls-admin` test setup**: `vitest.config.ts` + `vitest.setup.ts` (jsdom, `@testing-library/jest-dom`,
  RTL auto-cleanup, `globals: true`); `npm run test` runs the `*.test.tsx` files next to the code. Do
  **not** enable `restoreMocks` — some tests set their mock implementation once inside the `vi.mock`
  factory (e.g. `refresh-manager`).
- **Backend is the source of truth for permission codes**; frontend `permissions` prop and SQL seed
  must match `hasPerm('...')` exactly (common bug: `:create` vs `:add`). `ctx.state.user` exposes both
  `perms` and `permissions` (`AuthService.profile` duplicates them); `hasPerm` accepts either.
- Koa CRUD factory (`core/crud.ts` + `core/crud-config.ts`, declared with `defineCrudConfig`):
  - 6 endpoints: `GET /list`, `GET /:id`, `POST /add`, `PUT /edit`, `DELETE /remove`, `PUT /status`;
    `actions`-disabled endpoints are not registered.
  - `fields` is the single field source (derives create/update/search/filter whitelists, response
    projection, Zod schema, statusField); explicit arrays / `schema` win; legacy configs without
    `fields` keep old behaviour. An invalid config throws at route registration → app fails to start.
  - Audit fields (`create_by`, `create_time`, `update_by`, `update_time`) are never writable from a
    request body — only via `createDefaults`; `select:false` fields are omitted from list/detail
    (projection always keeps the PK); system fields (PK, `tenant_id`, `deleted`, audit) never writable.
  - `applyScope()` builds tenant + soft-delete + Data Scope once; must be reused inside transactions
    (never rebuild the query there). 0 affected rows on edit/remove/status/detail → 404.
  - Batch delete always takes `{ ids: [] }` (Koa/Java also accept a bare array / comma string).
- Global tables (no `tenant_id`): `sys_menu`, `sys_package`, `sys_package_menu`, `sys_role_menu`,
  `sys_user_role`; of these `sys_menu`, `sys_package`, `sys_package_menu`, `sys_role_menu` have **no
  `deleted` column** — never write it for them.
- `tenant_id` of a multi-tenant table only comes from server-side request context; the request body
  can never override it.
- When changing page behaviour or an API, also update `docs/crud.md`, `docs/backend-koa.md`,
  `docs/api-compatibility.md` and `sql/Init.sql`.
- **SQL changes always ship in BOTH places** (user requirement, settled 2026-09-21): `sql/Init.sql`
  serves **fresh installs**, `bls-server/migrations/YYYYMMDD_NNN_*.sql` serves **already-deployed** DBs
  via `npm run db:migrate up`. This holds **even for pure seed data with no DDL** (reference:
  `20260922_017_login_captcha.sql` ↔ the 9 `sys.login.captcha.*` rows in `Init.sql`) — never
  substitute "the operator will run the Init.sql block by hand". Generate both from one source and
  diff both afterwards.
- Architecture quick reference: frontend `bls-admin` (UmiJS Max + Ant Design Pro 6, port 9000);
  main backend `bls-server` (Koa 3, 6001 / Docker 7001); `bls-ai-service` 7201; `bls-event-service`
  7101. Java and Rust backends are **compatible alternatives** — only one backend runs at a time.
  Frontend bundler is **`utoopack` (`@utoopack/pack`), not mfsu/esbuild**; schema has **no foreign-key
  constraints**; platform tenant id is `'000000'`; business responses are `{code, message, data, total}`
  with `pageNum` / `pageSize` (max 100).

## IV. Documentation & memory system (most important convention)

- **`bls-memory/` is the single entry point for page-level memory**; repo-root `AGENTS.md` points at it.
  - `README.md` = page index + usage guide + version-metadata rules + page template.
  - `pages/*.md` = one file per page (frontend action → service fn → HTTP endpoint → backend handler &
    validation → permission codes → tenant isolation → replay/rate-limit → frontend-only validation →
    known gaps → extension steps).
  - `00-common/00..12-*.md` = 13 cross-cutting docs (architecture, redis, replay-protection,
    rate-limiting, auth-and-permissions, security-log-and-event-center, file-and-excel-security,
    database, external-api-and-service-auth, realtime-websocket, job-api-and-queue, frontend-shell,
    frontend-data-layer).
  - `CHANGELOG.md` = changelog of the document set.
- **After changing code you MUST sync memory** (user requirement: "changing logic means updating it"):
  update the memory doc → refresh the metadata line under its H1 (`Document version` / `Code version` =
  repo-root `VERSION` / `Verified commit` / `Last verified`) → append to `bls-memory/CHANGELOG.md`.
  `Verified commit` records only commits that **changed application code**; docs-only commits
  (`bls-memory/`, `docs/`, `.codebuddy/`) do not invalidate verification. **Never re-stamp a document
  that was not actually re-read.** Uncommitted verified code → keep current HEAD + an "uncommitted" note.
- **Redis is documented once**: any new Redis key → namespace table in `00-common/01-redis.md`.
- **The database is documented once**: a new table/column → `00-common/07-database.md` + `sql/Init.sql`
  + a new file in `bls-server/migrations/`.
- `.codex/skills/bls-kox/references/database-schema.md` is **stale** (18 of 40 tables; `sys_job` →
  really `sys_jobs`, `sys_file_config` → really `sys_storage_config`). Schema authority =
  `00-common/07-database.md` + `sql/Init.sql`.
- Repo-root `README.md` keeps a short **"🧠 Memory"** section and stays **concise** (~176 lines);
  long-form content belongs in `docs/` and `bls-memory/`.

## V. Collaboration preferences

- Diagnose first, then give precise commands and explain their impact — never do sweeping destructive
  cleanups (a bulk force-remove command was rejected before).
- **Never run `git commit` unless explicitly asked.** When done, report the change list + a suggested
  commit message.
- Reply in Simplified Chinese; AI-facing documents (`bls-memory/`, `AGENTS.md`, this file) are English.
- Several sessions may work in parallel here (happened repeatedly): check `git status` before editing,
  do not overwrite another session's uncommitted work, and call out any concurrent change you notice.
- `.codebuddy/memory/*.md` and `bls-memory/*.md` may have concurrent writers: **read the file (or
  `git show HEAD:<file>`) before overwriting** — never overwrite from session memory alone.

## VI. Frontend UI conventions (bls-admin)

- **Prefer antd's own components over hand-rolled code**: use the built-in selection/state of the
  component in play (`Tree checkable` + `onCheck`, `Checkbox.Group`, table `rowSelection`) instead of
  managing checkbox sets / row highlight yourself; don't write one-off row backgrounds or layout
  styles — copy patterns from `pages/system/dept`, `pages/ai/workbench`, `components/RebuildIndexModal`.
  Toolbar actions are **antd icon buttons** (`<Button type="text" size="small" icon={...} />`, no label).
- Keep UI refactors **minimal and literal**. Do not reorganise the data model or invent a new grouping
  on your own initiative (a rejected example: turning the permission tree's first-level menus into
  group headings — "一级的话不是目录").
- `/system/role` permission panel (settled after two rounds): three visual levels = 目录 / 页面 / 按钮;
  目录+页面 are the antd `Tree` levels, the **button level is a horizontal `Checkbox.Group` on its own
  line under the page**; right `Splitter.Panel` uses a **fixed `defaultSize={480}`** (`min={360}`
  `max={720}`), not `50%`.
- `CrudTablePage` (`components/CrudTablePage/index.tsx`) renders the 操作 column only when
  `showActions` is true (default). Read-only pages that have no edit/status/extraActions/delete must
  pass `showActions={false}` — otherwise an empty `<Space>` column is rendered (done for
  `system/log/login` + `system/log/security` on 2026-09-21).
- The user watches the running app → UI changes must stay smooth: avoid full-table re-renders on every
  click and per-render O(n²) work (menu trees can hold hundreds of nodes).
- Do not launch `agent-browser`/an automated browser here to self-verify UI changes; the user cancels
  it. State the change instead and let them look.
