# Document Changelog — `bls-memory/`

All notable changes to the **bls-memory documents** (not to the application code) are recorded
here.

Format: [Keep a Changelog](https://keepachangelog.com/).
Versioning: [Semantic Versioning](https://semver.org/) applied to the **document set**.

Each document also carries its own metadata line:

```markdown
> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20
```

- `Document version` — SemVer of that single document.
- `Code version` — the repo-root `VERSION` the content was verified against.
- `Verified commit` — the git commit whose code the content was checked against.
- `Last verified` — date of the last check against the code.

Rules: see the "Version metadata & maintenance" section of [`README.md`](README.md).

> The application changelog lives in the repo root `CHANGELOG.md`.

---

## [1.4.1] — 2026-09-20

`/system/role` menu-permission panel: layout corrections after the first round of feedback.

### Changed

- **`pages/system-role.md`** (document version **1.2.0**) — the right `Splitter.Panel` is now a
  **fixed `defaultSize={480}`** (`min={360}`, `max={720}`) instead of `50%`, and the `MenuAuthPanel`
  description was rewritten to match the actual code (it had drifted):
  - the panel again uses an **antd `Tree`** (the earlier "renders the tree itself, no antd `Tree`"
    note was stale) with 目录 + 页面 as its two levels — check / uncheck / `indeterminate` are the
    component's own parent-child linkage, no hand-maintained checked `Set`;
  - **按钮权限 (`menu_type='2'`) are a horizontal `Checkbox.Group` on their own line under the page**
    (third visual level). They are deliberately **not** `Tree` nodes: stacking every button vertically
    made the tree far too long to operate;
  - documented the two-way sync (page/目录 toggle ↔ its buttons), the load rule (only leaf pages go
    into `checkedKeys`, buttons go to the checkbox state) and the save payload (checked nodes ∪
    checked buttons, each extended with its ancestor chain).
  - (document version **1.2.1**) clicking **any row** while the panel is open now switches the panel to
    that role — `CrudTablePage` gained `rowClickToSelect`, which turns the row click into a row
    *selection* so the antd highlight follows the panel.
- **`00-common/12-frontend-data-layer.md`** (document version **1.0.3**) — the `CrudTablePage` props
  table had drifted: the hand-rolled `onRowClick` / `isRowSelected` rows were removed by 1.4.0's work
  (they no longer exist in the component) and are replaced by `onSelectionChange` + the new
  `rowClickToSelect` (controlled `rowSelection.selectedRowKeys`, clicks inside the selection column
  ignored so unticking still works).

---

## [1.4.0] — 2026-09-20

Two behaviour changes plus one new frontend layout, all verified against the **working tree on top
of `ff64e74`**.

Uncommitted code this release was verified against:

```
 M bls-server/src/app.ts                                   (runtime guard at the entry point)
?? bls-server/src/core/runtime-guard.ts
?? bls-server/src/core/__tests__/runtime-guard.test.ts
 M bls-admin/src/components/CrudTablePage/index.tsx        (showActions / onRowClick / isRowSelected)
 M bls-admin/src/pages/system/role/index.tsx               (Splitter layout)
 D bls-admin/src/pages/system/role/components/MenuAuthModal.tsx
?? bls-admin/src/pages/system/role/components/MenuAuthPanel.tsx
```

### Added

- **`bls-server/src/core/runtime-guard.ts` + `core/__tests__/runtime-guard.test.ts`** — the Koa
  server now fails fast on an unsupported runtime instead of starting in a half-broken state.
  Background: on Node < 20/22 the process still listened on its port while
  `[worker] poll error { error: 'TypeError: arr.toSorted is not a function' }` and
  `[outbox-publisher] poll error …` fired every 2-3 s (Kysely's query compiler calls
  `Array#toSorted`) and streaming responses threw `ReferenceError: ReadableStream is not defined`.
  The guard probes the Node major version (≥ 22) plus `Array#toSorted`/`toReversed`,
  `Object.groupBy`, `structuredClone`, `ReadableStream`, `fetch`, prints the offending items, the
  required version and the fix paths (`nvm use 22` / `.nvmrc` / `node:22-alpine`), then exits with
  code 1 before the HTTP server listens. `app.ts` calls it as
  `assertSupportedRuntime({ exit: require.main === module })`, so importing `app.ts` (tests) only
  warns. Verified end to end by deleting the global and running `node --require … dist/app.js`
  → prints the guidance and exits 1 (10 unit tests pass).

- **`CrudTablePage` row interaction props** (`showActions`, `onRowClick`, `isRowSelected`) — see
  `00-common/12-frontend-data-layer.md`.

### Changed

- **`pages/system-role.md`** (document version **1.1.0**) — the role page is now an antd `Splitter`:
  left = role list (only panel by default → full width with the 操作 column), right = the new
  `MenuAuthPanel`, opened by a row click or the 「菜单权限」 row action; while it is open the list
  renders **without** the 操作 column (`showActions={!authPanelOpen}`) and 「收起」 restores it.
  `MenuAuthModal` was replaced by `MenuAuthPanel`, which drops the antd `Tree` and renders the menu
  tree itself: 目录/菜单 one per row (indented), **button permissions (`menu_type === '2'`, i.e.
  增删改查) horizontally on the parent menu's row**, with the checked set driving parent/child
  propagation (check = self + subtree + ancestors, uncheck = subtree + prune, partial = parent
  `indeterminate`) and the same `{ menuIds }` payload as before. Also documented that
  `Splitter.Panel` `min`/`max`/`defaultSize` only accept a number (px) or `'NN%'` — `'320px'` parses
  to `NaN`.
- **`00-common/00-architecture.md`** (document version **1.1.1**) — §5's "uncommitted-until-then"
  notice replaced by the fact that the config-style factory is committed as `9b22800`; §7 documents
  the runtime guard, the exact failure modes it prevents and where its tests live.

---

## [1.3.1] — 2026-09-20

Re-stamped `Verified commit` now that the CRUD-config refactor is committed, and wired the
memory set into the repo-root agent rules.

### Changed

- The working tree that **1.3.0** was verified against is now committed as **`9b22800`**
  (`docs(memory): 同步 CRUD 配置式改造与 memory 文档集`), which also committed this document set
  (including the P2/P3 documents `00-common/07..12` + `pages/global-search.md`) and
  `bls-server/src/core/crud-config.ts` / `crud-keys.ts`.
- `Verified commit: 60b7b37` → **`9b22800`** in the five documents touched by 1.3.0:
  `00-common/00-architecture.md`, `00-common/08-external-api-and-service-auth.md`,
  `00-common/12-frontend-data-layer.md`, `pages/system-config.md`, `pages/system-theme.md`.
  `Last verified` stays `2026-09-20` and the document versions are unchanged — only the commit
  that identifies the verified code changed.
- **`AGENTS.md`** (repo root) rewritten **in English** (like the rest of the agent-facing memory):
  `bls-memory/` is now the first thing an agent is told to read (index → page document →
  `00-common/*`), with a table of all 13 shared documents, the post-change sync obligations
  (metadata line + `CHANGELOG.md`, Redis keys → `01-redis.md`, tables/columns → `07-database.md` +
  `sql/Init.sql` + migrations), and an explicit warning that
  `.codex/skills/bls-kox/references/database-schema.md` is stale (18 of 40 tables, two tables
  misnamed) with a `rg` recipe to read exact DDL instead.

### Note on `Verified commit` semantics

Documents are only re-stamped to a commit that was actually re-checked against. The CRUD-config
commit (`9b22800`) only touched `core/crud.ts`, `core/crud-config.ts`, `core/crud-keys.ts`,
`core/router.ts`, `scripts/generate-openapi.ts` and `openapi.json`, so documents about the
database, Redis, replay protection, rate limiting, auth, the file/Excel pipeline, the WebSocket
protocol, the job queue and the frontend shell keep their earlier `Verified commit` — they are
**not** stale, they simply were not affected. Re-stamp a document when you re-read it against a
newer commit.

---

## [1.3.0] — 2026-09-20

Re-verified the document set against the **config-style CRUD factory** and resolved the
"Pending re-verification" section of 1.2.0. Verified against the **working tree on top of
`HEAD = 60b7b37` / `VERSION 1.0.0`** — the CRUD-factory code itself is still uncommitted, so
re-stamp `Verified commit` in the touched documents once it is committed.

Uncommitted code this release was verified against:

```
 M bls-server/src/core/crud.ts                    (consumes the resolved config)
 M bls-server/src/core/router.ts                  (CrudConfigError aborts startup)
 M bls-server/src/scripts/generate-openapi.ts     (shares resolveCrudConfig)
 M bls-server/src/core/__tests__/crud.test.ts     (87 cases)
 M bls-server/src/config/__tests__/dynamic-config.test.ts
?? bls-server/src/core/crud-config.ts             (fields, validation, Zod generation)
?? bls-server/src/core/crud-keys.ts               (snake ↔ camel helpers)
 M bls-server/openapi.json                        (regenerated)
```

### Changed

- **`00-common/00-architecture.md`** (document version **1.1.0**) — §5 rewritten for the two
  declaration styles:
  - config style `defineCrudConfig({ table, pkField, fields, actions, createDefaults,
    unknownFields })` with `fields` as the single field source, plus the derivation table
    (createFields / updateFields / searchFields / filterFields / response projection / statusField /
    Zod / OpenAPI);
  - the full field-option table (`type`, `values`, `required`, `nullable`, `create`, `update`,
    `search`, `filter`, `select`, `status`, `min`/`max`, `minLength`/`maxLength`, `default`,
    `description`) and the module-option table;
  - `actions` (a disabled endpoint is **not registered**), `createDefaults` (object or
    `(ctx) => object`, server-trusted), `unknownFields: 'ignore' | 'reject'`;
  - audit-field protection: `create_by` / `create_time` / `update_by` / `update_time` are **never**
    writable from a request body (only `createDefaults` may set them), and PK / `tenant_id` /
    `deleted` stay server-controlled;
  - §5.7 "Configuration is validated at startup" — the complete check list, and the behaviour change
    that a module with **no** writable field now fails at **startup** instead of at request time;
  - the priority rules when both styles are present: the explicit array / `schema` wins, an array
    entry not declared in `fields` is a startup error, and a config without `fields` keeps
    `selectAll` + no generated Zod.
  - §4 (router auto-scan) — `config` may be a `defineCrudConfig(...)` value, `wrapCamel()` is called
    once, and `CrudConfigError` now **aborts startup** with the module-path prefix.
  - §7 (verify commands) — added `npm run build` / `npm run openapi`, the Node ≥ 22 requirement, the
    `node dist/scripts/generate-openapi.js` fallback and a note that the unit tests need no
    MySQL/Redis.
  - §8 — `docs/crud.md` is now referenced as the CRUD-factory long-form reference (no longer listed
    as a "legacy" doc).

- **`00-common/08-external-api-and-service-auth.md`** (document version **1.0.1**) — §7 OpenAPI
  generation: the generator now calls the same `resolveCrudConfig()` as the runtime, honours
  `actions`, emits **camelCase** request fields, prefers `fields` over raw table columns, resolves
  `sql/Init.sql` from the repo root (35 table schemas actually load) and reports
  `138 paths / 149 operations / 23 tags / 109 request schemas`.

- **`pages/system-config.md`**, **`pages/system-theme.md`** (document version **1.0.1**) — added the
  config-style migration note (what would change: response projection, startup validation, typed
  field validation such as `token_json: { type: 'json' }`) and refreshed the "add validation"
  extension step.

- **`00-common/12-frontend-data-layer.md`** (document version **1.0.1**) — the "add a CRUD page"
  cookbook now starts from `defineCrudConfig(...)` + `fields`, notes that the detail endpoint reuses
  the `:list` permission, and extends the backend verify step with `npm run build` / `npm run openapi`.

### Verified (no document change required)

- Both modules that use the factory today (`system/config`, `system/theme`) keep working unchanged:
  the legacy array style is fully backward compatible (6 endpoints, same permissions, `selectAll`
  projection, no generated Zod).
- `bls-server`: `npm run lint`, `npm run build`, `npm run openapi` and `npm test`
  (**25 files / 436 tests**) all pass. The new config-style behaviours are covered in
  `bls-server/src/core/__tests__/crud.test.ts` (87 cases): endpoint generation + `actions`
  switches, automatic PK/tenant/`createDefaults`, derived whitelists, `search`/`filter`,
  `select: false` hidden in **both** list and detail, generated Zod for
  `required`/`enum`/numeric range/length/`nullable`, startup failures (illegal table, illegal field,
  bad `createDefaults`, array entry not in `fields`) whose message contains module + table + field,
  cross-tenant list/detail/edit/remove/status blocking, soft-delete blocking, Data Scope inside and
  outside a transaction, commit-only callbacks, legacy-array compatibility and the mixed-router
  override.
- Removed two obsolete **source-string** assertions in
  `bls-server/src/config/__tests__/dynamic-config.test.ts` (they searched the text of
  `defineCrudModule` for `onWrite` before `insertInto`; the `edit`-handler marker no longer matched
  after transpilation, so they had become vacuous and contradicted the current semantics). The real
  semantics are asserted behaviourally in `crud.test.ts` instead.

---

## [1.2.0] — 2026-09-20

Filled the **interface** and **frontend** gaps found by a coverage audit of the memory set
(scope: `bls-admin` + `bls-server` only, Koa backend). Verified against
`HEAD = 0fc7c43` / `VERSION 1.0.0`.

### Added — interface gaps (P2)

- `00-common/08-external-api-and-service-auth.md` — the four entry points
  (`/api`, `/api/v1` + `Deprecation`/`Sunset`, `/openapi/v1`, `/internal`), the
  `openApiAuth` flow (headers, 300 s window, nonce key, `METHOD:PATH:TIMESTAMP:NONCE:BODY`
  signature), the `internalAuth` flow (`INTERNAL_SECRET`, `INTERNAL_IP_ALLOWLIST` prefix
  matching, weak-secret startup rules), `error-handler` + error-class → code table,
  `http-metrics` route-label rules, `/api/health|metrics|ready`, Swagger
  (`/api/docs`, `/api/openapi.json`) and the OpenAPI generator
  (`npm run openapi` / `openapi:serve`).
- `00-common/09-realtime-websocket.md` — `/ws/realtime`: path/env gates, the `auth` handshake,
  the `realtime-info` payload, 3 s broadcast, 15 s ping/pong, close codes, nginx `Upgrade`
  blocks, the dev proxy rule, `useWebSocket` options/defaults/reconnect policy,
  `GlobalRealtimeProvider`, and the dead ops-release channel push.
- `00-common/10-job-api-and-queue.md` — `POST|GET /api/system/jobs`, `GET /api/system/jobs/:jobId`
  (prefix is **`system/jobs`**, plural), `ALLOWED_JOB_TYPES`, the `sys_jobs` claim/retry/dead-letter
  semantics, the worker constants, and the four registered job types.
- `pages/global-search.md` — the Ctrl+K overlay + the `/system/global-search/*` API + the
  `sys_search_index` / `sys_global_search_config` model + the rebuild algorithm + the
  `RebuildIndexModal` hosted on the System Parameters page.

### Added — frontend layer (P3)

- `00-common/11-frontend-shell.md` — `config/config.ts` (utoopack, `define`, locale, antd),
  the dev-only proxy rules, `routes.ts`, the whole `app.tsx` runtime
  (`getInitialState`, `layout`, `rootContainer` provider order, SettingDrawer optimistic save),
  `access.ts` (dead), `requestErrorConfig.ts` (interceptor order, 401 retry, tinyint→boolean list),
  i18n (8 languages × 7 namespaces; backend menu names bypass i18n), global/PWA files, and the
  17 unrouted scaffold pages.
- `00-common/12-frontend-data-layer.md` — every hook with signature/returns/endpoints
  (incl. `useMultiDict` living in `hooks/useDict.ts`), `CrudTablePage` props and behaviours,
  the live vs dead shared components, the complete `services/ant-design-pro/api.ts` surface,
  every other `services/*` file, dict caching, and cookbooks for adding a CRUD page / service /
  dictionary / upload.

### Documented defects found while writing (not fixed in code)

- **`/openapi/v1` is non-functional**: there is no `sys_api_key` table, model or management
  endpoint anywhere in the repo, so `openApiAuth` always ends as `403 Invalid API Key`.
  `API_KEY_CREATED` / `API_KEY_REVOKED` exist in the event enum but are never emitted.
- **Ops-release WebSocket push is dead**: `release.ws.ts` requires a wrong path
  (`../../../system/realtime/realtime.ws`) and `getWsServer` is not exported by
  `realtime.ws.ts`; `subscribeChannel` has no protocol. `sendToChannel()` calls in
  `release.service.ts` are silently dropped (the page falls back to polling).
- **Realtime broadcast is not auth-gated**: `client.isAuthed` is set and never read.
- **`sys_search_index` schema drift**: the rebuild writes `create_time/update_time/created_by/
  source_table` while `sql/Init.sql` defines `created_at/updated_at` and neither of the other two.
- **`sys_jobs` status enum drift**: `Init.sql` has `failed` but no `dead`; the migration has `dead`
  but no `failed`; the code writes `dead`.
- **Job handlers `export` / `import` / `notification` are stubs**; `notification`'s comment about
  `sys_notification` is wrong.
- **Permission codes not seeded**: `system:job:*`, `system:global-search:*`,
  `system:search-index:rebuild`.
- **Global search is not really an index**: `/search` uses `LIKE '%kw%'` (the table's FULLTEXT
  index is unused), permissions are written into the index but never enforced, and the rebuild
  loads whole tables with no batching or transaction.
- **`/api/metrics` is unauthenticated** (duplicate of the protected `/internal/metrics`);
  `internalAuth` and `openApiAuth` compare secrets non-constant-time; the IP allow-list is
  prefix string matching, not CIDR.
- Frontend: 17 unrouted scaffold pages, `access.ts` dead (two competing permission mechanisms),
  `global.style.ts` / `service-worker.js` / `manifest.json` dead, duplicate replay-header
  generation, three raw-fetch AI clients (two dead, two reading `localStorage['token']` directly),
  `PageResult<T>` declared twice, `CrudTablePage` computing import/export permissions it never
  passes on.

### Deferred (audited but intentionally not written yet)

- **P1 operations set**: environment-variable reference, observability/metrics catalogue,
  full async subsystem (outbox publisher, distributed lock), backup/restore/DR scripts,
  deployment topology (compose profiles, nginx, graceful shutdown).
- **P4 code hygiene**: deleting `bls-server/src/middlewares/` (empty, confusable with
  `middleware/`) and `bls-server/src/api/test/` (empty), removing the unused
  `distributed/rate-limit.ts` and `distributed/idempotency.ts`, and cleaning the frontend
  scaffold pages. These need code changes, not documentation.

### Pending re-verification (resolved in 1.3.0)

> Resolved: the CRUD-config documents were re-verified and rewritten in **1.3.0**. The code is still
> uncommitted, so the touched documents carry `Verified commit: 60b7b37` plus an
> "uncommitted-until-then" notice until it is committed.

Detected **while writing this release**: the working tree contains uncommitted backend changes
that are not part of `0fc7c43` —

```
 M bls-server/src/core/crud.ts                (~535 lines)
 M bls-server/src/core/router.ts
 M bls-server/src/scripts/generate-openapi.ts
?? bls-server/src/core/crud-config.ts
?? bls-server/src/core/crud-keys.ts
```

They introduce a **config-style CRUD declaration** (`defineCrudConfig({table, pkField, fields})`
with a single field source that derives whitelists / search / filter / response projection / Zod
validation) while keeping the legacy array style backward compatible.

Affected documents once those changes land (then bump their `Verified commit`):

- `00-common/00-architecture.md` §5 — the CRUD factory section still describes only the
  array-style `createFields/updateFields/filterFields/schema` configuration, and does not mention
  `crud-config.ts` / `crud-keys.ts` or the new `fields` / `select` projection.
- `00-common/08-external-api-and-service-auth.md` §7 — the OpenAPI generator's route/parameter
  discovery changed with `generate-openapi.ts`.
- Every page document that lists `defineCrudModule` config for `system/config` and
  `system/theme` (the only two modules using it today).

Do **not** treat the CRUD-factory details in those documents as verified against the uncommitted
tree until it is committed and re-checked.

---

## [1.1.0] — 2026-09-20

### Added

- **`00-common/07-database.md`** — the database memory, the previously missing piece.
  Verified against `sql/Init.sql` (40 `CREATE TABLE` statements), the 9 files in
  `bls-server/migrations/` and the actual usage in `bls-server/src`.
  Contents:
  - **Sources of truth** and their precedence (`Init.sql` for new installs vs
    `bls-server/migrations/` for existing ones, plus `sys_migrations`).
  - **Conventions**: utf8mb4/InnoDB, `varchar(32)` Snowflake PKs, `tenant_id`
    (platform = `'000000'`), `deleted`, `status char(1)`, `sort_num`, `create_time`/`update_time`,
    and the explicit statement that there are **no FK constraints**.
  - **Naming exceptions** that must not be "fixed": `sys_operation_log.operator_time`,
    `created_at`/`updated_at` on `sys_webhook*` and `ai_conversation*`, and the tables with no
    `create_time` at all.
  - **Full 40-table inventory** grouped into 8 domains with PK, tenant flag, soft-delete flag,
    column count, purpose and the owning `bls-memory` page document.
  - **Seed data** summary in `Init.sql` (tenants `000000` / `100000`, roles `000001` / `100001`,
    packages `P001` / `P100`, dicts, menus, page configs, MinIO storage config `000001`).
  - **Migration workflow** + a table describing all 9 existing migrations, including
    `20260920_012_crud_completeness.sql` (adds `sys_theme_config.remark` and seeds the 14 button
    permissions plus their role/package grants).
  - **§7 Known drift** — the consolidated, verified list of database-level problems.
  - Rationale for *not* duplicating per-table DDL (it lives in the owning page doc and in
    `sql/Init.sql`), with the `rg` command to read a table definition.

- README: row for `07-database.md` in the shared-document index, and a clarification that
  `Verified commit` tracks the last commit that changed **application code** (docs-only commits
  do not invalidate verification).

### Added — storage environment strategy (test MinIO vs production OSS / CDN)

- `pages/file-config-storage.md` → **Appendix A** (document version 1.1.0): the answer to
  "test uses MinIO, production should switch to OSS or another CDN bucket, selected by which user
  / domain accesses the system".
  - **A.1** the switching model that already exists: access domain → `sys_tenant.domain_name` →
    tenant → the tenant's `is_default='1'` `sys_storage_config` row → `createStorageProvider()`,
    so per-customer / per-environment switching needs **no code change**.
  - **A.2** per-environment configuration matrix (MinIO / Aliyun OSS / Tencent COS / AWS S3) with
    endpoint, region, port, `use_ssl`, buckets, `public_base_url`, plus the seeded test row and
    the 4-step switchover procedure.
  - **A.3** the blocker: `AliyunOssProvider` / `TencentCosProvider` / `AwsS3Provider` /
    `LocalProvider` are stubs — `upload()` performs **no network call** (nothing is stored),
    `remove()` is a no-op, `getPrivateUrl()` returns the public URL. Full implementation
    checklist (SDKs, methods, `config_json`, tests, dict seed).
  - **A.4** CDN notes: public files already build CDN-friendly URLs from `public_base_url`;
    private files need presigned URLs and `private_base_url` is never read; nginx `location /files/`
    hardcodes MinIO; `MINIO_USER` / `MINIO_PASSWORD` only provision the container — there is no
    `STORAGE_*` env bootstrap.
  - **A.5** fields that look configurable but are not wired up: `policy_json`
    (`maxSizeMB` / `allowedExt` / `privateExpireSeconds` are decorative; the real limit is
    `sys_config.sys.upload.maxSize` and the whitelist is hardcoded in `security/file-security.ts`),
    `private_base_url`, `config_json`.
  - **A.6** recommended production setup table.
- `00-common/06-file-and-excel-security.md` (document version 1.0.1) — cross-reference to
  Appendix A next to the provider table.
- `00-common/07-database.md` — `sys_storage_config` inventory row annotated with the environment
  strategy and the unused columns.

### Documented database drift (verified, not fixed in code)

- `sys_security_log` has PK `id` and **no `log_id` / `source`**, while `writeSecurityLog()`
  inserts both and the Security Log page uses `rowKey="logId"`.
- `sys_login_log` is never written — `writeLoginLog()` is defined but not called by the login flow.
- `sys_storage_type` and `sys_bucket_access_type` are referenced as `value_enum_code` by
  `sys_page_column_config` but do not exist in `sys_dict_type`.
- `sys_tenant.expire_time` is stored but never enforced; `package_id` is not validated
  against `sys_package`.
- `sys_menu` / `sys_package` / `sys_package_menu` have no `deleted` column and are hard deleted.
- **`.codex/skills/bls-kox/references/database-schema.md` is stale**: it documents only 18 of the
  40 tables and misnames two of them (`sys_job` → really `sys_jobs`;
  `sys_file_config` → really `sys_storage_config`). `AGENTS.md` still points to it, so
  `00-common/07-database.md` must be treated as the current entry point until it is regenerated.

---

## [1.0.1] — 2026-09-20

Aligned the whole document set with the code as committed on 2026-09-20
(`HEAD = 0fc7c43`, `VERSION = 1.0.0`).

Scope of the review: the two commits of that day
(`fd1b4aa` — *fix(权限): 统一权限校验与租户隔离*, `0fc7c43` — document metadata). The changed
code surface was: `bls-server/src/core/{crud,router,errors}.ts`,
`bls-server/src/middleware/permission.ts`, `bls-server/src/api/auth/index.ts`,
`bls-server/src/api/common/excel/index.ts`, the system modules
(`ai-model, config, dept, dict, menu, package, page-config, role, storage, tenant, theme, user`),
`sql/Init.sql` + `bls-server/migrations/20260920_012_crud_completeness.sql`,
`bls-admin/src/hooks/usePermission.ts` and four admin pages, plus the Java backend and
`bls-server/openapi.json`.

### Added

- **`Verified commit`** field in the metadata line of all 34 documents, and a matching row /
  "Re-verifying after new commits" procedure in `README.md`.
- Java-side note kept in sync with the same permission codes as Koa (no document change needed).

### Fixed

- `pages/ai-model.md` — the `system:ai-model:list/add/edit/remove/status` button permissions are
  now seeded in `sql/Init.sql` (`ai_model_*_0001`, children of menu `ai_model_0001`); the previous
  note that only `ai:models:view` existed was removed.
- `pages/file-config-storage.md` — the page's `permissions` prop is
  `{import, export, create, edit, remove}`; the `status` key was removed when the status toggle was
  disabled. Also clarified that none of these keys is enforced (no Excel toolbar is rendered).
- `pages/system-webhook.md` — verified that `sys_page_config` row **id** `PC_WEBHOOK` carries
  `page_code = system:webhook:list`, which matches `usePageConfig`; the previous "verify it
  matches" caveat was replaced with the confirmed fact.

### Verified (no change required)

- Permission codes for every documented endpoint, cross-checked against `hasPerm(...)` in
  `bls-server/src/api/**` and `releasePermission(...)` in `ops-release/release-permission.ts`.
- `bls-admin` `permissions` props on user / theme / tenant / package / config / role / ai-model /
  storage / files / log-login pages.
- Replay rule table (`config/replay-protection.ts`) and rate-limit rule table
  (`security/rate-limit/rules.ts`) — both files were untouched by the day's commits.
- `core/crud.ts` semantics documented in `00-common/00-architecture.md`
  (`SYSTEM_FIELDS`, `permit()` → `${permPrefix}:${action}`, `softDelete ?? true`,
  `statusField ?? 'status'`, `globalTable`), `middleware/permission.ts` dual-field permission
  compatibility, `AuthService.profile()` returning both `perms` and `permissions`,
  `usePermission()` reading `perms ?? permissions` with the `isAdmin === '1'` short-circuit.
- Excel module `hasDeleted` / `tenantAware` behaviour in `00-common/06-file-and-excel-security.md`.
- `core/router.ts` auto-registration modes, `GET /:id` + 0-rows → 404, and the
  `filterFields`/`createFields`/`updateFields` whitelists on `system/config` and `system/theme`.
- `CrudTablePage` still computes `canImport`/`canExport` but renders
  `ExcelToolbar` only when `excelMetaKey` is set (so the declared import/export permissions remain
  unenforced — still listed as a known gap).
- Confirmed still-missing seed data: dictionary types `sys_storage_type` and
  `sys_bucket_access_type` are referenced by page column configs but not seeded.

---

## [1.0.0] — 2026-09-20

Document set created. Code version verified against: **1.0.0**.

### Added

- `README.md` — purpose, AI-agent usage steps, page index, shared-document index, per-page
  document template, and the version metadata convention.
- `00-common/00-architecture.md` — modules and ports, Koa middleware order, response envelope
  and security error codes, router auto-scan modes, generic CRUD factory, hard project rules,
  verification commands.
- `00-common/01-redis.md` — the single Redis reference: connection config and key prefix,
  full key-namespace table (auth sessions, Session Center, replay nonces, idempotency, rate
  limiting, IP blocking, dynamic config cache, release lock, upload lock), subsystem details,
  and developer rules.
- `00-common/02-replay-protection.md` — modes, check order, signature canonical payload, the
  complete 13-rule table, error-code → event-type mapping, idempotency state machine, frontend
  header behaviour.
- `00-common/03-rate-limiting.md` — dimensions, Lua counter algorithm, the complete 7-rule
  table, per-page cheat sheet, event-center relationship, how to add a rule.
- `00-common/04-auth-and-permissions.md` — auth endpoints, login domain resolution, tokens and
  sessions, refresh rotation and reuse detection, `jwtAuth`/`hasPerm`, permission code
  convention, tenant isolation and data scope, password hashing, frontend token strategy.
- `00-common/05-security-log-and-event-center.md` — security event types, risk levels and
  default mapping, the 6 risk rules, automatic actions, IP-block middleware, log tables,
  known `sys_security_log` schema mismatch.
- `00-common/06-file-and-excel-security.md` — upload validation pipeline (extension, MIME,
  magic number, size, module name, object key), storage provider implementation status, secret
  masking, Excel import/export endpoints and rules.
- 26 page documents under `pages/`, one per admin route:
  `user-login`, `user-register`, `dashboard`, `account-settings`,
  `system-dept`, `system-user`, `system-role`, `system-menu`,
  `system-config`, `system-dict`, `system-theme`, `system-page-config`,
  `system-log-audit`, `system-log-security`, `system-log-login`, `system-log-sql-audit`,
  `system-security-center`, `system-webhook`,
  `file-config-storage`, `file-config-files`,
  `tenant-list`, `tenant-package`,
  `ai-workbench`, `ai-model`, `ai-usage`,
  `ops-release`.
  Each covers: summary, frontend → API map, backend endpoints with validation, security rules
  (replay + rate limit + permissions + tenant isolation), frontend-only validation,
  known gaps, and extension steps.

### Known issues documented (not fixed in code)

- `sys_security_log` schema does not match `writeSecurityLog()` (missing `log_id` / `source`).
- The login flow never writes `sys_login_log`.
- `POST /api/system/user/reset-password` has a replay rule but no route.
- `GET /api/system/storage/file/:fileId/download` returns a DB row instead of the file.
- Log endpoints (`/api/system/log/*`) apply no tenant filter.
- AI conversation endpoints have incomplete ownership checks.
- The `/api/ai/chat/conversations` replay exemption is exact-match only.
- `sys_tenant.expire_time` is stored but never enforced; `package_id` is not validated.
- Only the MinIO storage provider is a real implementation; the others are stubs.

### Conventions established

- Documents are written in **English** so AI agents parse them reliably.
- Redis is documented **once**, in `00-common/01-redis.md`; page documents only reference it.
- The backend permission code is the source of truth when the frontend disagrees.

### Corrections made while verifying against the code

- `system:theme` and `system:user`: the frontend `permissions` prop now uses `:add` (matching the
  backend), so the previously noted `:create` ↔ `:add` mismatch was dropped.
- `system:user`: the batch "kick offline" action is gated by `system:user:kick` (documented).
- `system:ai-model`: the frontend `permissions` prop holds permission strings
  (`system:ai-model:add/edit/remove/status`) — documented as such.
