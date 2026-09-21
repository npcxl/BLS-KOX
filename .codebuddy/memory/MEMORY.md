# BLS-KOX — Long-term Memory (cross-session)

> Stable, cross-session facts only. Day-to-day detail goes into `YYYY-MM-DD.md`.
> Consolidated 2026-09-20 (second pass: deduplicated, UI-section tightened).

## I. Environment & tooling gotchas

- Default `node` is v16 but the project needs **≥22**; usable one:
  `C:\Users\18569\.workbuddy\binaries\node\versions\22.22.2\node.exe` (prepend its dir to `PATH`).
- JDK 21 at `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`; default `mvn` runs JDK 8 →
  set `JAVA_HOME`. `bls-java-server` cannot fetch deps here (Maven Central unreachable,
  `io.jsonwebtoken:jjwt-bom:0.12.6` missing) → `mvn compile/test` fails.
- **Editing `sql/Init.sql` via the IDE edit tool is silently dropped** (reports success, nothing on
  disk). Write it with a shell/Node script and verify via `git diff sql/Init.sql`.
- PowerShell caveats: `Get-Content`/`Select-String` decode as ANSI (UTF-8 Chinese → mojibake; judge by
  `git diff`); `node -e "..."` swallows quotes and treats the backtick as an escape char (a regex
  containing a SQL backtick matches nothing — use a temp `.js` file, or `[\x60]`); `findstr` piped
  into other commands fails. Prefer Node scripts or the IDE search tools.
- Rust sources repaired 2026-09-20: literal `?` (`0x3F`) had replaced 96 Chinese strings in
  `bls-rust-server/src/**/*.rs` (1:1 char restore from Koa text; clean at `d6785e0`, read back with
  `git show d6785e0:<file>`), plus 10 pagination `count` queries that swallowed DB errors
  (`unwrap_or(0)` → `.map_err(AppError::from)?`).

## II. Project conventions (follow when changing code)

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
- **Login captcha (2026-09-21)**: two-stage (`silent` behaviour score → `slider`/`rotate`) in the **Koa backend only**
  (`bls-server/src/security/captcha/*`, public routes `bls-server/src/api/auth/captcha/index.ts`, mounted at
  `/api/auth/captcha/*`). Config = 9 `sys.login.captcha.*` keys read through Dynamic Config; the public config endpoint
  exposes **only** `{enabled, mode, secondaryTypes}`. Login consumes a one-shot `captchaToken` (HMAC-signed with
  `CAPTCHA_SECRET`, only `sha256(token)` stored in Redis, `SET NX EX` + `GETDEL`, bound to challenge / tenant domain /
  username / IP / UA hashes) *before* any username/password check; errors `40010-40013` / `50301`, all captcha Redis ops
  fail closed. Full memory: `bls-memory/pages/login-captcha.md`; also `docs/login-captcha.md`.
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
