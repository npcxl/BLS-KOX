# Page — Role Management (`/system/role`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/role` (name 角色管理) |
| Component | `bls-admin/src/pages/system/role/index.tsx` + `components/MenuAuthModal.tsx` |
| Purpose | Role CRUD, status toggle, and menu/permission assignment to a role |
| Backend module | `bls-server/src/api/system/role/index.ts` |
| Tables | `sys_role`, `sys_role_menu`, `sys_user_role`, `sys_menu`, `sys_page_column_config` |
| Shared docs | `00-common/02-replay-protection.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md` |

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search | `listResource({basePath:'/api/system/role'})` via `useCrudTable` | GET | `/api/system/role/list` |
| Create | `addResource` | POST | `/api/system/role/add` |
| Edit | `editResource` | PUT | `/api/system/role/edit` |
| Status toggle (row action) | `changeResourceStatus` body `{roleId, status}` | PUT | `/api/system/role/status` |
| Delete (row / batch) | `removeResource` | DELETE | `/api/system/role/remove` |
| Open "菜单权限" modal → load menu tree | inline `request` | GET | `/api/system/menu/package-tree` |
| Load the role's granted menus | inline `request` | GET | `/api/system/role/{roleId}/menus` |
| Submit menu assignment | inline `request` body `{menuIds}` | PUT | `/api/system/role/{roleId}/menus` |
| Excel template / export / import | `ExcelToolbar` (`metaKey="system-role"`) | GET / POST / POST | `/api/common/excel/template` · `/export` · `/import` |
| Columns / dicts | `usePageConfig('system_role')`, `useDict('sys_status')` | GET | `/api/system/page-config/page/system_role/columns`, `/api/system/dict/data/type` |

Modal fields: `roleName*`, `roleKey*`, `status` (dict `sys_status`), `sortNum`, `remark`.

`MenuAuthModal` builds the tree from `/api/system/menu/package-tree`, sets checked keys to
"checked minus parent keys", and submits `[...checkedKeys, ...halfCheckedKeys]` as `menuIds`.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/role'`; tables `sys_role` (`T`), `sys_role_menu` (`RM`),
`sys_user_role` (`UR`), `sys_menu` (`MENU`).
`DATA_SCOPES = ['ALL','TENANT','DEPT','DEPT_AND_CHILDREN','SELF','CUSTOM']`.

### `GET /api/system/role/list`

- Permission: `system:role:list`.
- Paging, `deleted=0`, tenant scoped; searchable columns from `sys_page_column_config`
  (`page_code='system_role'`); `keyword` OR-LIKE; per-column exact filters; `ORDER BY sort_num ASC`.

### `GET /api/system/role/:roleId/menus`

- Permission: `system:role:list`.
- `assertTenantResource('sys_role','role_id',roleId)` then returns the `menu_id` list from
  `sys_role_menu`.

### `POST /api/system/role/add`

- Permission: `system:role:add`.
- Zod `roleCreateSchema`:

| Field | Rule |
|---|---|
| `roleName` | 1–50, required |
| `roleKey` | 2–50, regex `/^[A-Za-z0-9_:.-]+$/`, required |
| `dataScope` | optional enum (DATA_SCOPES) |
| `sortNum` | int 0–100000 |
| `status` | enum `'0'｜'1'` |
| `remark` | ≤500, nullish |

- `roleKey` unique per tenant (`uk_role_tenant_key`) → `ConflictError('角色标识已存在')`.
- Defaults: `data_scope='TENANT'`, `sort_num=0`, `status='0'`.

### `PUT /api/system/role/edit`

- Permission: `system:role:edit`.
- `roleUpdateSchema` (partial + required `roleId`); unique `roleKey` excluding self; dynamic update.

### `PUT /api/system/role/status`

- Permission: `system:role:status`.
- `statusSchema {roleId: 1–32, status: enum '0'|'1'}`; tenant-scoped update.

### `PUT /api/system/role/:roleId/menus`

- Permission: `system:role:assignMenu`.
- `menuAssignSchema {menuIds: string[] max 2000, default []}`.
- `assertTenantResource` on the role; every menu id must exist in `sys_menu`
  (else `ValidationError('存在无效的菜单ID')`).
- **Transaction**: `DELETE FROM sys_role_menu WHERE role_id=?` then insert.

### `DELETE /api/system/role/remove`

- Permission: `system:role:remove`.
- Transaction: tenant visibility check (else 404); `DELETE sys_role_menu` + `DELETE sys_user_role`
  + soft delete `sys_role`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list` | off | read 600/60 | `system:role:list` |
| `GET /:roleId/menus` | off | read 600/60 | `system:role:list` |
| `POST /add` | **explicit rule: nonce, 60 s / 180 s** | write 300/60 | `system:role:add` |
| `PUT /edit` | **explicit rule: nonce, 60 s / 180 s** | write 300/60 | `system:role:edit` |
| `DELETE /remove` | **explicit rule: nonce, 60 s / 180 s** | write 300/60 | `system:role:remove` |
| `PUT /status` | default write nonce (120 s / 300 s) | write 300/60 | `system:role:status` |
| `PUT /:roleId/menus` | default write nonce | write 300/60 | `system:role:assignMenu` |

`/api/system/role/add|edit|remove` have their own (tighter) replay rules in
`bls-server/src/config/replay-protection.ts` — see `00-common/02-replay-protection.md`.

---

## 5. Frontend-only validation

- `roleName` required (`请输入角色名称`); `roleKey` required (`请输入角色标识`).
- `status` / `sortNum` / `remark` defaults.

## 6. Backend-only rules

- `roleKey` min 2 + regex (stricter than the frontend, which only checks non-empty).
- `dataScope` restricted to the enum.
- `roleKey` uniqueness per tenant (409).

---

## 7. Known gaps / discrepancies

1. The "菜单权限" action is **not** gated by `system:role:assignMenu` on the frontend.
2. `system:role:import/export` are declared but not enforced by the shared Excel toolbar.
3. `data_scope` is stored and validated but **not consumed** for row filtering by this module
   (no data-scope evaluation in `api/system/role/`). Row-level filtering must be implemented in
   the consuming business modules.
4. Deleting a role does not check whether users are still assigned to it (it silently removes the
   `sys_user_role` links).

---

## 8. How to extend

- **Add a role field**: extend `sys_role`, the Zod schemas, the insert/update mapping and the form.
- **Add a data-scope selector** to the UI (the backend already accepts `dataScope`), then consume
  `data_scope` in business list queries via `resolveMaxScope()` + `buildScopeWhere()`.
- **Gate the menu-permission action**: use `usePermission().can('system:role:assignMenu')` around
  the row action.
- **Protect against deleting a role in use**: count `sys_user_role` rows and return a
  `ConflictError` like the tenant/package modules do.
- Update this document.
