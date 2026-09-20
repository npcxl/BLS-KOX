# Page — Page Configuration (`/system/page-config`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/page-config` (name 页面配置) |
| Component | `bls-admin/src/pages/system/page-config/index.tsx` |
| Purpose | Edit each page's table column schema (visibility, searchable, editable, valueType, dict binding) with live autosave |
| Backend module | `bls-server/src/api/system/page-config/index.ts` (pure custom router) |
| Tables | `sys_page_config` (`PT`), `sys_page_column_config` (`CT`) |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md` |

This module is the backbone of every `CrudTablePage`: it stores the columns consumed by
`usePageConfig(pageCode)` and by the Excel import/export module.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| Load page list (mount) | `listPageConfigs` | GET | `/api/system/page-config/list` |
| Select a page → load page + columns | `getPageConfig` / `getPageColumnConfig` (Promise.all) | GET | `/api/system/page-config/page/{pageCode}` · `/page/{pageCode}/columns` |
| Add column (新增列) | local state, triggers autosave | (POST) | `/api/system/page-config/save` |
| Delete column (Popconfirm) | local state, triggers autosave | (POST) | `/api/system/page-config/save` |
| Edit a cell (300 ms debounce) | `updateColumn` + autosave | (POST) | `/api/system/page-config/save` |
| Autosave (600 ms debounce) | `savePageConfig` | POST | `/api/system/page-config/save` |
| Explicit save button (保存配置) | `savePageConfig` | POST | `/api/system/page-config/save` |
| Delete a whole page config (service exists, **unused in UI**) | `deletePageConfig` | DELETE | `/api/system/page-config/page/{pageCode}` |
| Status dictionary | `useDict('sys_status')` | GET | `/api/system/dict/data/type?dictType=sys_status` |

Frontend-only: sidebar keyword search (filters `pageName`/`pageCode`/`remark`), exclusion list
`EXCLUDED_CODES = ["system_log_operation","system_log_upload","system_log_login"]`,
`formTypeOptions = text | select | treeSelect | dateTime | textarea | password | switch`.

---

## 3. Backend endpoints

Module: pure custom router `prefix: '/system/page-config'`; tables `sys_page_config` (`PT`),
`sys_page_column_config` (`CT`).

Zod schemas:

| Schema | Fields |
|---|---|
| `pageSchema` | `pageCode` 1–100, `pageName` 1–100, `enabled` bool optional, `sort` int 0–100000 optional, `remark` ≤500 nullish |
| `columnSchema` | `columnId` 1–32 optional, `dataIndex` 1–100, `title` 1–100, `orderNum` int 0–100000 optional, booleans `visible/searchable/editable/copyable/ellipsis/required`, `valueType` ≤50 / `valueEnumCode` ≤100 / `placeholder` ≤200 nullish |
| `saveSchema` | `{page: pageSchema, columns: array(columnSchema).max(300)}` |

`columnValues()` maps camelCase → snake_case and applies defaults
(`visible !== false ? 1 : 0`, `editable !== false ? 1 : 0`, others `? 1 : 0`, `tenant_id`,
`deleted = 0`).

### Endpoints

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/api/system/page-config/list` | `system:pageconfig:list` | tenant + `deleted=0`; `ORDER BY sort ASC` |
| GET | `/api/system/page-config/page/:pageCode` | **`jwtAuth` only** | tenant + `deleted=0`; returns `null` when absent |
| GET | `/api/system/page-config/page/:pageCode/columns` | **`jwtAuth` only** | tenant + `deleted=0`; `ORDER BY order_num ASC` |
| POST | `/api/system/page-config/save` | `system:pageconfig:edit` | Rejects duplicate `dataIndex` (case-insensitive) → `ValidationError`. **Transaction**: upsert the page (snowflake id if new), soft-delete all current-tenant columns for the page, re-write the columns (reuse a supplied `columnId` only if it belongs to the tenant, otherwise generate a new id) |
| DELETE | `/api/system/page-config/page/:pageCode` | `system:pageconfig:remove` | Transaction; 404 when the page is not found for the tenant; soft-deletes columns then the page |

Key/tenant rule: `save`/`delete` operate on `(page_code, tenant_id)`, so pages with the same code
in a different tenant are untouched.

### Non-existent endpoints

- `page-config/render` — **does not exist**.
- `page-config/realtime` — **does not exist** (no WebSocket; HTTP only).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `/page/:pageCode`, `/page/:pageCode/columns` | off | read 600/60 | `system:pageconfig:list` for `/list`; JWT only for the others |
| `POST /save` | default write nonce (120 s / 300 s) | write 300/60 | `system:pageconfig:edit` |
| `DELETE /page/:pageCode` | default write nonce | write 300/60 | `system:pageconfig:remove` |

⚠ **Autosave + rate limit**: every ~600 ms of idle editing issues one `POST /save` with a fresh
`X-Nonce`/`X-Timestamp`. Heavy editing draws on the 300/min/user write bucket and can hit
429 (`{code:42901}`). If the page is edited by many users behind the same account, add a
dedicated rate-limit rule.

Tenant isolation: every statement filters `tenant_id = requireTenantId()`.

---

## 5. Frontend-only validation

- The page form (`pageName` / `enabled` / `sort` / `remark`) has **no `rules`** —
  `form.validateFields()` passes vacuously.
- Column cells do not enforce non-empty `title` / `dataIndex`; a new column starts with both
  empty.
- The autosave `catch` is silent, so a Zod 400 caused by an incomplete new column is invisible —
  the save simply does not persist until the fields are filled.

## 6. Backend-only rules

- `pageCode` / `pageName` non-empty.
- Each column `dataIndex` and `title` non-empty.
- **Duplicate `dataIndex` (case-insensitive) rejected.**
- `orderNum` ≥ 0; **max 300 columns**.
- `enabled` / `visible` / `editable` default to truthy when omitted; `searchable` / `copyable` /
  `ellipsis` / `required` default to false.

---

## 7. Known gaps / discrepancies

1. The frontend does **not** enforce unique `dataIndex`; the backend does. Add a client-side check
   for a better UX.
2. Autosave failures are swallowed (no toast, no dirty indicator) — the user can believe a change
   was saved when it was rejected.
3. `deletePageConfig` is implemented on both sides but there is no UI action.
4. The page has no permission gating in the UI (the backend is still protected).
5. Log pages `system_log_operation`, `system_log_upload`, `system_log_login` are excluded from the
   page list in the sidebar (`EXCLUDED_CODES`), yet their column configs exist in `sql/Init.sql`
   and are read by the log pages directly.

---

## 8. How to extend

- **Add a new page-configurable page**: insert a `sys_page_config` row and `sys_page_column_config`
  rows in `sql/Init.sql` using the target `page_code`, then call
  `usePageConfig('<page_code>')` in the page component.
- **Add a new form control type**: extend `formTypeOptions` on the frontend and the
  `valueType` handling in `CrudTablePage`; the backend stores `valueType` as an opaque ≤50-char
  string.
- **Reduce autosave pressure**: increase the debounce, skip saves when nothing changed, or add a
  dedicated rate-limit rule for `/api/system/page-config/save`.
- Update this document.
