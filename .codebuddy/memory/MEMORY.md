# BLS-KOX — Long-term Memory (cross-session)

> Stable, cross-session facts only. Day-to-day detail goes into `YYYY-MM-DD.md`.
> Consolidated 2026-09-20 (merged two concurrent sessions; content kept, wording tightened).

## I. Environment & tooling gotchas

- Default `node` here is v16 but the project needs **≥22**; a usable one is
  `C:\Users\18569\.workbuddy\binaries\node\versions\22.22.2\node.exe` (prepend its dir to `PATH`).
- JDK 21: `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`; the default `mvn` runs on
  JDK 8, so `JAVA_HOME` must be set explicitly. `bls-java-server` cannot fetch deps on this machine
  (Maven Central unreachable; `io.jsonwebtoken:jjwt-bom:0.12.6` missing) → `mvn compile/test` fails.
- **Editing `sql/Init.sql` via the IDE edit tool is silently dropped** (reports success, nothing on
  disk). Write it with a shell/Node script and always verify with `git diff sql/Init.sql`.
- PowerShell `Get-Content`/`Select-String` decode as ANSI → UTF-8 Chinese shows as mojibake; judge
  real content by `git diff`.
- **In PowerShell `node -e "..."` swallows quotes and treats the backtick as an escape char** — a
  regex containing a SQL backtick silently matches nothing. Use a temp `.js` file (run, then delete)
  or `[\x60]` instead of a backtick. `findstr` piped into other commands also fails — prefer Node or
  the IDE search tools.

- **`bls-rust-server/src/**/*.rs` contained literal `?` (byte `0x3F`) where Chinese message text
  belonged** (introduced at `d6785e0` / `4e8a95b`; files clean at `d6785e0` can be recovered with
  `git show d6785e0:<file>`). The `?` count equals the number of replaced characters, so Koa's text
  can be restored 1:1. Fixed 2026-09-20: 96 strings in 12 files + 10 pagination `count` queries that
  silently swallowed DB errors (`unwrap_or(0)` → `.map_err(AppError::from)?`).

## II. Project conventions (follow when changing code)

- The **backend is the source of truth for permission codes**; the frontend `permissions` prop and
  the SQL seed must match `hasPerm('...')` exactly (common bug: `:create` vs `:add`).
- `ctx.state.user` exposes both `perms` and `permissions` (`AuthService.profile` duplicates them);
  `hasPerm` accepts either.
- Koa CRUD factory (`core/crud.ts` + `core/crud-config.ts`; declared with `defineCrudConfig`):
  - 6 endpoints: `GET /list`, `GET /:id`, `POST /add`, `PUT /edit`, `DELETE /remove`, `PUT /status`;
    endpoints disabled via `actions` are not registered.
  - `fields` is the single field source, deriving create/update/search/filter whitelists, response
    projection, Zod schema and statusField; explicit arrays / an explicit `schema` win over derived;
    legacy configs without `fields` keep the old behaviour.
  - An invalid config (bad identifier/enum, a writable system field, no usable add|edit field,
    missing status field) throws at route registration → the application fails to start.
  - Audit fields (`create_by`, `create_time`, `update_by`, `update_time`) are never writable from a
    request body — only via `createDefaults`; `select:false` fields are omitted from list/detail
    responses (the projection always keeps the PK); write whitelists are `createFields` /
    `updateFields` / `filterFields`; system fields (PK, `tenant_id`, `deleted`, audit) are never
    writable.
  - `applyScope()` builds tenant + soft-delete + Data Scope once and must be reused inside
    transactions (never rebuild the query there). 0 affected rows on edit/remove/status/detail → 404.
  - Batch delete always takes `{ ids: [] }` (Koa and Java also accept a bare array / comma string).
- Global tables (no `tenant_id`): `sys_menu`, `sys_package`, `sys_package_menu`, `sys_role_menu`,
  `sys_user_role`; of these, `sys_menu`, `sys_package`, `sys_package_menu` and `sys_role_menu` have
  **no `deleted` column** — never write that field for them.
- `tenant_id` of a multi-tenant table may only come from server-side request context; the request
  body can never override it.
- When changing page behaviour or an API, also update `docs/crud.md`, `docs/backend-koa.md`,
  `docs/api-compatibility.md` and `sql/Init.sql`; deployed databases use the incremental scripts in
  `bls-server/migrations/` (`npm run db:migrate`).
- **`bls-memory/` must be kept in sync** (user requirement: "changing logic means updating it").
  After a logic change, update the matching `pages/*.md` + affected `00-common/*.md` and append an
  entry to `bls-memory/CHANGELOG.md` (Keep a Changelog + SemVer). See section III.
- Architecture quick reference: frontend `bls-admin` (UmiJS Max + Ant Design Pro 6, port 9000);
  main backend `bls-server` (Koa 3, 6001 / Docker 7001); `bls-ai-service` 7201;
  `bls-event-service` 7101; the Java and Rust backends are **compatible alternatives** — only one
  backend runs at a time. The frontend bundler is **`utoopack` (`@utoo/pack`), not mfsu/esbuild**;
  the schema has **no foreign-key constraints**; the platform tenant id is `'000000'`; business
  responses are `{code, message, data, total}` with pagination `pageNum` / `pageSize` (max 100).

## III. Documentation & memory system (the most important convention here)

- **`bls-memory/` is the single entry point for page-level memory**; the repo-root `AGENTS.md`
  points at it.
  - `bls-memory/README.md` = page index + usage guide + version-metadata rules + page template.
  - `bls-memory/pages/*.md` = one file per page (frontend action → service function → HTTP endpoint
    → backend handler & validation → permission codes → tenant isolation → replay/rate-limit →
    frontend-only validation → known gaps → extension steps).
  - `bls-memory/00-common/00..12-*.md` = 13 cross-cutting documents (architecture, redis,
    replay-protection, rate-limiting, auth-and-permissions, security-log-and-event-center,
    file-and-excel-security, database, external-api-and-service-auth, realtime-websocket,
    job-api-and-queue, frontend-shell, frontend-data-layer).
  - `bls-memory/CHANGELOG.md` = changelog of the document set.
- **Sync obligation after changing code**: update the memory document → refresh the metadata line
  under its H1 (`Document version` / `Code version` = repo-root `VERSION` / `Verified commit` /
  `Last verified`) → add an entry to `bls-memory/CHANGELOG.md`.
  `Verified commit` records only commits that **changed application code**; documentation-only
  commits (touching just `bls-memory/`, `docs/`, `.codebuddy/`) do not invalidate verification.
  **Never re-stamp a document that was not actually re-read.** If code is verified but not yet
  committed, keep the current HEAD in the metadata line and add an "uncommitted" note in the body.
- **Redis is documented once**: any new Redis key must be added to the namespace table in
  `00-common/01-redis.md`.
- **The database is documented once**: a new table/column must be added to
  `00-common/07-database.md`, plus `sql/Init.sql` and a new file in `bls-server/migrations/`.
- **`.codex/skills/bls-kox/references/database-schema.md` is stale** (covers only 18 of the 40
  tables; `sys_job` → really `sys_jobs`, `sys_file_config` → really `sys_storage_config`).
  Historical reference only; the schema authority is `00-common/07-database.md` and `sql/Init.sql`.
- The repo-root `README.md` keeps a short **"🧠 Memory"** section and otherwise stays a **concise**
  project README (~176 lines); long-form content belongs in `docs/` and `bls-memory/`.

## IV. Collaboration preferences

- Diagnose first, then give precise commands and explain their impact — never do sweeping
  destructive cleanups (a bulk force-remove command was rejected before).
- **Never run `git commit` unless explicitly asked.** When done, report the change list and a
  suggested commit message.
- Reply in Simplified Chinese; documents written for AI (`bls-memory/`, `AGENTS.md`, this file) are
  in English so models parse them reliably.
- Several sessions may work in this workspace in parallel (this happened repeatedly): check
  `git status` before editing, do not overwrite another session's uncommitted work, and call out any
  concurrent change you notice in your reply.
- `.codebuddy/memory/*.md` and `bls-memory/*.md` may have concurrent writers: **read the file (or
  `git show HEAD:<file>`) before overwriting** — never overwrite from session memory alone.
