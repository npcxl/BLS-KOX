# Page — Log Center: SQL Audit (`/system/log/sql-audit`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/log/sql-audit` |
| Component | `bls-admin/src/pages/system/log/sql-audit.tsx` |
| Purpose | Read-only list of **failing** SQL statements (`sys_sql_audit`) |
| Backend module | `bls-server/src/api/system/log/index.ts` |
| Table | `sys_sql_audit` |
| Writer | `bls-server/src/core/sql-audit.ts` `writeSqlError()` |
| Shared docs | `03-rate-limiting.md`, `05-security-log-and-event-center.md` |

The page subtitle is "记录所有执行报错的 SQL 语句" — only statements that **threw** are recorded.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search / paginate | `listSqlAudits({...params, pageNum, pageSize})` — `bls-admin/src/services/system/log.ts` | GET | `/api/system/log/sql-audit` |

`ProTable<SqlAuditRecord>` with `rowKey="auditId"`, `search={{labelWidth:96}}`,
`pagination={{defaultPageSize:10, showSizeChanger:true}}`, `options={{density:false}}`,
`scroll={{x:1200}}`. No detail drawer, no export, no batch operations.

Columns:

| Column | Notes |
|---|---|
| `operation` | `<Tag>` colour map: `query: blue`, `query_one: geekblue`, `execute: orange`, `transaction: purple` |
| `username` | searchable |
| `errorCode` | |
| `errorMessage` | |
| `clientIp` | searchable |
| `sqlText` | not searchable; click to expand/collapse (collapsed shows `text.slice(0,120) + ' …'`) |
| `createdAt` | `valueType: 'dateTime'`, not searchable |

---

## 3. Backend endpoint

### `GET /api/system/log/sql-audit`

- Permission: `system:log:sqlaudit:list`.
- Table `sys_sql_audit`, `ORDER BY created_at DESC`.
- Filters: `username LIKE`, `operation =`, `errorCode` → `error_code LIKE`, `clientIp LIKE`,
  `keyword` → OR(`sql_text LIKE`, `error_message LIKE`).
- Pagination: `p = max(1,+pageNum||1)`, `s = min(100,+pageSize||10)`.

### Writer `writeSqlError(operation, sql, error)`

`bls-server/src/core/sql-audit.ts`:

```sql
INSERT INTO sys_sql_audit
  (audit_id, tenant_id, user_id, username, operation, sql_text,
   error_code, error_number, error_message, client_ip, user_agent, request_id)
```

- `sql_text` truncated to 10 000 chars, `error_message` to 2 000 chars.
- Uses a **raw pool execute** (bypasses the audit hook) and is fire-and-forget to avoid recursion.
- `operation` ∈ `query | query_one | execute | transaction`.

DDL: `sql/sys_sql_audit.sql` (also duplicated in `sql/Init.sql`).
Menu seed: `bls-server/migrations/20260817_011_sql_audit_menu.sql`
(page `000204` `/system/log/sql-audit`, button `000205` `system:log:sqlaudit:list`).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /sql-audit` | off | read 600/60 | `system:log:sqlaudit:list` |

⚠ **No tenant isolation** in the query, even though `tenant_id` is stored on each row. A
non-platform tenant with the permission would see other tenants' SQL text, which may contain
sensitive data.

---

## 5. Frontend-only validation

None — read-only.

---

## 6. Known gaps / discrepancies

1. No tenant filtering — the most sensitive log of the four (raw SQL text).
2. No date-range filter on `created_at`.
3. Only **erroring** SQL is recorded; successful statements are not audited. The page title
   ("SQL 审计") may mislead users into expecting a full audit trail.
4. `sql_text` may include parameter values as literal placeholders. It is truncated but not
   redacted, so avoid logging statements containing secrets (the writer does not run the
   `sanitize()` redaction used by `writeSecurityLog`).
5. No pagination size cap in the UI other than the standard 100.

---

## 7. How to extend

- **Add tenant isolation**: add `.where('tenant_id','=',requireTenantId())` (recommended for this
  table) or keep it platform-only and restrict the permission.
- **Add date-range filtering**: implement `startTime`/`endTime` in the endpoint and add a
  `RangePicker` search column.
- **Redact sensitive SQL**: run the SQL text through the `sanitize()` redaction logic from
  `core/security-audit.ts` before insert (careful: it is designed for objects — adapt it, or use
  a dedicated regex).
- **Record slow queries too**: extend the writer to accept a `success` flag and audit both
  failures and slow statements, then add a status filter to the page.
- Update this document.
