# BLS-KOX — Long-term Memory (cross-session)

> Stable, cross-session facts only. Day-to-day detail goes into `YYYY-MM-DD.md`.
> Merge note (2026-09-20): sections I & II originate from the code-side session, sections III & IV
> from the documentation-side session; both were kept, de-duplicated, and translated to English
> so AI agents parse them reliably.

## I. Environment & tooling gotchas

- The default `node` on this machine is v16; the project requires **≥22**. A usable Node 22 is at
  `C:\Users\18569\.workbuddy\binaries\node\versions\22.22.2\node.exe`
  (prepend that directory to `PATH` and `npm` works).
- JDK 21: `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`. The default `mvn` runs on
  JDK 8, so `JAVA_HOME` must be set explicitly.
- `bls-java-server` dependencies cannot be fetched on this machine (Maven Central unreachable,
  missing `io.jsonwebtoken:jjwt-bom:0.12.6`), so `mvn compile/test` cannot run here.
- **Writing `sql/Init.sql` must be done via shell/script.** Writes through the IDE edit tool are
  silently dropped for that file (reports success, nothing lands on disk). Always verify with
  `git diff sql/Init.sql` afterwards.
- PowerShell `Get-Content` / `Select-String` decode as ANSI by default, so UTF-8 Chinese shows as
  mojibake; use `git diff` to judge real content.
- **In PowerShell, `node -e "..."` swallows quotes and the backtick is an escape character** — a
  regex containing a SQL backtick silently matches nothing (this once produced a false
  "`Init.sql` has 0 tables" result). Reliable alternatives: write a temporary `.js` file, run it
  and delete it; or use `[\x60]` instead of a backtick. `findstr` piped into other commands also
  fails — prefer Node or the IDE search tools.

## II. Project conventions (follow when changing code)

- The **backend is the source of truth for permission codes**; the frontend `permissions` prop and
  the SQL seed must match `hasPerm('...')` exactly (common bug: frontend writes `:create` while the
  backend/SQL uses `:add`).
- `ctx.state.user` exposes both `perms` and `permissions` (`AuthService.profile` duplicates them);
  `hasPerm` accepts either.
- Koa CRUD factory (`core/crud.ts` + `core/crud-config.ts`) contract:
  - 6 endpoints: `GET /list`, `GET /:id`, `POST /add`, `PUT /edit`, `DELETE /remove`, `PUT /status`;
  - preferred declaration is `defineCrudConfig({ table, pkField, fields, actions, createDefaults })`
    where `fields` is the **single field source** and automatically derives
    createFields / updateFields / searchFields / filterFields / response projection / Zod / statusField;
  - endpoints disabled via `actions` are not registered; explicit arrays and an explicit `schema`
    take precedence over what `fields` derives; legacy configs without `fields` keep the old behaviour;
  - an invalid config (bad identifier, bad enum/range, a system field opened for writing, no usable
    add|edit field, missing status field) **throws during route registration → the application fails
    to start**;
  - audit fields (`create_by`, `create_time`, `update_by`, `update_time`) can never be written from
    a request body — only via `createDefaults`;
  - fields with `select: false` are omitted from list/detail responses; the projection always
    contains the primary key;
  - write whitelists are `createFields` / `updateFields` / `filterFields`; system fields
    (PK, `tenant_id`, `deleted`, audit fields) are never writable;
  - tenant, soft-delete and Data Scope conditions are built once by `applyScope()` and must be
    reused inside transactions (never rebuild the query inside a transaction);
  - 0 affected rows on edit / remove / status / detail → 404; batch delete always takes
    `{ ids: [] }` (Koa and Java also accept a bare array or a comma-separated string).
- Global tables (no `tenant_id`): `sys_menu`, `sys_package`, `sys_package_menu`, `sys_role_menu`,
  `sys_user_role`. Of these, `sys_menu`, `sys_package`, `sys_package_menu` and `sys_role_menu`
  have **no `deleted` column** — never write that field for them.
- `tenant_id` of a multi-tenant table may only come from the server-side request context; the
  request body can never override it.
- When changing page behaviour or an API, also update `docs/crud.md`, `docs/backend-koa.md`,
  `docs/api-compatibility.md` and `sql/Init.sql`; already-deployed databases use the incremental
  scripts in `bls-server/migrations/` (`npm run db:migrate`).
- **`bls-memory/` must be kept in sync** (user requirement: "changing logic means updating it").
  It is the per-page AI memory library (English). After a logic change, update the matching
  `pages/*.md` and the affected `00-common/*.md`, and append an entry to
  `bls-memory/CHANGELOG.md` (Keep a Changelog + SemVer for the document set). See section III.
- Architecture quick reference: frontend `bls-admin` (UmiJS Max + Ant Design Pro 6, port 9000);
  main backend `bls-server` (Koa 3, 6001 / Docker 7001); `bls-ai-service` 7201;
  `bls-event-service` 7101; the Java and Rust backends are compatible alternatives — only one
  backend runs at a time. **The frontend bundler is `utoopack` (`@utoo/pack`), not mfsu/esbuild**;
  **the schema has no foreign-key constraints**; the platform tenant id is the string `'000000'`;
  business responses use `{code, message, data, total}` with pagination `pageNum` / `pageSize`
  (max 100).

## III. Documentation & memory system (the most important convention here)

- **`bls-memory/` is the single entry point for page-level memory**, and the repo-root `AGENTS.md`
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
  If code is verified but not yet committed, keep the current HEAD in the metadata line, add an
  "uncommitted" note in the body, and re-stamp `Verified commit` once it is committed. Never
  re-stamp a document that was not actually re-read.
- **Redis is documented once**: any new Redis key must be added to the namespace table in
  `00-common/01-redis.md`.
- **The database is documented once**: a new table/column must be added to
  `00-common/07-database.md`, plus `sql/Init.sql` and a new file in `bls-server/migrations/`.
- **`.codex/skills/bls-kox/references/database-schema.md` is stale** (covers only 18 of the 40
  tables, and `sys_job` → really `sys_jobs`, `sys_file_config` → really `sys_storage_config`).
  Historical reference only; the schema authority is `00-common/07-database.md` and `sql/Init.sql`.
- The repo-root `README.md` keeps a short **"🧠 Memory"** section (entry-point table, the 13 shared
  documents, the sync rule) and otherwise stays a **concise** project README (~175 lines). Keep it
  that way — long-form content belongs in `docs/` and `bls-memory/`, not in the README.

## IV. Collaboration preferences

- Diagnose first, then give precise commands and explain their impact — never do sweeping
  destructive cleanups (the user has rejected a bulk force-remove command before).
- **Never run `git commit` unless explicitly asked.** When done, report the change list and a
  suggested commit message.
- Reply in Simplified Chinese; documents written for AI (`bls-memory/`, `AGENTS.md`, this file)
  are in English so models parse them reliably.
- Several sessions may be working in this workspace in parallel (this happened repeatedly):
  check `git status` before editing, do not overwrite another session's uncommitted work, and call
  out any concurrent change you notice in your reply.
