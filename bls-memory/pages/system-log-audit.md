# Page — Log Center: Operation Audit & Upload Audit (`/system/log/audit`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/log/audit` (parent menu 日志中心 `/system/log`) |
| Component | `bls-admin/src/pages/system/log/audit.tsx` → re-exports `./index` → `bls-admin/src/pages/system/log/index.tsx` |
| Purpose | Two tabs: 操作审计 (`OperationAuditTable`) and 上传审计 (`UploadAuditTable`) |
| Backend module | `bls-server/src/api/system/log/index.ts` |
| Tables | `sys_operation_log`, `sys_upload_audit` |
| Shared docs | `03-rate-limiting.md`, `05-security-log-and-event-center.md` |

Other routes sharing this module: `/system/log/security`, `/system/log/login`,
`/system/log/sql-audit` (separate memory files).
`bls-admin/src/pages/system/log/upload.tsx` is a 36-byte re-export of `./index` and is not
referenced by `routes.ts`.

---

## 2. Frontend → API map

| Tab | User action | Service / call | Method | Endpoint |
|---|---|---|---|---|
| Operation audit | List / search / paginate | `listOperationLogs({...params, pageNum, pageSize})` — `bls-admin/src/services/system/log.ts` | GET | `/api/system/log/operation` |
| Upload audit | List / search / paginate | `listUploadAudits({...params, pageNum, pageSize})` | GET | `/api/system/log/upload` |
| Both | Columns | `usePageConfig('system_log_operation')` / `usePageConfig('system_log_upload')` | GET | `/api/system/page-config/page/.../columns` |
| Both | Dicts | `useDict('sys_business_type')`, `useDict('sys_upload_status')`, `useMultiDict(['sys_access_type','sys_upload_status'])` | GET | `/api/system/dict/data/type?dictType=...` |

Both tables are `ProTable` with `rowKey="logId"` and `pagination={{defaultPageSize:10,
showSizeChanger:true}}`. There are **no** create/edit/delete/detail/export/clean buttons and no
detail drawer.

Searchable columns (from `sys_page_column_config`):

- `system_log_operation`: `username`, `moduleName`, `businessType`, `title`, `success`, `clientIp`.
- `system_log_upload`: `username`, `moduleName`, `originalName`, `accessType`, `uploadStatus`,
  `clientIp`.

---

## 3. Backend endpoints

Module: `bls-server/src/api/system/log/index.ts`, custom router `prefix: '/system/log'`.
**No CRUD factory, no Zod** — queries are built manually with `+x`, `Math.min/max` and `if (q.x)`.
`log.model.ts` exists but is skipped by the router scanner (`isIgnoredFile`).

### `GET /api/system/log/operation`

- Permission: `system:log:audit:list`.
- `sys_operation_log`, `selectAll()`, `ORDER BY log_id DESC`.
- Filters: `title LIKE %..%`, `businessType` → `business_type =`, `moduleName LIKE`,
  `username LIKE`, `success` (when defined and non-empty) → `success =`, `clientIp LIKE`.
- Paging: `p = max(1, +pageNum || 1)`, `s = min(100, +pageSize || 10)`, `LIMIT s OFFSET
  (p-1)*s`; total via a separate `countAll()`.

### `GET /api/system/log/upload`

- Permission: `system:log:audit:list`.
- `sys_upload_audit`, `ORDER BY audit_id DESC`.
- Filters: `username LIKE`, `moduleName LIKE`, `originalName LIKE`, `accessType =`,
  `uploadStatus =`, `clientIp LIKE`; same pagination.

### Other endpoints in the same module (not used by this page)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/system/log/audit/detail/:id` | `system:log:audit:detail` | Single `sys_operation_log` row. **Not called by the frontend.** |
| DELETE | `/api/system/log/audit/clean` | `system:log:audit:clean` | ⚠ `DELETE FROM sys_operation_log` with **no WHERE** — truncates the whole table. **Not exposed in the UI.** |

### Data writers

- `writeOperationLog(...)` in `bls-server/src/core/audit.ts` inserts into `sys_operation_log`.
- The storage upload flow writes `sys_upload_audit` (see
  `00-common/06-file-and-excel-security.md`).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /operation` | off | read 600/60 | `system:log:audit:list` |
| `GET /upload` | off | read 600/60 | `system:log:audit:list` |
| `GET /audit/detail/:id` | off | read 600/60 | `system:log:audit:detail` |
| `DELETE /audit/clean` | default write nonce | write 300/60 | `system:log:audit:clean` |

⚠ **No tenant isolation**: none of the log queries add a `tenant_id` WHERE clause and none call
`requireTenantId()`. Any authenticated user holding the permission sees logs from all tenants.
This is by design for a platform-level audit view, but it means the permission code must be
restricted to the platform tenant.

---

## 5. Frontend-only validation

None — the page is read-only.

---

## 6. Known gaps / discrepancies

1. `log.model.ts` declares `tenantId` / `startTime` / `endTime` filters that the endpoints never
   implement; there is **no server-side date-range filtering** on any log endpoint, even though
   several pages expose a time column.
2. `DELETE /audit/clean` wipes the whole table with no WHERE clause and no confirmation guard in
   the backend. Keep it unexposed or add a date-range/tenant guard before wiring any UI.
3. `GET /audit/detail/:id` is dead code from the frontend's perspective.
4. Because the log queries are tenant-agnostic, a non-platform tenant with the permission would
   leak other tenants' logs.

---

## 7. How to extend

- **Add date-range filtering**: implement `startTime`/`endTime` in the endpoints (they are
  already declared in `log.model.ts`), and add a `RangePicker` search column on the frontend.
- **Add tenant isolation**: add `.where('tenant_id','=',requireTenantId())` (or keep the global
  behaviour but tighten the permission to the platform tenant).
- **Add a detail drawer**: use the existing `/audit/detail/:id` endpoint.
- **Make clean safe**: require a date range or a tenant, and write a security log
  (`BATCH_EXPORT`-style) before deleting.
- Update this document.
