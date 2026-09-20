# Page — Global Search (Ctrl+K)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

> This is a **cross-page overlay**, not a routed page: it renders inside the layout header on
> every authenticated page, and its rebuild action lives on the System Parameters page
> (`/system/config`).

## 1. Summary

| Item | Value |
|---|---|
| Trigger | `Ctrl+K` / `Cmd+K` anywhere in the admin layout (Escape closes) |
| Components | `bls-admin/src/components/RightContent/GlobalSearchModal.tsx`, `bls-admin/src/components/RebuildIndexModal/index.tsx` |
| Mounted from | `bls-admin/src/app.tsx` → `layout.actionsRender` → `<GlobalSearchModal />` (also referenced by the unused `RightContent` component) |
| Backend module | `bls-server/src/api/system/global-search/index.ts` (prefix `/system/global-search`) |
| Tables | `sys_search_index` (data), `sys_global_search_config` (which tables to index) |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md`, `07-database.md`, `10-job-api-and-queue.md` |

Purpose: one search box over the entities an administrator cares about (users today), backed by a
flat MySQL index table instead of per-module queries.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| Type ≥ 2 characters in the search box | `globalSearch(keyword)` — `bls-admin/src/services/system/global-search.ts` | GET | `/api/system/global-search/search?keyword=` |
| Press `Enter` / click a result | `history.push(\`${routePath}?id=${id}\`)` | — | — (client-side navigation) |
| Open the rebuild modal (System Parameters toolbar → 重建索引) | `RebuildIndexModal` | GET | `/api/system/global-search/index/modules` |
| Confirm the rebuild | `RebuildIndexModal` | POST | `/api/system/global-search/index/rebuild` (`{moduleKeys:[...]}`) |

Behaviour details:

- Opens on `(e.ctrlKey || e.metaKey) && e.key === 'k'`; `Escape` closes;
  `ArrowDown` / `ArrowUp` move `selectedIndex`; `Enter` navigates.
- Debounce `300 ms`; input shorter than 2 characters clears the results.
  Pressing the search button calls `fetchData` directly and bypasses the debounce.
- Result rows show `title` / `subtitle`, grouped by `moduleName`; clicking pushes
  `routePath?id=<bizId>` (list pages therefore receive `?id=` in their query string).
- The modal's help tooltip points users at 「系统参数」→「重建索引」.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/global-search'`, `T = 'sys_global_search_config'`.
All endpoints require `jwtAuth()` **and** `hasPerm(...)`.

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/search` | `system:global-search:search` | `keyword.trim().length < 2` → `{code:200,data:[]}`. Otherwise `SELECT … FROM sys_search_index WHERE tenant_id=<jwt tenant> AND deleted=0 AND status='0' AND (title LIKE %kw% OR subtitle LIKE %kw% OR content LIKE %kw%) ORDER BY create_time DESC LIMIT 50`. Results are grouped by `module_key` into `{moduleKey, moduleName, routePath, list:[{id, title, subtitle, moduleKey, moduleName, routePath}]}` |
| GET | `/config/list` | `system:global-search:config:list` | `sys_global_search_config WHERE deleted=0` |
| POST | `/config/save` | `system:global-search:config:save` | `pickAllowed` + `toSnake` over `searchId, moduleKey, moduleName, permission, routePath, sourceTable, bizIdField, titleField, subtitleField, contentFields, tenantField, ownerField, deptField, createdByField, statusField, deletedField, enabled, sort, remark`; insert when `searchId` is absent, else update. Returns `{code:200,message:'保存成功'}` |
| DELETE | `/config/:id` | `system:global-search:config:delete` | soft delete (`deleted=1`) |
| GET | `/index/modules` | `system:search-index:rebuild` | enabled + not deleted configs, `ORDER BY sort ASC` — feeds the rebuild modal |
| POST | `/index/rebuild` | `system:search-index:rebuild` | Rebuild index (below). Empty config set → `{code:400, message:'未找到可用的搜索配置'}` |

### Rebuild algorithm (`POST /index/rebuild`)

For every enabled config (optionally filtered by `moduleKeys`):

1. `SELECT *` from `config.source_table` — **whole table, no pagination or batching**.
2. Skip rows whose `deleted_field` = 0 is false.
3. Build `content` by joining the comma-separated `content_fields` values with spaces.
4. UPSERT into `sys_search_index` with `index_id = "<tenantId>:<moduleKey>:<bizId>"`,
   writing `index_id, tenant_id, module_key, module_name, biz_id, title, subtitle, content,
   permission, route_path, owner_id, dept_id, created_by, status, deleted, source_table,
   create_time, update_time`.
5. Return `{totalTables, successTables, failedTables, totalRows, details:[{moduleKey,moduleName,rowCount,error?}]}`
   and message `重建完成：<totalRows>条索引`.

There is **no transaction, no per-row error isolation and no progress streaming** — one failing
row fails that whole source table. The frontend progress bar is cosmetic (`30` → `100`).

### Seed configuration

`sql/Init.sql` seeds exactly one config row:

```
('GS_USER','user','用户管理','system:user:search','/system/user','sys_user','user_id',
 'username','nickname','username,nickname,real_name,phone,email','tenant_id',NULL,'dept_id',
 'create_by','status','deleted',1,10, ...)
```

So today only `sys_user` is searchable. Adding a module means inserting another
`sys_global_search_config` row (via SQL or the unused `/config/save` endpoint) and rebuilding.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /search` | off | read 600/60 | `system:global-search:search` |
| `GET /config/list` | off | read 600/60 | `system:global-search:config:list` |
| `POST /config/save` | default write nonce (120 s / 300 s) | write 300/60 | `system:global-search:config:save` |
| `DELETE /config/:id` | default write nonce | write 300/60 | `system:global-search:config:delete` |
| `GET /index/modules`, `POST /index/rebuild` | POST → default write nonce | write 300/60 | `system:search-index:rebuild` |

Tenant isolation: `/search` is scoped by the JWT tenant id; the rebuild writes `tenant_id` taken
from the same source. The config table is effectively platform-level (no tenant filter is applied
to `sys_global_search_config` reads/writes).

⚠ The permission codes `system:global-search:*` and `system:search-index:rebuild` are **not
seeded** in `sql/Init.sql`, so only the platform tenant (or a `*` holder) can call these endpoints
today.

---

## 5. Frontend-only validation

- Minimum query length 2 (shorter input clears results without a request).
- 300 ms debounce; results are not cached.

## 6. Backend-only rules

- `keyword` shorter than 2 characters returns `[]` (no error).
- `LIMIT 50` on results.
- Rebuild requires at least one enabled config.

---

## 7. Known gaps / discrepancies

1. **Schema drift (real defect).** The rebuild writes `create_time`, `update_time`, `created_by`
   and `source_table`, and `/search` sorts by `create_time`, but `sql/Init.sql`'s
   `sys_search_index` has **`created_at` / `updated_at`** and neither `created_by` nor
   `source_table`. Against the `Init.sql` schema the UPSERT and the sort would fail. The Rust port
   writes the same non-existent columns. Pick one naming and fix both DDLs + the code.
2. **The index is not actually a search index.** `/search` uses `LIKE '%kw%'`, so the
   `FULLTEXT ft_search_content(title, subtitle, content)` index defined on the table is never
   used, and leading-wildcard `LIKE` cannot use an index at all. For real scale, switch to
   `MATCH ... AGAINST` (or an external engine) and index the `title`/`subtitle` LIKE patterns.
3. **Permissions are not enforced at search time.** A `permission` column is written into the
   index and never read — every user sees every indexed row of their tenant regardless of the
   module permission. The comment in `/search` claiming "做权限过滤" is misleading.
4. **`/config/*` endpoints have no frontend caller** — there is no UI to manage
   `sys_global_search_config`; modules must be added via SQL.
5. **Rebuild does not scale**: full-table `SELECT *` per module, one UPSERT per row, no batching,
   all inside a single HTTP request. It will time out on large tables. Consider moving it to the
   job queue (`00-common/10-job-api-and-queue.md`) with progress reporting.
6. **The rebuild button is not permission-gated in the UI.** `pages/system/config/index.tsx`
   renders 「重建索引」 without checking `system:search-index:rebuild` (the backend still checks).
7. **The progress bar is fake**, and a failed table only surfaces inside `result.details`.
8. `GlobalSearchModal` is mounted once from `app.tsx`; the `RightContent` component that also
   renders it is dead code, so there is no duplicate registration — but if you revive
   `RightContent`, remove one of the two.

---

## 8. How to extend

1. **Make another module searchable**: insert a `sys_global_search_config` row
   (`module_key`, `module_name`, `permission`, `route_path`, `source_table`, `biz_id_field`,
   `title_field`, `subtitle_field`, `content_fields`, `tenant_field`, `deleted_field`, `enabled`,
   `sort`), grant `system:user:search`-style permissions if you introduce them, then POST
   `/index/rebuild` (or click 重建索引) and search.
2. **Add a config management page**: the endpoints already exist — a small CRUD page over
   `/api/system/global-search/config/*` with `system:global-search:config:*` permissions; seed
   those permission rows first. Then add its own page document.
3. **Enforce permissions on results**: filter `sys_search_index` by the caller's permission list
   (or post-filter in the handler) and remove the misleading comment.
4. **Move the rebuild to the queue**: add an `search-index` job type (see
   `00-common/10-job-api-and-queue.md` §7) and have the endpoint enqueue + return a `jobId`.
5. **Gate the rebuild button** with `usePermission().can('system:search-index:rebuild')`.
6. Update this document and `CHANGELOG.md`.
