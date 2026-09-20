# 07 — Database Schema & Migrations (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

Single entry point for everything database-related: where the schema lives, the conventions,
the full table inventory (all **40** tables), the migration workflow, and the **known drift**
between the schema and the code.

Verified against: `sql/Init.sql` (40 `CREATE TABLE` statements, 1352 lines), the 9 files in
`bls-server/migrations/`, and `bls-server/src` usage. Commit `0fc7c43` / `VERSION 1.0.0`.

---

## 1. Sources of truth (in order)

| # | Source | Purpose | Authoritative for |
|---|---|---|---|
| 1 | `sql/Init.sql` | Full DDL **+ seed data** (menus, roles, dicts, page configs, demo rows) for a fresh install. Both backends share it. | New environments |
| 2 | `bls-server/migrations/*.sql` | Incremental, idempotent-ish patches for **already deployed** databases | Existing environments |
| 3 | `sql/ops_release.sql`, `sql/sys_sql_audit.sql`, `sql/migrate-password-algorithm.sql` | Standalone DDL/data scripts also inlined into `Init.sql` (or one-off data fixes) | Reference |
| 4 | `.codex/skills/bls-kox/references/database-schema.md` | Legacy per-table reference used by the bls-kox skill | ⚠ **STALE — see §7** |
| 5 | This document | Inventory, conventions, drift, workflow | Orientation & AI agents |

`Init.sql` wraps everything in `DROP TABLE IF EXISTS` + `CREATE TABLE` pairs, so it is
**destructive** — never run it against a live database that holds real data.

`sys_migrations` (pk `version`) records which incremental scripts have been applied.

---

## 2. Conventions

| Rule | Detail |
|---|---|
| Charset | `utf8mb4` / `utf8mb4_0900_ai_ci`, `ENGINE=InnoDB` |
| Primary key | `varchar(32)` Snowflake string (`generateSnowflakeId()`); seed rows may use short ids (`000001`, `C057`, `P001`, `0001A`). Join tables use a composite PK. |
| Multi-tenant | `tenant_id varchar(32) NOT NULL`; platform tenant = the **string** `'000000'`. |
| Soft delete | `deleted tinyint NOT NULL DEFAULT 0` (`0` alive, `1` deleted). |
| Status | `status char(1) NOT NULL DEFAULT '0'` (`0` normal/enabled, `1` disabled). |
| Ordering | `sort_num int NOT NULL DEFAULT 0` — **never** `order_num`. |
| Timestamps | `create_time` / `update_time` — **never** `created_at` / `updated_at`. |
| Menu type | `menu_type char(1)`: `0` directory, `1` menu, `2` button. |
| Foreign keys | **No FK constraints anywhere.** Referential integrity is enforced in application code (e.g. `assertTenantResource`, package-in-use guard). |
| Column naming | `snake_case`; TS/Java properties `camelCase`; the Koa router converts `data`/`rows` snake→camel on the way out. |

### Naming exceptions (must know!)

These tables legitimately deviate from the timestamp rule. Do not "fix" them without a migration:

| Table | Uses |
|---|---|
| `sys_operation_log` | `operator_time` instead of `create_time` |
| `sys_webhook`, `sys_webhook_delivery` | `created_at` / `updated_at` |
| `ai_conversation`, `ai_conversation_message` | `created_at` / `updated_at` |
| `sys_event_log`, `sys_jobs`, `outbox_event`, `sys_ai_usage`, `sys_sql_audit`, `sys_search_index`, `sys_migrations`, `ops_release_log` | no `create_time` at all (own time column or none) |

---

## 3. Table inventory (40 tables)

`T` = has `tenant_id`, `D` = has `deleted` (soft delete), `#` = number of columns
(excluding index-only lines).

### 3.1 Platform / infrastructure

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `sys_migrations` | `version` | – | – | 4 | Applied incremental migration log | this doc §5 |
| `sys_jobs` | `job_id` | Y | – | 13 | Queue / worker job table (`SELECT … FOR UPDATE SKIP LOCKED`) | `00-architecture.md` |
| `outbox_event` | `event_id` | Y | – | 12 | Transactional outbox for reliable event publishing | `00-architecture.md`, `00-common/05` |
| `sys_event_log` | `event_id` | Y | – | 16 | Event center log written by `bls-event-service` | `00-common/05` |
| `sys_search_index` | `index_id` | Y | Y | 16 | Global search (Ctrl+K) index | `pages/system-config.md` |
| `sys_global_search_config` | `search_id` | – | Y | 22 | Searchable-module configuration (global) | `pages/system-config.md` |

### 3.2 Identity, tenancy & RBAC

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `sys_tenant` | `tenant_id` | Y | Y | 12 | Tenants; `000000` = platform; `uk_tenant_domain` | `pages/tenant-list.md` |
| `sys_user` | `user_id` | Y | Y | 23 | Users; `password` + `password_algorithm`; `uk` on username+tenant | `pages/system-user.md`, `pages/user-login.md` |
| `sys_dept` | `dept_id` | Y | Y | 9 | Department tree | `pages/system-dept.md` |
| `sys_role` | `role_id` | Y | Y | 11 | Roles; `role_key`, `data_scope`, `uk_role_tenant_key` | `pages/system-role.md` |
| `sys_user_role` | `user_id, role_id` | – | – | 2 | User ↔ role link | `pages/system-user.md` |
| `sys_role_menu` | `role_id, menu_id` | – | – | 2 | Role ↔ menu/button grant | `pages/system-role.md` |
| `sys_menu` | `menu_id` | – | – | 12 | **Global** menu/permission tree (no `tenant_id`, no `deleted`) | `pages/system-menu.md` |
| `sys_package` | `package_id` | – | – | 6 | **Global** tenant packages (no `tenant_id`, no `deleted`) | `pages/tenant-package.md` |
| `sys_package_menu` | `package_id, menu_id` | – | – | 2 | Package ↔ menu grant | `pages/tenant-package.md` |

### 3.3 Configuration, dictionaries, theming & page config

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `sys_config` | `config_id` | Y | Y | 11 | Key/value parameters (`sys.user.defaultPassword`, `sys.upload.maxSize`, …) | `pages/system-config.md` |
| `sys_theme_config` | `theme_id` | Y | Y | 20 | Layout/theme settings (incl. `token_json`, `remark`) | `pages/system-theme.md` |
| `sys_dict_type` | `dict_type_id` | Y | Y | 9 | Dictionary types; `uk_dict_type_tenant` | `pages/system-dict.md` |
| `sys_dict_data` | `dict_data_id` | Y | Y | 12 | Dictionary values | `pages/system-dict.md` |
| `sys_page_config` | `page_config_id` | Y | Y | 10 | Per-page table configuration header | `pages/system-page-config.md` |
| `sys_page_column_config` | `column_id` | Y | Y | 18 | Per-column schema (visibility, searchable, `value_enum_code`, …) | `pages/system-page-config.md` |

### 3.4 Files & storage

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `sys_storage_config` | `storage_id` | Y | Y | 25 | Object-storage backends, one default per tenant (keys masked in API responses); MinIO for test, OSS/COS/S3 + CDN for production — see `pages/file-config-storage.md` **Appendix A**. Note `policy_json` / `private_base_url` are stored but not read by any provider. | `pages/file-config-storage.md` |
| `sys_file` | `file_id` | Y | Y | 18 | Uploaded file metadata | `pages/file-config-files.md` |
| `sys_upload_audit` | `audit_id` | Y | – | 24 | Upload audit trail (validation result, size limit, bucket…) | `pages/system-log-audit.md` |

### 3.5 Logs, audit & security

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `sys_operation_log` | `log_id` | Y | – | 20 | Operation audit (`operator_time`, not `create_time`) | `pages/system-log-audit.md` |
| `sys_login_log` | `log_id` | Y | – | 11 | Login attempts — ⚠ **never written today**, see §7 | `pages/system-log-login.md` |
| `sys_security_log` | `id` | Y | – | 14 | Security events — ⚠ **schema drift**, see §7 | `pages/system-log-security.md`, `pages/system-security-center.md` |
| `sys_sql_audit` | `audit_id` | Y | – | 13 | Failing SQL statements | `pages/system-log-sql-audit.md` |
| `sys_ip_blacklist` | `id` | Y | – | 10 | Manual/auto IP blocks (mirrored to Redis) | `pages/system-security-center.md` |

### 3.6 Webhooks

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `sys_webhook` | `webhook_id` | Y | – | 9 | Registered webhooks (`url`, `events` json, `secret`, `status`) | `pages/system-webhook.md` |
| `sys_webhook_delivery` | `id` | Y | – | 11 | Delivery attempts / logs (`pending` / `success` / `failed`) | `pages/system-webhook.md` |

### 3.7 AI

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `ai_model_config` | `config_id` | Y | Y | 20 | AI providers/models (`model_id`, `api_key`, `base_url`, `is_default`) | `pages/ai-model.md` |
| `ai_conversation` | `id` | Y | Y | 7 | Chat conversations (per user) | `pages/ai-workbench.md` |
| `ai_conversation_message` | `id` | – | Y | 6 | Chat messages | `pages/ai-workbench.md` |
| `sys_ai_usage` | `usage_id` | Y | – | 16 | Token/cost accounting feed for the usage center | `pages/ai-usage.md` |

### 3.8 Ops / release

| Table | PK | T | D | # | Purpose | Documented in |
|---|---|---|---|---|---|---|
| `ops_environment` | `env_id` | Y | Y | 11 | Deploy environments | `pages/ops-release.md` |
| `ops_release_version` | `version_id` | Y | Y | 10 | Built/deployable versions | `pages/ops-release.md` |
| `ops_release_task` | `task_id` | Y | Y | 23 | A deploy or rollback task (+ steps/logs) | `pages/ops-release.md` |
| `ops_release_step` | `step_id` | – | – | 13 | Step-by-step progress | `pages/ops-release.md` |
| `ops_release_log` | `log_id` | – | – | 6 | Release log lines | `pages/ops-release.md` |

---

## 4. Seed data in `Init.sql`

`Init.sql` seeds, in order: dictionaries (18 `INSERT INTO` statements overall) → menus/roles/
role-menu grants → packages/package-menu → tenants (`000000` platform, `100000` default) →
demo users/roles → `sys_page_config` + `sys_page_column_config` (the column schemas every
`CrudTablePage` reads) → storage config (`000001` MinIO, `is_default = 1`) → theme/config values.

Key seed identities:

| Entity | Value |
|---|---|
| Platform tenant | `000000` |
| Default tenant | `100000` |
| Platform admin role / user | role `000001`, user `000001` (superadmin) |
| Tenant admin role | `100001` |
| Packages | `P001` (平台版), `P100` (租户标准版套餐) |
| Default password | `md5('123456')`, dynamic key `sys.user.defaultPassword` |
| Page-config ids | e.g. `PC_WEBHOOK` (row id; its `page_code` is `system:webhook:list`) |

---

## 5. Migration workflow

```
# add a change
1. edit sql/Init.sql                          (so new installs get it)
2. add bls-server/migrations/YYYYMMDD_NNN_<topic>.sql  (so existing DBs get it)
   - prefix numbers are sequential: 001..012 exist so far
   - write it idempotently: CREATE TABLE IF NOT EXISTS / INSERT IGNORE / guarded ALTER
   - record the version row in `sys_migrations`
3. if the change is a table/column, update the owning page document in bls-memory/
4. update this document (§3 inventory / §7 drift) and add a CHANGELOG entry
```

Existing migrations:

| File | Content |
|---|---|
| `20260710_001_jobs.sql` | `sys_jobs` |
| `20260710_002_outbox.sql` | `outbox_event` |
| `20260710_003_migrations.sql` | `sys_migrations` |
| `20260713_004_outbox_processing_at.sql` | adds `outbox_event.processing_at` |
| `20260713_005_ip_blacklist.sql` | `sys_ip_blacklist` |
| `20260713_006_security_center_menu.sql` | Security Center menus `000200`–`000203` + page config |
| `20260713_007_webhook_delivery_log.sql` | `sys_webhook_delivery` + webhook menus/page config |
| `20260817_011_sql_audit_menu.sql` | SQL-audit menus `000204` / `000205` |
| `20260920_012_crud_completeness.sql` | `ALTER TABLE sys_theme_config ADD remark`; seeds 14 button permissions (`system:user:add`, `system:theme:add/remove`, `system:role:status`, `system:package:status`, `system:tenant:status`, `system:pageconfig:list/edit/remove`, `system:ai-model:list/add/edit/remove/status`) and grants them to roles `000001` / `100001` and packages `P001` / `P100` |

⚠ `ALTER TABLE` is DDL and implicitly commits in MySQL — it cannot be rolled back with a
transaction. Keep such scripts idempotent.

---

## 6. Why per-table DDL is not duplicated here

Each page document already states the tables it touches, the columns it writes and the
validation applied. Keeping a second copy of every column would guarantee drift. This document
therefore owns **conventions, inventory, workflow and drift**; column-level detail lives in the
owning page document and in `sql/Init.sql`.

Need the exact DDL? Read it from the source:

```bash
rg -n "CREATE TABLE \`sys_user\`" -A 30 sql/Init.sql
```

---

## 7. Known drift / gaps (verified 2026-09-20)

1. **`sys_security_log` schema mismatch (real bug, unfixed).**
   `sql/Init.sql` defines PK `id` and columns `id, tenant_id, event_type, risk_level, title,
   detail, username, user_id, route, method, client_ip, user_agent, request_id, create_time` —
   **no `log_id` and no `source`**. But `bls-server/src/core/security-audit.ts`
   `writeSecurityLog()` inserts `log_id` and `source`, and the Security Log page uses
   `rowKey="logId"`. No migration adds those columns. Consequence: security-log inserts can fail
   (they are wrapped in `catch` in several call sites) and the Security Log page can stay empty.
   Fix = either add `log_id` (auto-increment) + `source` via a migration, or change the writer
   and the page to use `id` and drop `source`.

2. **`sys_login_log` is never written.** `writeLoginLog()` exists in
   `bls-server/src/core/audit.ts` but is not called by the login flow (which publishes
   `LOGIN_SUCCESS` / `LOGIN_FAILED` events instead). The Login Log page is therefore empty, and
   the `LOGIN_FAILED`-based brute-force rule never fires.

3. **Missing dictionary seed data.** `sys_page_column_config` references `value_enum_code`
   `sys_storage_type` (page `system_storage`, column `C057`) and `sys_bucket_access_type`
   (page `file_manager`, column `C072`), but neither exists in `sys_dict_type`. Those selects
   render empty until an admin creates them.

4. **`sys_tenant.expire_time` is stored but never enforced** — no query anywhere rejects an
   expired tenant. Also `sys_tenant.package_id` has no validation against `sys_package`.

5. **`sys_package` / `sys_menu` / `sys_package_menu` have no `deleted` column** and are hard
   deleted (`DELETE FROM`) by their modules. Do not write generic soft-delete code for them —
   the Excel module carries an explicit `hasDeleted` flag for exactly this reason
   (see `00-common/06-file-and-excel-security.md`).

6. **Legacy reference is stale.** `.codex/skills/bls-kox/references/database-schema.md` covers
   only **18 of the 40** tables and misnames two of them:
   - `## sys_job` → the real table is `sys_jobs`
   - `## sys_file_config` → the real table is `sys_storage_config`

   Missing from it: `outbox_event`, `sys_global_search_config`, `sys_migrations`, `sys_jobs`
   (correct name), `sys_ai_usage`, `ai_model_config`, `ai_conversation`,
   `ai_conversation_message`, `sys_sql_audit`, `sys_package`, `sys_package_menu`,
   `sys_search_index`, `sys_event_log`, `sys_storage_config` (correct name), `sys_theme_config`,
   `sys_upload_audit`, `sys_user_role`, `sys_webhook`, `sys_webhook_delivery`,
   `ops_environment`, `ops_release_version`, `ops_release_task`, `ops_release_step`,
   `ops_release_log`.
   `AGENTS.md` still points readers to that file — treat this document as the current entry
   point until it is regenerated.

---

## 8. Rules for developers / AI agents

1. **Never hand-write `tenant_id` from a request body.** It is injected server-side
   (`requireTenantId()` / the CRUD factory deletes it from the payload).
2. **Always filter `deleted = 0`** on soft-delete tables — except `sys_menu`, `sys_package`,
   `sys_package_menu`, which do not have the column.
3. **Use `sort_num` / `create_time` / `update_time`** naming; if you must match a legacy table
   (see §2), document the exception here.
4. **Add both** the `Init.sql` change and an incremental migration, and record the version in
   `sys_migrations`.
5. **No FK constraints** — enforce relationships in code and return friendly errors
   (e.g. `ConflictError('该部门下仍有 N 个用户…')`).
6. **Snowflake ids** for new rows (`generateSnowflakeId()`); `varchar(32)`.
7. **After any schema change**, update: `sql/Init.sql`, a migration file, the owning page
   document, this document's inventory, and `CHANGELOG.md`.
