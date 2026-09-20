# Page — Menu Management (`/system/menu`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/menu` (name 菜单管理) |
| Component | `bls-admin/src/pages/system/menu/index.tsx` (renders `CrudTablePage`) + `IconPicker` |
| Purpose | Hierarchical menu / permission CRUD (tables, directories, buttons) |
| Backend module | `bls-server/src/api/system/menu/index.ts` |
| Tables | `sys_menu`, `sys_role_menu`, `sys_package_menu` |
| Shared docs | `00-common/02-replay-protection.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md` |

⚠ **`sys_menu` is a GLOBAL table**: it has **no `tenant_id` and no `deleted` column**.
Menu rows are shared by every tenant; tenants get access to menus through roles/packages.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| Load the menu tree (mount) | `listResource<MenuRecord>({basePath:'/api/system/menu'})` | GET | `/api/system/menu/list` |
| Create | `addResource` via `useCrudTable` | POST | `/api/system/menu/add` |
| Edit | `editResource` via `useCrudTable` | PUT | `/api/system/menu/edit` |
| Delete (row / batch) | `removeResource` via `useCrudTable` | DELETE | `/api/system/menu/remove` |
| Row "图标" action → `IconPicker.onConfirm` | `editResource({...record, icon})` | PUT | `/api/system/menu/edit` |
| Refresh the tree after an icon change | `listResource` | GET | `/api/system/menu/list` |
| Dicts | `useDict('sys_menu_type')`, `useDict('sys_status')` | GET | `/api/system/dict/data/type?dictType=...` |
| Columns | `usePageConfig('system_menu')` | GET | `/api/system/page-config/page/system_menu/columns` |

Modal fields: `parentId*` (TreeSelect, root `根目录` = `000000`), `menuName*`,
`menuType` (dict `sys_menu_type`, default `1`), `path`, `component`, `perms`,
`status` (default `0`), `sortNum`.
Frontend-only: the parent TreeSelect filters out `menuType === '2'` (buttons); the "图标" row
action is hidden for buttons. Page uses `pagination={false}` and
`expandable={{defaultExpandAllRows:true}}`. `resource.status` is `false` → no status toggle,
no Excel toolbar.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/menu'`; tables `sys_menu` (`T`), `sys_role_menu` (`RM`),
`sys_package_menu` (`PM`).

### `GET /api/system/menu/list`

- Permission: `system:menu:list`.
- Reads **all** `sys_menu` rows `ORDER BY sort_num ASC` (no tenant filter — global table).
- `keyword` (or `menuName`) uses the ancestor-chain filter.
- Returns `buildMenuTree(rows)`.

### `GET /api/system/menu/package-tree`

- Permission: `system:menu:list`.
- `WHERE status='0'`, returns `buildMenuTree` — used by role/package authorization modals.

### `POST /api/system/menu/add`

- Permission: `system:menu:add`.
- Zod `menuCreateSchema`:

| Field | Rule |
|---|---|
| `parentId` | optional, ≤32 (default `000000`) |
| `menuName` | 1–50, **required** |
| `path` | ≤200, nullish |
| `component` | ≤200, nullish |
| `perms` | ≤100, nullish |
| `icon` | ≤100, nullish |
| `menuType` | enum `'0'｜'1'｜'2'`, default `'1'` |
| `sortNum` | int 0–100000 |
| `status` | enum `'0'｜'1'` |

- Never writes `deleted` / `tenant_id`.

### `PUT /api/system/menu/edit`

- Permission: `system:menu:edit`.
- `menuUpdateSchema` (partial + required `menuId`); guard `parentId === menuId` →
  `上级菜单不能是自己`.

### `DELETE /api/system/menu/remove`

- Permission: `system:menu:remove`.
- Transaction: existence check (`menu_id in ids`, else 404); BFS to collect **all descendants**;
  `DELETE sys_role_menu` + `DELETE sys_package_menu` + `DELETE sys_menu` for every collected id.

There is **no** `/status` endpoint.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /package-tree` | off | read 600/60 | `system:menu:list` |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:menu:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:menu:edit` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:menu:remove` |

**No tenant isolation** — `sys_menu` is global. Any authenticated user with the permission edits
menus for the whole platform; this is the intended design (only the platform tenant should hold
`system:menu:*`).

---

## 5. Frontend-only validation

- `parentId` required (`请选择上级菜单`); `menuName` required (`请输入菜单名称`).
- Button rows (`menuType === '2'`) cannot be chosen as a parent.

## 6. Backend-only rules

- Self-parent guard.
- Recursive delete of all descendants and their role/package links.

---

## 7. Known gaps / discrepancies

1. The page passes **no `permissions` prop**, so every action is visible to everyone whose role
   has the menu (no per-button gating).
2. No status toggle even though `sys_menu.status` exists and is used by `/package-tree`.
3. There is no tenant copy mechanism: menus are global, so a new tenant's menu set comes from
   packages/roles rather than per-tenant rows. Do not add `tenant_id` to `sys_menu` without a
   migration plan — it would break `tenantWhere()`'s global-table list.

---

## 8. How to extend

- **Add a menu field**: extend `sys_menu`, `menuCreateSchema`/`menuUpdateSchema`, the
  insert/update mapping and the form.
- **Add a status toggle**: implement `PUT /status` with `hasPerm('system:menu:status')`.
- **Add per-button permissions**: pass a `permissions` object to `CrudTablePage` and add the
  `sys_menu` button rows for them.
- **Move menus to per-tenant**: this is a breaking change — remove `sys_menu` from the global
  table list in `bls-server/src/middleware/tenant.ts`, add `tenant_id` + `deleted` columns with a
  migration, and update `sys_role_menu`/`sys_package_menu` handling.
- Update this document.
