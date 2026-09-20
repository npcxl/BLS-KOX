# Page — Tenant List (`/tenant/list`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/tenant/list` (parent `/tenant` redirects here; the menu is `hideInMenu: true`) |
| Component | `bls-admin/src/pages/system/tenant-package/tenant/index.tsx` (`TenantPageInner`) |
| Purpose | Platform-level CRUD of tenants (`sys_tenant`), enable/disable, assign a package, expiry/domain/contact |
| Backend module | `bls-server/src/api/system/tenant/index.ts` |
| Tables | `sys_tenant`, `sys_user` + `sys_role` (asset counts), `sys_page_column_config` |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md`, `06-file-and-excel-security.md` |

`sys_tenant` is a **platform-level (global) resource** — the list is not tenant scoped.

---

## 2. Frontend → API map

Resource: `{ basePath: '/api/system/tenant' }`, `excelMetaKey="system-tenant"`.

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search (`keyword`) | `listResource` via `useCrudTable` | GET | `/api/system/tenant/list` |
| Create | `addResource` | POST | `/api/system/tenant/add` |
| Edit | `editResource` | PUT | `/api/system/tenant/edit` |
| Status toggle (row) | `changeResourceStatus` body `{tenantId, status}` | PUT | `/api/system/tenant/status` |
| Delete (single / batch) | `removeResource` | DELETE | `/api/system/tenant/remove` |
| Load package dropdown (`packageId` field) | inline `request` | GET | `/api/system/package/options` |
| Excel template / export / import | `ExcelToolbar` (`metaKey="system-tenant"`) | GET / POST / POST | `/api/common/excel/template` · `/export` · `/import` |
| Columns / dict | `usePageConfig('system_tenant')`, `useDict('sys_status')` | GET | `/api/system/page-config/page/system_tenant/columns`, `/api/system/dict/data/type` |

Form fields: `tenantName` (required), `packageId` (required select from `/api/system/package/options`),
`expireTime` (dateTime), `domainName`, `contactUser`, `contactPhone`, `status` (initial `'0'`),
`remark`.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/tenant'`, `T = 'sys_tenant'`. No CRUD factory.

Zod schemas:

| Schema | Fields |
|---|---|
| `tenantCreateSchema` | `tenantName` 1–100 required; `domainName` ≤200 nullish; `packageId` ≤32 nullish; `contactUser` ≤50 nullish; `contactPhone` ≤30 nullish; `expireTime` ≤30 nullish; `remark` ≤500 nullish |
| `tenantUpdateSchema` | `tenantCreateSchema.partial()` + `tenantId` 1–32 |
| `statusSchema` | `tenantId` 1–32, `status` enum `'0' \| '1'` |

Helpers: `assertDomainAvailable` (enforces the `uk_tenant_domain` unique index);
`countTenantAssets` (counts `sys_user` + `sys_role` with `deleted=0`).

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/list` | `system:tenant:list` | `deleted=0`; searchable columns from `sys_page_column_config` (`page_code='system_tenant'`, `searchable=1`) drive the `keyword` OR-LIKE (fallback `['tenant_name','domain_name']`) plus per-column exact filters; pagination 1–100; `ORDER BY create_time DESC` |
| GET | `/public-list` | **anonymous, no `jwtAuth`** | Returns `{tenant_id, tenant_name, domain_name}` where `status='0' AND deleted=0`, `ORDER BY create_time ASC`. Used by tenant selection on the login page |
| GET | `/:tenantId` | `system:tenant:list` | Single row `deleted=0`, 404 if absent |
| POST | `/add` | `system:tenant:add` | Zod; `assertDomainAvailable`; snowflake `tenantId`; inserts `status:'0'`, `deleted:0` |
| PUT | `/edit` | `system:tenant:edit` | Zod; existence check (404); domain uniqueness excluding self; only provided fields are updated; empty → `ValidationError('没有可更新字段')`; **`status` is NOT editable here** |
| PUT | `/status` | `system:tenant:status` | Zod. **Platform guard**: `tenantId === PLATFORM_TENANT_ID ('000000')` → `ForbiddenError('平台租户不允许停用')`. On disable (`status='1'`), `countTenantAssets` > 0 → `ConflictError('租户下仍有 N 个用户 / M 个角色…')` |
| DELETE | `/remove` | `system:tenant:remove` | `extractIds`; includes `000000` → `ForbiddenError('平台租户不允许删除')`; per-id visibility check (404); per-id asset check → `ConflictError`; else soft delete |

Seed data: `sys_tenant` `000000` (平台租户) and `100000` (默认租户) in `sql/Init.sql`.
Excel import/export is handled by the shared common module
(`00-common/06-file-and-excel-security.md`).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /:tenantId`, `GET /public-list` | off | read 600/60 | `system:tenant:list` (public-list: none) |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:tenant:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:tenant:edit` |
| `PUT /status` | default write nonce | write 300/60 | `system:tenant:status` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:tenant:remove` |
| `POST /api/common/excel/export` | default write nonce | user 5/60 + tenant 200/3600 | `jwtAuth` only |

Platform-tenant rules:

- `hasPerm` grants full access to tenant `000000` (and to anyone with `*`).
- `000000` can be neither disabled nor deleted.

Tenant isolation: this list is intentionally **global** (the platform manages all tenants). No
`tenant_id` filter is applied, and `tenantWhere` does not treat `sys_tenant` as global — the module
simply never calls it. `hasPerm` cross-tenant logging still applies.

---

## 5. Frontend-only validation

- `tenantName` required, `packageId` required.
- `status` initial value `'0'`.

## 6. Backend-only rules

- `tenantName` 1–100; domain uniqueness (`uk_tenant_domain`).
- Platform tenant cannot be disabled or deleted.
- A tenant with users or roles cannot be disabled or deleted.

---

## 7. Known gaps / discrepancies

1. `expireTime` is stored as a ≤30-char string; **no expiry enforcement** exists anywhere (a tenant
   past its expiry keeps working). Implement a check in login/tenant middleware if expiry is meant
   to matter.
2. `packageId` has no foreign-key check — a non-existent package id can be assigned.
3. `packageId` is marked required in the form but is optional in `tenantCreateSchema`.
4. `status` cannot be changed through `/edit`; only through `/status`.
5. `GET /public-list` is anonymous and returns **all** active tenants (id, name, domain) — a
   minor information disclosure; consider limiting it to a domain lookup instead.
6. `system:tenant:import/export` are declared and the Excel toolbar is rendered, but the shared
   Excel module only checks `jwtAuth`.

---

## 8. How to extend

- **Enforce expiry**: add a check in the login flow (and optionally in `tenantMiddleware`) that
  rejects `status='0' AND expire_time < now`.
- **Validate `packageId`**: assert the package exists (`sys_package`) before insert/update.
- **Add tenant provisioning**: on create, optionally seed default roles/menus for the tenant by
  copying from its package (`sys_package_menu`).
- **Restrict `/public-list`**: return only the tenant matching the request domain, or require the
  domain as a parameter.
- Update this document.
