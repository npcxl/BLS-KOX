# Page — User Management (`/system/user`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/user` (name 用户管理) |
| Component | `bls-admin/src/pages/system/user/index.tsx` (renders `CrudTablePage`) |
| Purpose | Per-tenant user CRUD, role assignment, kick users offline |
| Backend module | `bls-server/src/api/system/user/index.ts` |
| Tables | `sys_user`, `sys_user_role`, `sys_role`, `sys_config`, `sys_page_column_config`, outbox |
| Shared docs | `00-common/01-redis.md`, `02-replay-protection.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `06-file-and-excel-security.md` |

This module is a **hand-written router**, not `defineCrudModule`.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search / paginate | `listResource({basePath:'/api/system/user'})` via `useCrudTable` | GET | `/api/system/user/list` |
| Load role options (mount) | inline `request({pageSize:1000})` | GET | `/api/system/role/list` |
| Load department tree (mount) | `listResource({basePath:'/api/system/dept'})` | GET | `/api/system/dept/list` |
| Create | `addResource` | POST | `/api/system/user/add` |
| Edit | `editResource` | PUT | `/api/system/user/edit` |
| Delete (row / batch) | `removeResource` | DELETE | `/api/system/user/remove` |
| Batch kick offline (table alert) | inline `request({userIds})` | POST | `/api/system/user/kick` |
| Excel template / export / import | `ExcelToolbar` (`metaKey="system-user"`) | GET / POST / POST | `/api/common/excel/template` · `/export` · `/import` |
| Columns | `usePageConfig('system_user')` | GET | `/api/system/page-config/page/system_user/columns` |
| Dicts | `useMultiDict` → `useDict` | GET | `/api/system/dict/data/type?dictType=sys_status｜sys_gender｜sys_yes_no` |

Form fields: `username*`, `password`, `nickname*`, `realName`, `deptId` (TreeSelect), `phone`,
`email`, `gender` (dict `sys_gender`), `isAdmin` (dict `sys_yes_no`), `status` (dict `sys_status`),
`roleIds` (multi-select), `remark` (textarea).
`beforeSubmit` preserves `deptId` / `roleIds` from `current` when the form omits them.
`resource.status` is `false` → **no status toggle** is rendered.

Frontend permission gating: the `permissions` prop is
`{create:'system:user:add', edit:'system:user:edit', remove:'system:user:remove',
import:'system:user:import', export:'system:user:export'}` (no `status` key), and the batch
"kick offline" action is gated separately with
`const canKick = usePermission().can('system:user:kick')`.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/user'`; tables `sys_user` (`T`), `sys_user_role` (`UR`),
`sys_role` (`R`). Field whitelists come from
`bls-server/src/shared/utils/mass-assignment.ts` (`USER_CREATE_FIELDS`, `USER_EDIT_FIELDS`,
`USER_PROFILE_FIELDS`).

### `GET /api/system/user/list`

- Permission: `system:user:list`.
- Paging `pageNum` / `pageSize` (clamped 1–100, default 10), `deleted=0`, tenant scoped.
- Searchable columns are read from `sys_page_column_config WHERE page_code='system_user'
  AND searchable=1`; `keyword` builds an OR-LIKE; per-column exact filters supported.
- `ORDER BY create_time DESC`.
- Attaches `roleIds` / `roleNames` from `sys_user_role` joined with `sys_role`.

### `GET /api/system/user/profile` · `PUT /api/system/user/profile`

- `jwtAuth()` only, **no permission**. See `pages/account-settings.md`.

### `POST /api/system/user/add`

- Permission: `system:user:add`.
- Zod `userCreateSchema`:

| Field | Rule |
|---|---|
| `username` | 3–50, regex `/^[A-Za-z0-9_.@-]+$/`, **required** |
| `password` | 6–100, optional (defaults to `sys.user.defaultPassword` else `123456`) |
| `nickname` | 1–50, required |
| `realName` | ≤50 |
| `avatar` | ≤200 |
| `gender` | enum `'0'｜'1'｜'2'` |
| `email` | ≤100, `EMAIL_RE` |
| `phone` | ≤20 |
| `deptId` | ≤32 |
| `status` | enum `'0'｜'1'` |
| `remark` | ≤500 |
| `roleIds` | array, ≤50 |

- Password hashed with **Argon2id**.
- Uniqueness: `username` + `tenant_id` → `ConflictError('用户名已存在')`.
- `assertRolesValid` — roles must belong to the current tenant (platform tenant may use any).
- **Transaction**: insert `sys_user` + `sys_user_role`, then an outbox event `USER_CREATED`.

### `PUT /api/system/user/edit`

- Permission: `system:user:edit`.
- `userEditSchema` (same fields minus `username`/`password`, plus required `userId`).
- Role reassignment = `DELETE FROM sys_user_role WHERE user_id=?` then re-insert. Transactional.

### `DELETE /api/system/user/remove`

- Permission: `system:user:remove`.
- Transaction: strict tenant visibility check (mismatch → `CROSS_TENANT_ACCESS` security log +
  `NotFoundError`); soft delete; delete `sys_user_role`; after commit `sessionCenter.revokeAll`;
  `logSecurity(PERM_CHANGE, '删除用户')`.

### `PUT /api/system/user/changePassword`

- `jwtAuth()` only. See `pages/account-settings.md`.

### `GET /api/system/user/sessions/:userId` and `POST /api/system/user/kick`

- Permission: `system:user:kick`.
- `sessions/:userId` validates the user is in the tenant, then lists
  `sessionCenter.list(tenantId, userId)` (active sessions).
- `kick` body `{userIds:[...]}`; tenant visible filter; `sessionCenter.revokeAll` for each;
  returns `{kicked}`.

### Not implemented

- `POST /api/system/user/reset-password` — referenced by the **signature** replay rule but there is
  **no route**. Do not assume it exists.
- `PUT /api/system/user/status` — the frontend disables the status toggle.

Tables touched: `sys_user`, `sys_user_role`, `sys_role`, `sys_config`, `sys_page_column_config`,
outbox.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list` | off | read 600/60 | `system:user:list` |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:user:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:user:edit` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:user:remove` |
| `POST /kick` | default write nonce | write 300/60 | `system:user:kick` |
| `GET /sessions/:userId` | off | read 600/60 | `system:user:kick` |
| `POST /api/common/excel/export` | default write nonce | **user 5/60 + tenant 200/3600** | `jwtAuth` only |
| `PUT /profile`, `PUT /changePassword` | default write nonce | write 300/60 | JWT only |
| `/api/system/user/reset-password` | rule exists, **signature**, 60 s / 180 s — **but no route** | — | — |

Redis: user delete/kick/password change call `sessionCenter.revokeAll` →
`session:{tenant}:{user}:*` + `session-index:{tenant}:{user}` are deleted (see `00-common/01-redis.md`).

---

## 5. Frontend-only validation

- `username` required, `nickname` required.
- Password tooltip: empty on create → default password; empty on edit → unchanged.
- Role multi-select.

## 6. Backend-only rules

- `username` regex / length, password length, email format, gender/status enums, `roleIds` ≤ 50.
- Username uniqueness per tenant.
- Foreign-tenant role assignment rejected (`不能分配其他租户的角色`).

---

## 7. Known gaps / discrepancies

1. `system:user:import/export` are declared but the shared `ExcelToolbar` does not enforce them
   (the module itself only checks `jwtAuth`).
2. No `/status` endpoint and the toggle is disabled — enable/disable is done via edit (`status`).
3. `POST /reset-password` does not exist although a `signature` replay rule references it.
   A browser-driven reset would need `nonce` mode, not `signature`.

---

## 8. How to extend

- **Add a user field**: extend `sys_user`, `USER_CREATE_FIELDS`/`USER_EDIT_FIELDS`, the Zod
  schemas, the insert/update mapping, then the page form + page-config column.
- **Add reset password**: implement `POST /api/system/user/reset-password` with
  `hasPerm('system:user:edit')`, generate a temporary password, Argon2id-hash it,
  `sessionCenter.revokeAll`, and **change the replay rule from `signature` to `nonce`** if it is
  called from the browser.
- **Add bulk operations**: reuse the `kick` pattern (`{ids:[]}` body, tenant visibility filter,
  per-id action) and add a rate-limit rule if the operation is expensive.
- Update this document.
