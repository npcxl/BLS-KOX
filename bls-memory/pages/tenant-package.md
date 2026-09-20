# Page — Tenant Package (`/tenant/package`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/tenant/package` (name 租户套餐) |
| Component | `bls-admin/src/pages/system/tenant-package/package/index.tsx` (`PackagePageInner`) + `components/MenuAuthModal.tsx` |
| Purpose | CRUD of packages (`sys_package`) and menu authorization for a package (`sys_package_menu`) |
| Backend module | `bls-server/src/api/system/package/index.ts` |
| Tables | `sys_package`, `sys_package_menu`, `sys_tenant` (reference guard), `sys_menu` (id validation), `sys_page_column_config` |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md`, `06-file-and-excel-security.md` |

⚠ `sys_package` is a **global table**: it has **no `tenant_id` and no `deleted`** column. It is also
listed as a global table in `bls-server/src/middleware/tenant.ts`.

---

## 2. Frontend → API map

Resource: `{ basePath: '/api/system/package' }`, `excelMetaKey="system-package"`.

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search (`keyword`) | `listResource` via `useCrudTable` | GET | `/api/system/package/list` |
| Create | `addResource` | POST | `/api/system/package/add` |
| Edit | `editResource` | PUT | `/api/system/package/edit` |
| Status toggle | `changeResourceStatus` body `{packageId, status}` | PUT | `/api/system/package/status` |
| Delete (single / batch) | `removeResource` | DELETE | `/api/system/package/remove` |
| Open "菜单权限" modal → load tree + assigned menus | `MenuAuthModal` `Promise.all` | GET / GET | `/api/system/menu/list` · `/api/system/package/{packageId}/menus` |
| Save menu assignment | `MenuAuthModal.handleSubmit` body `{menuIds: [...checked, ...halfChecked]}` | PUT | `/api/system/package/{packageId}/menus` |
| Excel template / export / import | `ExcelToolbar` (`metaKey="system-package"`) | GET / POST / POST | `/api/common/excel/template` · `/export` · `/import` |
| Columns / dict | `usePageConfig('system_package')`, `useDict('sys_status')` | GET | `/api/system/page-config/page/system_package/columns`, `/api/system/dict/data/type` |

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/package'`; `T = 'sys_package'`, `PM = 'sys_package_menu'`.
Header comment notes that `sys_package` has no `package_code` and no `deleted` column. No CRUD
factory.

Zod schemas:

| Schema | Fields |
|---|---|
| `packageCreateSchema` | `packageName` 1–100 required; `status` enum `'0' \| '1'` optional; `remark` ≤500 nullish |
| `packageUpdateSchema` | partial + `packageId` 1–32 |
| `statusSchema` | `packageId` 1–32, `status` enum |
| `menuAssignSchema` | `menuIds: array(string 1–32).max(1000).default([])` |

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/list` | `system:package:list` | `selectFrom(T)` (no `deleted` filter — the column does not exist); searchable columns from `sys_page_column_config` (`system_package`); `keyword` OR-LIKE (fallback `['package_name']`); per-column exact filters; pagination; `ORDER BY create_time DESC` |
| GET | `/options` | `system:package:list` | `{package_id, package_name}` where `status='0'`, `ORDER BY create_time ASC` |
| POST | `/add` | `system:package:add` | Zod; snowflake `packageId`; insert with `status: b.status ?? '0'` |
| PUT | `/edit` | `system:package:edit` | Zod; only provided fields; empty → `ValidationError('没有可更新字段')`; 0 rows → 404 |
| PUT | `/status` | `system:package:status` | Zod; update `status`; 0 rows → 404 |
| DELETE | `/remove` | `system:package:remove` | **Transaction**: existence check (404); reference guard — any `sys_tenant` row with `package_id IN (ids) AND deleted=0` → `ConflictError('套餐已被 N 个租户引用…')`; then `DELETE FROM sys_package_menu` and **hard delete** from `sys_package` |
| GET | `/:packageId/menus` | `system:package:list` | Returns the `menu_id` list from `sys_package_menu` |
| PUT | `/:packageId/menus` | `system:package:edit` | Zod `menuAssignSchema`; dedupe; transaction: package existence (404); every menu id must exist in `sys_menu` else `ValidationError('存在无效的菜单ID')`; delete-then-insert into `sys_package_menu` |

Seed data: `sys_package` `P001` 平台版, `P100` 租户标准版套餐 (`sql/Init.sql`).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `/options`, `/:packageId/menus` | off | read 600/60 | `system:package:list` |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:package:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:package:edit` |
| `PUT /status` | default write nonce | write 300/60 | `system:package:status` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:package:remove` |
| `PUT /:packageId/menus` | default write nonce | write 300/60 | `system:package:edit` |
| `POST /api/common/excel/export` | default write nonce | user 5/60 + tenant 200/3600 | `jwtAuth` only |

Packages are global resources — no tenant isolation, by design. The reference guard prevents
deleting a package that a tenant still uses. `hasPerm` cross-tenant logging still applies.

---

## 5. Frontend-only validation

- `packageName` required.
- `MenuAuthModal` builds the tree from `/api/system/menu/list` and submits
  `[...checkedKeys, ...halfCheckedKeys]`.

## 6. Backend-only rules

- `packageName` 1–100, `status` enum, `remark` ≤500.
- Every `menuId` must exist in `sys_menu`.
- A package referenced by any non-deleted tenant cannot be deleted.

---

## 7. Known gaps / discrepancies

1. `sys_package_menu` stores **menu-level** authorization only; there is no action/button-level
   granularity beyond what `sys_menu` rows already express.
2. Deleting a package is a **hard delete** for `sys_package` (no `deleted` column) while tenants
   use soft delete — make sure any reporting/audit does not assume soft delete here.
3. `package_code` does not exist in the table, even though the module header mentions it as
   absent — do not add UI expecting a code field.
4. Assigning a package to a tenant (`sys_tenant.package_id`) does **not** automatically grant the
   package's menus to the tenant's roles. Menu grants come from roles (`sys_role_menu`) or a
   provisioning step; the linkage is not implemented here.
5. `system:package:import/export` are declared and the Excel toolbar is rendered, but the shared
   Excel module only checks `jwtAuth`.

---

## 8. How to extend

- **Auto-provision tenant menus from the package**: on tenant creation, copy `sys_package_menu`
  entries into the tenant's default role `sys_role_menu` (see `pages/tenant-list.md` §8).
- **Add quotas to packages**: add columns (e.g. `max_users`, `max_storage_mb`) to `sys_package`,
  expose them in the form, and enforce them in the relevant modules.
- **Add action-level permissions**: extend `sys_package_menu` with a `perms` column or create a
  `sys_package_perm` table, then merge package perms into the user's permission set.
- Update this document if any of the above is implemented.
