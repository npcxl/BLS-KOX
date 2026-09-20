# Page — Log Center: Security Log (`/system/log/security`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/log/security` |
| Component | `bls-admin/src/pages/system/log/security.tsx` |
| Purpose | Read-only list of security events from `sys_security_log` |
| Backend module | `bls-server/src/api/system/log/index.ts` |
| Table | `sys_security_log` |
| Shared docs | `05-security-log-and-event-center.md` (this is the page that visualises it) |

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search / paginate | `listResource` with `resource = {basePath:'/api/system/log/security', list:'', remove:false, status:false}` — `services/system/crud.ts` | GET | `/api/system/log/security` |
| Columns | `usePageConfig('system_log_security')` | GET | `/api/system/page-config/page/system_log_security/columns` |

`CrudTablePage` configuration: `title="安全日志"`, `rowKey="logId"`,
`formColumns={[]}`, `showCreateButton={false}`, `showEditAction={false}`,
`showRemoveAction={false}`. No detail drawer, no export, no batch delete.

Record shape used by the component:

```ts
{ logId, eventType, riskLevel, title, username?, route?, method?, clientIp?, source?, createTime }
```

`riskLevel` is rendered with a hardcoded colour map
(`LOW: green, MEDIUM: orange, HIGH: red, CRITICAL: red`) because `eventType` / `riskLevel` have no
`value_enum_code` in the page config.

---

## 3. Backend endpoint

### `GET /api/system/log/security`

- Permission: `system:log:security:list`.
- Table `sys_security_log`, `selectAll()`, `ORDER BY create_time DESC`.
- Filters: `eventType =`, `riskLevel =`, `username LIKE`, `clientIp LIKE`,
  `keyword` → OR(`title LIKE`, `username LIKE`, `route LIKE`).
- Pagination `p = max(1,+pageNum||1)`, `s = min(100,+pageSize||10)`.

### What writes this table

`writeSecurityLog()` in `bls-server/src/core/security-audit.ts` — called by the replay middleware,
the permission middleware, auth flows and the event center. See
`00-common/05-security-log-and-event-center.md` for event types, risk levels, redaction rules and
the automatic actions.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /security` | off | read 600/60 | `system:log:security:list` |

⚠ **No tenant isolation** in the query. The Security Log shows events across tenants for anyone
holding the permission.

---

## 5. Frontend-only validation

None — read-only.

---

## 6. Known gaps / discrepancies

1. **Schema mismatch (important)**: `sql/Init.sql` defines `sys_security_log` with PK `id` and
   columns `id, tenant_id, event_type, risk_level, title, detail, username, user_id, route,
   method, client_ip, user_agent, request_id, create_time` — **no `log_id` and no `source`**.
   But `writeSecurityLog()` inserts `log_id` and `source`, and this page uses `rowKey="logId"`.
   No `ALTER TABLE`/migration in the repo adds those columns. Verify the live schema before
   debugging. If the columns are missing in your environment, the insert fails silently
   (wrapped in try/catch in several call sites) and this page stays empty.
2. No tenant filtering (see §4).
3. `eventType` / `riskLevel` are not decorated with dictionary labels in the page config; the
   component hardcodes the risk colours and shows the raw event type string.
4. No detail view even though `detail` (JSON) is stored and redacted.

---

## 7. How to extend

- **Fix the schema**: add a migration that adds `log_id` (PK, bigint auto-increment) and
  `source` to `sys_security_log`, or change `writeSecurityLog()` + this page to use `id` and drop
  `source`. Pick one and make it consistent across `sql/Init.sql`, the writer and the page.
- **Add tenant filtering**: add `.where('tenant_id','=',requireTenantId())` for tenant-scoped
  viewing, or keep the global view but restrict the permission to the platform tenant.
- **Add a detail drawer**: fetch the row and pretty-print `detail` (already redacted and
  truncated by the writer).
- **Add filters for event/risk dictionaries**: seed `sys_dict_type` / `sys_dict_data` for
  `sys_security_event_type` and `sys_security_risk_level`, then set `value_enum_code` in the page
  config.
- Update this document.
