# Page — Dictionary Management (`/system/dict`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/dict` (name 字典管理) |
| Component | `bls-admin/src/pages/system/dict/index.tsx` (two-level: type list → data detail) |
| Purpose | Manage dictionary types (`sys_dict_type`) and their values (`sys_dict_data`) |
| Backend module | `bls-server/src/api/system/dict/index.ts` (pure custom router) |
| Tables | `sys_dict_type`, `sys_dict_data`, `sys_page_column_config` |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md` |

Dictionaries drive nearly every enum in the UI (`useDict` / `useMultiDict`), the Excel template
drop-downs and the page-config `valueEnumCode` columns.

---

## 2. Frontend → API map

Type level (`typeResource = {basePath:'/api/system/dict/type', status:false}`):

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List types / search | `listResource` | GET | `/api/system/dict/type/list` |
| Create type | `addResource` | POST | `/api/system/dict/type/add` |
| Edit type | `editResource` | PUT | `/api/system/dict/type/edit` |
| Delete type (single / batch) | `removeResource` | DELETE | `/api/system/dict/type/remove` |
| Columns | `usePageConfig('system_dict_type')` | GET | `/api/system/page-config/page/system_dict_type/columns` |

Data level (`dataResource = {basePath:'/api/system/dict/data', status:false}`):

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List data (filtered by `dictTypeId`) | `listResource` | GET | `/api/system/dict/data/list` |
| Create data (`beforeSubmit` injects `dictTypeId`) | `addResource` | POST | `/api/system/dict/data/add` |
| Edit data | `editResource` | PUT | `/api/system/dict/data/edit` |
| Delete data (single / batch) | `removeResource` | DELETE | `/api/system/dict/data/remove` |
| Columns | `usePageConfig('system_dict_data')` | GET | `/api/system/page-config/page/system_dict_data/columns` |

Both levels also call `useDict('sys_status')` → `GET /api/system/dict/data/type?dictType=sys_status`.

---

## 3. Backend endpoints

Module: pure custom router `prefix: '/system/dict'`; tables `sys_dict_type` (`T`),
`sys_dict_data` (`D`). Both are tenant scoped and soft deleted. Zod schemas:

| Schema | Fields |
|---|---|
| `typeCreateSchema` | `dictName` 1–100, `dictType` 1–100, `status` enum `'0'\|'1'` optional, `remark` ≤500 nullish |
| `typeUpdateSchema` | `typeCreateSchema.partial()` + `dictTypeId` 1–32 |
| `dataCreateSchema` | `dictTypeId` 1–32, `dictLabel` 1–100, `dictValue` 1–100, `dictSort` int 0–100000 optional, `tag` ≤30 optional, `status` enum optional, `remark` ≤500 nullish |
| `dataUpdateSchema` | `dataCreateSchema.partial()` + `dictDataId` 1–32 |

### Endpoints

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/api/system/dict/type/list` | `system:dict:list` | tenant + `deleted=0`; `dictName` LIKE, `dictType` LIKE; `ORDER BY dict_type_id DESC`; `pageNum`/`pageSize` (max 100) |
| POST | `/api/system/dict/type/add` | `system:dict:add` | **tenant-unique** `dict_type` (`uk_dict_type_tenant`) else `ConflictError`; snowflake id; `status ?? '0'` |
| PUT | `/api/system/dict/type/edit` | `system:dict:edit` | existence check scoped to tenant else 404; updates name/type/status/remark |
| DELETE | `/api/system/dict/type/remove` | `system:dict:remove` | `extractIds`; **transaction**: all ids tenant-visible else 404; **cascades** soft delete to `sys_dict_data` then `sys_dict_type` |
| GET | `/api/system/dict/data/list` | `system:dict:list` | tenant + `deleted=0`; `dictTypeId` exact, `dictLabel` LIKE; `ORDER BY dict_sort ASC` |
| GET | `/api/system/dict/data/type` | **`jwtAuth` only, no permission** | resolves the **own-tenant** type first, else falls back to the **platform tenant `000000`**; returns `[]` if none. Fields: `dict_data_id, dict_type_id, dict_label, dict_value, dict_sort, tag, status` |
| POST | `/api/system/dict/data/add` | `system:dict:add` | `dictTypeId` must belong to the current tenant else 404; inserts with tenant |
| PUT | `/api/system/dict/data/edit` | `system:dict:edit` | existence check tenant scoped |
| DELETE | `/api/system/dict/data/remove` | `system:dict:remove` | all ids tenant visible else 404; soft delete |

### Non-existent endpoints

`GET /api/system/dict/data/all` — **does not exist**. The real path is `/data/type`.

### Caching

No backend cache. The **frontend** keeps an in-memory `Map` with in-flight de-duplication in
`bls-admin/src/services/system/dict.ts`, cleared by `clearDictCache()` (also called on logout).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| all GETs | off | read 600/60 | see table above (`/data/type` needs only JWT) |
| `POST /type/add`, `PUT /type/edit`, `DELETE /type/remove` | default write nonce (120 s / 300 s) | write 300/60 | `system:dict:add/edit/remove` |
| `POST /data/add`, `PUT /data/edit`, `DELETE /data/remove` | default write nonce | write 300/60 | `system:dict:add/edit/remove` |

Tenant isolation: every query filters `tenant_id = requireTenantId()`. Cross-tenant references
(a `dictTypeId` from another tenant) are rejected with 404. `/data/type` deliberately falls back
to the platform tenant so global dictionaries work for all tenants.

---

## 5. Frontend-only validation

- Type: `dictName`, `dictType` required; `status` default `'0'`.
- Data: `dictLabel`, `dictValue` required; `dictSort` digit, default 0; `tag` chosen from a
  hardcoded `TAG_OPTIONS` list.

## 6. Backend-only rules

- String length caps (100 / 500), `dictSort` 0–100000, `tag` ≤30, `status` enum.
- Tenant-scoped uniqueness of `dict_type`.
- `dictTypeId` must exist within the tenant.
- Deleting a type cascades to its data rows.

---

## 7. Known gaps / discrepancies

1. `tag` options are hardcoded on the frontend but any ≤30-char string is accepted by the backend.
2. The page does **not** gate any button with permissions — all controls render (the backend is
   still protected).
3. `sys_status` is used as the status dictionary; several other dict codes must exist
   (`sys_menu_type`, `sys_gender`, `sys_yes_no`, `sys_storage_type`, `sys_bucket_access_type`, …).
   ⚠ `sys_storage_type` and `sys_bucket_access_type` are referenced by page configs but are
   **not seeded** in `sql/Init.sql`, so those drop-downs are empty until an admin adds them.
4. No Redis cache — every `useDict` miss hits the DB (frontend cache mitigates this).

---

## 8. How to extend

- **Add a dictionary**: use the UI (`/system/dict`) or seed `sys_dict_type` + `sys_dict_data` in
  `sql/Init.sql`. Then reference the code in a page config column (`valueEnumCode`) or `useDict`.
- **Use a dictionary in a form**: `const dict = useDict('my_code')` and map to select options.
- **Make dictionaries tenant-overridable**: already supported — create a type with the same
  `dictType` in the tenant; `/data/type` prefers the tenant row and falls back to `000000`.
- Update this document if you add a new endpoint or cache.
