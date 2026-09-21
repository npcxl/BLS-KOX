# BLS-KOX — Long-term Memory (cross-session)

> Stable, cross-session facts only. Day-to-day detail goes into `YYYY-MM-DD.md`.
> Consolidated 2026-09-20 (second pass: deduplicated, UI-section tightened).

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
  (`crypto.subtle`), and the official code hard-throws `Secure context (HTTPS) required.` when
  `globalThis.isSecureContext === false` (no switch to bypass). So `https://…`, `http://localhost`,
  `http://127.0.0.1` work; `http://<LAN-IP>:3000` cannot solve layer 1 at all (login is then blocked
  server-side because the token is required). The login flow detects this (`envBlocked` /
  `ENV_UNSUPPORTED`) and shows an explicit message; dev options are localhost, dev-server HTTPS, or
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (debug only). Production must be HTTPS.
- PowerShell caveats: `Get-Content`/`Select-String` decode as ANSI (UTF-8 Chinese → mojibake; judge by
  `git diff`); `node -e "..."` swallows quotes and treats the backtick as an escape char (a regex
  containing a SQL backtick matches nothing — use a temp `.js` file, or `[\x60]`); `findstr` piped
  into other commands fails. Prefer Node scripts or the IDE search tools.
- Rust sources repaired 2026-09-20: literal `?` (`0x3F`) had replaced 96 Chinese strings in
  `bls-rust-server/src/**/*.rs` (1:1 char restore from Koa text; clean at `d6785e0`, read back with
  `git show d6785e0:<file>`), plus 10 pagination `count` queries that swallowed DB errors
  (`unwrap_or(0)` → `.map_err(AppError::from)?`).

## II. Project conventions (follow when changing code)

- **Login captcha = unified ticket model; the server alone decides everything.**
  *(Updated 2026-09-21 — replaces the earlier `/api/auth/captcha/*` + `captchaToken` description.)*
  Two layers: layer 1 is ALTCHA invisible Proof-of-Work, layer 2 is **Tianai** (`blockPuzzle` /
  `clickWord`, an external Java service). ALTCHA's `display="standard"` widget is **not** a second layer.
  - Endpoints (browser only talks to Koa; the Java service is never exposed):
    `GET /api/captcha/config` → `{enabled, primaryProvider, fallbackProvider, tianaiEnabled,
    generateUrl, verifyUrl, fieldName}` (uppercase `ALTCHA`/`TIANAI`; no thresholds, no policy reasons);
    `POST /api/captcha/generate` → `{provider, challenge, sessionId?, expiresAt}`;
    `POST /api/captcha/verify` → `{status: 'passed'|'failed'|'technical_error', provider,
    captchaTicket?, expiresAt?, reason?, requireFallback?, nextProvider?}`.
  - **`POST /api/auth/login` only accepts `captchaTicket`** (issued by `CaptchaTicketService`,
    Redis key `captcha:ticket:*`, GETDEL one-shot). It never trusts a provider result directly.
    The frontend must send `captchaTicket` — not `captchaToken` (old name, now 404/ignored).
  - Frontend allowed to send: `scene` / `provider` (intent only) / `username` / `payload` (ALTCHA) /
    `sessionId` + `data` (Tianai). Stage, ticket contents and the verdict are server-decided.
  - `requireFallback: true` means "layer 1 passed but the policy demands Tianai" — the frontend then
    renders `TianaiCaptcha` (never `altcha-widget`) and re-calls `/verify` with `provider: 'TIANAI'`.
  - Internal policy reasons (`ACCOUNT_FAILURES` / `PRIVILEGED_ACCOUNT` / …) go to the security log
    only, never to `/config` or to `reason`.
  - `POST /api/system/config/batch` saves `sys.login.captcha.*` atomically and health-checks Tianai
    **before** committing.
  - **Gotcha that cost hours:** the ALTCHA branch of `service.ts` must read the challenge nonce from
    the **decoded** payload — `meta.payload` is a base64 **string**, so
    `challengeNonceOf(meta.payload.challenge)` is always empty and turns a *successful* PoW into
    `PAYLOAD_MALFORMED` ("人机验证数据无效"). The provider now returns `challengeNonce`; never re-derive
    it from the raw body. Likewise a provider-side exception (`VERIFY_ERROR`) must be
    `technical_error`, not `failed`.
  - ALTCHA widget tip: its `challenge` attribute accepts a **JSON string** (parsed when it starts
    with `{`, no fetch), which is how the frontend feeds Koa's POST `/generate` result to it.
  - Tianai (Java) config prefix is **`captcha`** (not `tianai.captcha`), `init-default-resource: true`
    is required, and the built-in resources contain **templates + font only — no background image**,
    which must be registered manually (see `CaptchaResourceInitializer`).
- **`bls-event-service` is a separate Node service on `:7101`** (`cd bls-event-service && npm run dev`,
  `INTERNAL_SECRET` must match `bls-server/.env`). If it is down, `publishEvent` logs
  `event-service unreachable { error: 'fetch failed' }`, retries via the outbox and finally
  `[outbox] dead letter` — noisy but harmless; start the service (only Rust project is `bls-rust-server`).
- **`bls-admin` now has a working test setup**: `vitest.config.ts` + `vitest.setup.ts` (jsdom,
  `@testing-library/jest-dom`, RTL auto-cleanup, `globals: true`). `npm run test` runs the frontend
  flow tests that sit next to the code (`*.test.tsx`). Do **not** enable `restoreMocks` — several
  tests set their mock implementation once inside the `vi.mock` factory (e.g. `refresh-manager`).
- **Backend is the source of truth for permission codes**; frontend `permissions` prop and SQL seed
  must match `hasPerm('...')` exactly (common bug: `:create` vs `:add`). `ctx.state.user` exposes
  both `perms` and `permissions` (`AuthService.profile` duplicates them); `hasPerm` accepts either.
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
  `docs/api-compatibility.md` and `sql/Init.sql`; deployed DBs use `bls-server/migrations/`
  (`npm run db:migrate`).
- **SQL changes always ship in BOTH places** (user requirement, settled 2026-09-21: first asked to
  put the new SQL into `sql/Init.sql` "so init is fast", then confirmed "补一下比较好吧" that a
  migration is needed too): `sql/Init.sql` serves **fresh installs**, `bls-server/migrations/
  YYYYMMDD_NNN_*.sql` serves **already-deployed** databases via `npm run db:migrate up`. This holds
  **even for pure seed data with no DDL** (reference: `20260922_017_login_captcha.sql` ↔ the 9
  `sys.login.captcha.*` rows in `Init.sql`) — never substitute "the operator will run the Init.sql
  block by hand". Generate both from one source and diff both afterwards.
- **NEVER self-implement captcha algorithms** (user rule, 2026-09-21): no slider, no image slicing, no
  pointer-trajectory recognition, no custom captcha maths, no browser fingerprinting. Integrate a mature
  open-source project instead. The login captcha uses **ALTCHA** (self-hosted, <https://github.com/altcha-org/altcha>,
  npm `altcha` v3) in the **Koa backend only** (`bls-server/src/security/captcha/*`,
  `altcha.ts` wraps `altcha/lib`; public routes in `api/auth/captcha/index.ts`).
- **Login captcha (ALTCHA, 2026-09-21)** — `invisible` PoW first (`<altcha-widget>` `auto="onload"`), escalated to the
  official **visible** component by a server-side policy (consecutive failures / IP risk / super-admin / `mode=always`);
  `GET /captcha/config` (enveloped), `GET /captcha/challenge` (**official ALTCHA object, no `{code,…}` envelope** —
  the widget consumes it), `POST /captcha/verify` → one-shot `captchaToken` (32 random bytes, only `sha256` in Redis,
  TTL 120 s, bound to domain/username/IP/UA, `SET NX EX` + `GETDEL`) which `POST /api/auth/login` consumes *before*
  reading `sys_user` (errors `40010-40013` / `50301`; Redis down ⇒ fail closed). Config = 6 `sys.login.captcha.*` keys
  (`provider` = `altcha` | `tianai`); env = `ALTCHA_HMAC_KEY` (prod required), `ALTCHA_COST`, `TIANAI_BASE_URL`,
  `CAPTCHA_DEV_BYPASS`. Self-hosted ALTCHA has **no image/audio code challenge** (that is Sentinel/Cloud) — if a
  picture puzzle is mandatory, run Tianai CAPTCHA as a separate service and let Koa proxy it (never port the Java
  algorithm to TS). Full memory: `bls-memory/pages/login-captcha.md`; also `docs/login-captcha.md`.
- **Frontend CSP must allow `worker-src 'self' blob: data:`** — the official ALTCHA bundle creates its Proof-of-Work
  Web Worker from an inline `data:` URL, which `default-src 'self'` blocks (`bls-admin-nginx.conf` was updated). The
  widget also needs a secure context (HTTPS / `localhost`).
- **ESM-only npm deps from this CommonJS backend**: `altcha` is `"type": "module"`, so a static `import` gives
  TS1479 and a type-only import gives TS1541/TS1542. Load it with a **lazy dynamic `import()`** (cached promise) and
  declare the needed data shapes locally instead of importing its types.
- **Router scan convention**: `bls-server/src/core/router.ts` now recurses into sub-directories **even when the parent has
  an `index.ts`**, which is how `api/auth/index.ts` (function routes) and `api/auth/captcha/index.ts` (custom router)
  coexist. A nested custom module must put the full path after `/api` in its own `new Router({ prefix: '/x/y' })`.
- Architecture quick reference: frontend `bls-admin` (UmiJS Max + Ant Design Pro 6, port 9000);
  main backend `bls-server` (Koa 3, 6001 / Docker 7001); `bls-ai-service` 7201; `bls-event-service`
  7101. Java and Rust backends are **compatible alternatives** — only one backend runs at a time.
  Frontend bundler is **`utoopack` (`@utoo/pack`), not mfsu/esbuild**; schema has **no foreign-key
  constraints**; platform tenant id is `'000000'`; business responses are
  `{code, message, data, total}` with `pageNum` / `pageSize` (max 100).

## III. Documentation & memory system (most important convention)

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

## IV. Collaboration preferences

- Diagnose first, then give precise commands and explain their impact — never do sweeping destructive
  cleanups (a bulk force-remove command was rejected before).
- **Never run `git commit` unless explicitly asked.** When done, report the change list + a suggested
  commit message.
- Reply in Simplified Chinese; AI-facing documents (`bls-memory/`, `AGENTS.md`, this file) are English.
- Several sessions may work in parallel here (happened repeatedly): check `git status` before editing,
  do not overwrite another session's uncommitted work, and call out any concurrent change you notice.
- `.codebuddy/memory/*.md` and `bls-memory/*.md` may have concurrent writers: **read the file (or
  `git show HEAD:<file>`) before overwriting** — never overwrite from session memory alone.

## V. Frontend UI conventions (bls-admin)

- **Prefer antd's own components over hand-rolled code**: use built-in selection/state of the
  component in play (`Tree checkable` + `onCheck`, `Checkbox.Group`, table `rowSelection`) instead of
  managing checkbox sets / row highlight yourself; don't write one-off row backgrounds or layout
  styles — copy patterns from `pages/system/dept`, `pages/ai/workbench`,
  `components/RebuildIndexModal`. Toolbar actions are **antd icon buttons**
  (`<Button type="text" size="small" icon={...} />`, no label).
- Keep UI refactors **minimal and literal**. Do not reorganise the data model or invent a new grouping
  on your own initiative (a rejected example: turning the permission tree's first-level menus into
  group headings — "一级的话不是目录").
- `/system/role` permission panel (settled after two rounds): three visual levels = 目录 / 页面 / 按钮;
  目录+页面 are the antd `Tree` levels, the **button level is a horizontal `Checkbox.Group` on its own
  line under the page**; right `Splitter.Panel` uses a **fixed `defaultSize={480}`** (`min={360}`
  `max={720}`), not `50%`.
- The user watches the running app → UI changes must stay smooth: avoid full-table re-renders on every
  click and per-render O(n²) work (menu trees can hold hundreds of nodes).
- Do not launch `agent-browser`/an automated browser here to self-verify UI changes; the user cancels
  it. State the change instead and let them look.
