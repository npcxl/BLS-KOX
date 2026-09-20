# Page — Department Management (`/system/dept`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/dept` (name 部门管理) |
| Component | `bls-admin/src/pages/system/dept/index.tsx` |
| Purpose | Manage the department tree and inspect the members of a department |
| Backend module | `bls-server/src/api/system/dept/index.ts` |
| Tables | `sys_dept` (main), `sys_user` (members) |
| Shared docs | `00-common/00-architecture.md`, `02-replay-protection.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md` |

The page is a split view: the left side is a flattened department tree, the right side shows the
members of the selected department. It uses a hand-rolled modal, **not** `CrudTablePage`.

---

## 2. Frontend → API map

| User action | Call (source) | Method | Endpoint |
|---|---|---|---|
| Load the department tree (on mount) | `listResource<DeptRecord>({basePath:'/api/system/dept'})` — `services/system/crud.ts` | GET | `/api/system/dept/list` |
| Select a department → load members | inline `request` — `@umijs/max` | GET | `/api/system/dept/{deptId}/users` |
| Add department (toolbar / row `+`) | inline `request` | POST | `/api/system/dept/add` |
| Edit department (row edit icon) | inline `request` (adds `deptId`) | PUT | `/api/system/dept/edit` |
| Delete department (row trash icon) | inline `request` body `{ids:[deptId]}` | DELETE | `/api/system/dept/remove` |
| Dict for the status select | `useDict('sys_status')` | GET | `/api/system/dict/data/type?dictType=sys_status` |
| Table columns | `usePageConfig(?)` — this page uses its own columns | — | — |

Modal fields: `parentId` (TreeSelect, root = `根部门` value `000000`), `deptName`, `sortNum`
(≥0), `status` (dict `sys_status`). Defaults: `parentId='000000'`, `status='0'`, `sortNum=0`.

There is a hidden second `<Form>` mounted purely so `getFieldsValue()` works — be careful when
refactoring the component.

---

## 3. Backend endpoints

Module: custom Koa router `prefix: '/system/dept'`, table `sys_dept`,
Zod schemas `deptCreateSchema` / `deptUpdateSchema`. No CRUD factory.

### `GET /api/system/dept/list`

- Permission: `system:dept:list`.
- `WHERE deleted=0 AND tenant_id=<ctx tenant> ORDER BY sort_num ASC`.
- `keyword` (or `deptName`) builds the ancestor chain and filters the tree.
- Returns a **nested tree** (`buildTree(rows)`, roots = `parent_id` in `"0"`/missing/self).
  There is no separate `/tree` endpoint.

### `GET /api/system/dept/:deptId/users`

- Permission: `system:dept:list`.
- `SELECT user_id, username, nickname, status, email, phone FROM sys_user
   WHERE deleted=0 AND tenant_id=? AND dept_id=? ORDER BY create_time ASC`.

### `POST /api/system/dept/add`

- Permission: `system:dept:add`.
- Zod `deptCreateSchema`:

| Field | Rule |
|---|---|
| `deptName` | string, trim, 1–50, **required** |
| `parentId` | optional, ≤32 |
| `sortNum` | optional int 0–100000 |
| `status` | optional enum `'0' \| '1'` |

- If `parentId !== '000000'`, the parent must exist inside the tenant.
- Inserts `dept_id` (snowflake), `tenant_id`, `parent_id` (default `000000`), `dept_name`,
  `sort_num` (default 0), `status` (default `'0'`), `deleted=0`.

### `PUT /api/system/dept/edit`

- Permission: `system:dept:edit`.
- `deptUpdateSchema` = create `.partial()` + required `deptId`.
- Guards: parent must not equal self; parent must exist; `collectDescendantIds()` cycle check
  rejects making a node its own descendant.
- Dynamic update of `parent_id` / `dept_name` / `sort_num` / `status`.

### `DELETE /api/system/dept/remove`

- Permission: `system:dept:remove`.
- `extractIds(body, query)` supports `{ids:[...]}` and `ids=a,b`.
- **Transaction**:
  1. all ids must be visible in the tenant, else `NotFoundError`;
  2. children check → `ConflictError('存在 N 个子部门…')`;
  3. users check → `ConflictError('该部门下仍有 N 个用户…')`;
  4. soft delete (`deleted = 1`).

There is **no** `/status` endpoint on this module.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /:deptId/users` | off | read 600/60 | `system:dept:list` |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:dept:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:dept:edit` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:dept:remove` |

Tenant isolation: every query uses `requireTenantId()` + `tenant_id = <tenant>`. No data-scope
logic in this module.

---

## 5. Frontend-only validation

- `deptName` required (`请输入部门名称`).
- `parentId` required (`请选择上级部门`); the root option is `000000`.
- `sortNum` minimum 0.

## 6. Backend-only rules (no frontend counterpart)

- Parent existence, self-parent guard, descendant-cycle guard.
- Delete is blocked while the department has children **or** users.

---

## 7. Known gaps / discrepancies

1. Delete rejection is a `ConflictError` with a friendly message — the frontend must display the
   business error (it does so through the global error handler).
2. The Excel toolbar is not used here, so `system:dept:import/export` are unused even though the
   `system-dept` Excel meta key exists in `00-common/06-file-and-excel-security.md`.
3. No status toggle (only edit).

---

## 8. How to extend

- **Add a field to departments**: add the column to `sys_dept` and `sql/Init.sql`, add it to
  `deptCreateSchema`/`deptUpdateSchema`, add it to the insert/update mapping, then add the form
  field and (optionally) a page-config column.
- **Add a status toggle**: implement `PUT /status` with `hasPerm('system:dept:status')` and add
  the switch to the page.
- **Enable Excel**: pass `excelMetaKey="system-dept"` and wire the toolbar permission codes.
- Update this document.
