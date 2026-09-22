# Page — Log Center: Login Log (`/system/log/login`)

> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 3c26a02 (+ uncommitted frontend change) · **Last verified:** 2026-09-21

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/log/login` |
| Component | `bls-admin/src/pages/system/log/login.tsx` |
| Purpose | Read-only list of login attempts (`sys_login_log`) |
| Backend module | `bls-server/src/api/system/log/index.ts` |
| Table | `sys_login_log` |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md` |

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search / paginate | `listResource` with `resource = {basePath:'/api/system/log/login', list:'', status:false, remove:false}` — equivalent helper `listLoginLogs()` in `bls-admin/src/services/system/log.ts` | GET | `/api/system/log/login` |
| Columns | `usePageConfig('system_log_login')` | GET | `/api/system/page-config/page/system_log_login/columns` |
| Dicts | `useDict('sys_login_type')` → `loginTypeValueEnum`; `useDict('sys_upload_status')` → `successValueEnum` | GET | `/api/system/dict/data/type?dictType=...` |

`CrudTablePage` configuration: `title="登录日志"`, `rowKey="logId"`,
`resource.list=''`, `status:false`, `remove:false`, `formColumns={[]}`, `modalWidth={760}`,
`showCreateButton={false}`, `showEditAction={false}`, `showRemoveAction={false}`,
`showActions={false}` (the 操作 column would render an empty `<Space>` — nothing to show on a
read-only page, so the whole column is omitted), `scroll={{x:'max-content'}}`,
`permissions={{import:'system:log:import', export:'system:log:export'}}`.

Columns (page config): `username` (search), `tenantId`, `loginType` (search),
`loginStatus` (search), `failReason`, `loginIp` (search), `requestId`, `userAgent`, `loginTime`.

ⓘ The `loginStatus` column is rendered with the `sys_upload_status` dictionary in the component,
while `sql/Init.sql` declares `value_enum_code = sys_status` for that column — a minor
inconsistency.

---

## 3. Backend endpoint

### `GET /api/system/log/login`

- Permission: `system:log:login:list`.
- Table `sys_login_log`, `ORDER BY log_id DESC`.
- Filters: `username LIKE %..%`, `loginType` → `login_type =`, `loginStatus` (when defined and
  non-empty) → `login_status =`.
- Pagination: `p = max(1,+pageNum||1)`, `s = min(100,+pageSize||10)`, total via count.

### Writer

`writeLoginLog()` in `bls-server/src/core/audit.ts`:

```sql
INSERT INTO sys_login_log
  (log_id, tenant_id, user_id, username, login_type, login_status,
   fail_reason, login_ip, user_agent, request_id, login_time)
```

`login_type` defaults to `password`.

⚠ **This function is currently not called by the login flow.** `bls-server/src/api/auth/index.ts`
publishes `LOGIN_SUCCESS` / `LOGIN_FAILED` events to the external event service instead. So this
page can be empty in a fresh deployment. See `pages/user-login.md` §6.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /login` | off | read 600/60 | `system:log:login:list` |

⚠ **No tenant isolation** in the query; `tenantId` is returned as a column but not used as a
filter. Anyone with the permission sees all tenants' login attempts.

`system:log:login:export` is seeded in `sql/Init.sql` and the page declares
`permissions.import/export`, but no Excel toolbar is rendered (`excelMetaKey` is not passed), so
those permissions are inert.

---

## 5. Frontend-only validation

None — read-only.

---

## 6. Known gaps / discrepancies

1. **The login log is not written** by the current login implementation → the page is likely
   empty. Fix by calling `writeLoginLog(...)` on both success and failure in
   `bls-server/src/api/auth/index.ts`.
2. No tenant filtering.
3. No date-range filter although `loginTime` is a timestamp column (`log.model.ts` declares
   `startTime`/`endTime` but the endpoint ignores them).
4. Import/export permissions are declared but no toolbar exists.
5. `loginStatus` dictionary mismatch (`sys_upload_status` vs `sys_status` in the page config).

---

## 7. How to extend

- **Wire the writer**: call `writeLoginLog({tenantId, userId, username, loginType:'password',
  loginStatus: '0'|'1', failReason, loginIp, userAgent, requestId})` in the login handler.
- **Add date-range filtering**: implement `startTime`/`endTime` in the endpoint and add a
  `RangePicker` search column.
- **Add tenant isolation**: filter by `tenant_id` unless this is explicitly a platform-only view.
- **Add Excel export**: pass `excelMetaKey="system-log-login"` — but note the Excel module has no
  meta for `sys_login_log`, so you would have to add one (see
  `00-common/06-file-and-excel-security.md` §2).
- Update this document.
