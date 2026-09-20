# Page — Theme Configuration (`/system/theme`)

> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 9b22800 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/theme` (name 主题配置) |
| Component | `bls-admin/src/pages/system/theme/index.tsx` (renders `CrudTablePage`) |
| Purpose | Tenant-scoped CRUD of `sys_theme_config` (nav theme, primary colour, layout, logo, token JSON) |
| Backend module | `bls-server/src/api/system/theme/index.ts` (functions + `defineCrudModule`) |
| Tables | `sys_theme_config`, `sys_page_column_config` |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md` |

Two consumers:

1. This page (explicit theme CRUD).
2. The Ant Design Pro `SettingDrawer` in `bls-admin/src/app.tsx`, which autosaves the currently
   active theme on every setting change (`updateTheme` / `addTheme`).

Public/unauthenticated theme lookup for the login page uses
`GET /api/system/config/public-theme` (the config module), **not** `/api/system/theme/public`.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search (`title` keyword) | `listResource` | GET | `/api/system/theme/list` |
| Create | `addResource` | POST | `/api/system/theme/add` |
| Edit | `editResource` | PUT | `/api/system/theme/edit` |
| Delete (single / batch) | `removeResource` | DELETE | `/api/system/theme/remove` |
| Status toggle | **disabled** (`resource.status:false`) | — | — |
| Columns | `usePageConfig('system_theme')` | GET | `/api/system/page-config/page/system_theme/columns` |
| Dicts | `useDict` ×5: `sys_status`, `sys_yes_no`, `sys_nav_theme`, `sys_layout_type`, `sys_content_width` | GET | `/api/system/dict/data/type?dictType=...` |
| App shell: load the active theme | `themeCurrent()` | GET | `/api/system/theme/current` |
| Login page: public theme | `publicThemeConfig()` | GET | `/api/system/config/public-theme` |
| SettingDrawer autosave | `updateTheme({themeId, ...})` or `addTheme(payload)` | PUT / POST | `/api/system/theme/edit` / `/api/system/theme/add` |

`beforeSubmit` normalises `colorPrimary` (object → string), coerces
`fixedHeader`/`fixSiderbar`/`colorWeak` to `1|0`, defaults `tokenJson` to `'{}'`, and keeps
`title` / `status` / `remark`.

The SettingDrawer flow: on change → optimistic local state → `addTheme`/`updateTheme` →
`refreshGlobalSettings()` (re-reads theme + system config) → on failure restore the previous
settings and show an error.

---

## 3. Backend endpoints

Module: `bls-server/src/api/system/theme/index.ts` exports `config` (→ `defineCrudModule`) plus a
`current` function (auto-registered as `GET /system/theme/current` because the name does not start
with `public`, so it gets `jwtAuth()`).

### CRUD factory part

| Config | Value |
|---|---|
| `table` / `pkField` | `sys_theme_config` / `theme_id` |
| `searchFields` | `['title']` (legacy `theme_name`/`theme_key` would generate invalid SQL) |
| `filterFields` | `['status']` |
| `createFields` = `updateFields` | `nav_theme, color_primary, layout, content_width, fixed_header, fix_siderbar, color_weak, split_menus, sider_menu_type, title, logo, iconfont_url, token_json, status, remark` |
| `permPrefix` | `system:theme` → `system:theme:list/add/edit/remove/status` |
| defaults | softDelete true, statusField `status`, dataScope off, transactional false, **no `onWrite`**, **no Zod schema** |

Generated endpoints: `GET /list`, `GET /:id`, `POST /add`, `PUT /edit`, `DELETE /remove`,
`PUT /status`.

The module still uses the **legacy array style**. Migrating it to the config style
(`defineCrudConfig` + `fields`, see `00-common/00-architecture.md` §5) would keep every endpoint
and every whitelist identical while adding typed validation for free — e.g.
`token_json: { type: 'json', … }` validates the JSON, `status: { type: 'enum', values: ['0','1'],
status: true }` validates the status toggle, and `select: false` could hide internal columns from
the response. Remember that the projected response would then contain only the declared
`select !== false` fields plus the PK (today it is `selectAll`).

### `GET /api/system/theme/current`

- Auth: `jwtAuth()`.
- Uses `getCurrentTenantId() ?? PLATFORM_TENANT_ID`; returns the first row with `status='0' AND
  deleted=0`, falling back to the platform tenant row.

### Non-existent endpoints

- `GET /api/system/theme/public` — **does not exist**; the public theme lives at
  `/api/system/config/public-theme`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /:id`, `GET /current` | off | read 600/60 | `system:theme:list` (CRUD) / JWT for `/current` |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:theme:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:theme:edit` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:theme:remove` |
| `PUT /status` (exists, disabled in UI) | default write nonce | write 300/60 | `system:theme:status` |

Tenant isolation: the CRUD factory injects `tenant_id = requireTenantId()`. `/current` is scoped
to the caller's tenant with a `000000` fallback.

---

## 5. Frontend-only validation

- Form defaults only: `navTheme: light`, `colorPrimary: #1677ff`, `layout: mix`,
  `contentWidth: Fluid`, plus switches.
- `normalizeColorValue` guarantees a string colour; booleans become `0|1`.
- `tokenJson` is a plain textarea — **no JSON parsing or validation on the frontend**
  (`CrudTablePage` pretty-prints existing `*Json` fields when opening edit).

## 6. Backend-only rules

- Whitelist filtering only.
- **No enum validation** for `nav_theme` / `layout` / `content_width`.
- **No JSON validation** for `token_json`.
- No length caps.
- `split_menus` / `sider_menu_type` are writable but the page form never sends them.

---

## 7. Known gaps / discrepancies

1. There is no `excelMetaKey`, so no Excel toolbar (the declared import/export permissions are
   unused).
3. `token_json` is unvalidated; a malformed value breaks the layout because `parseThemeSettings`
   silently ignores a JSON parse failure (it just drops the token).
4. The page can create multiple theme rows; `/current` returns the first `status='0'` row, so the
   ordering is effectively arbitrary. Consider a single "active theme per tenant" constraint
   (like storage's `is_default` behaviour).

---

## 8. How to extend

- **Add a theme setting**: add the column to `sys_theme_config`, to `createFields`/`updateFields`,
  to the form, and to `parseThemeSettings` in `bls-admin/src/app.tsx`.
- **Validate `token_json`**: add a Zod schema to the module config (`jsonish`-style refine, see the
  storage module) — or migrate the module to `defineCrudConfig` and declare the field as
  `{ type: 'json', create: true, update: true }`, which generates the check from `fields`
  (`00-common/00-architecture.md` §5) — and mirror the check on the frontend.
- **Enforce one active theme**: clear `status` on other rows when setting one to `'0'`
  (mirror `applyDefaultFlag` in the storage module) and add `onWrite` to invalidate any cache.
- Update this document.
