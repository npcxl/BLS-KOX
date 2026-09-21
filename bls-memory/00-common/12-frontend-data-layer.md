# 12 — Frontend Data Layer: hooks, CrudTablePage, services

> **Document version:** 1.1.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* `services/auth/captcha.ts` + `components/AltchaCaptcha` (official ALTCHA
> widget wrapper) were verified against `753d86a` + uncommitted captcha changes.
>
> The `CrudTablePage` props added in 1.4.0/1.4.1 (`showActions`, `onSelectionChange`,
> `rowClickToSelect`) live in the working tree on top of `ff64e74` — re-stamp this document once that
> code is committed.

The reusable half of `bls-admin`: `src/hooks/`, the shared components that pages are built from,
and the entire service layer. If you are writing or changing a page, this is the toolkit.

Companion documents: `11-frontend-shell.md` (config/app/routing/request pipeline),
`pages/system-page-config.md` (where the column definitions come from).

---

## 1. Hooks (`bls-admin/src/hooks/`)

| Hook | File | Signature | Returns | Endpoints | Notes |
|---|---|---|---|---|---|
| `useCrudTable` | `useCrudTable.ts` | `useCrudTable<T>(resource: CrudResource, idKey: keyof T, options?: {beforeSubmit?, onSaved?, searchMode?})` | `{actionRef, lastRequestParams, modalOpen, mode, current, createDefaults, request, openCreate, openEdit, closeModal, submit, remove, changeStatus}` | `listResource` / `addResource` / `editResource` / `removeResource` / `changeResourceStatus` | Core CRUD state machine. `request` merges all non-empty filter params into `keyword` in fuzzy mode (`searchMode !== 'exact'`) and passes them as exact filters otherwise; `remove` opens a `modal.confirm`; ids are stringified. |
| `usePageConfig` | `usePageConfig.ts` | `usePageConfig(pageCode: string)` | `{columns, proColumns, formColumns, loading}` | `getPageColumnConfig(pageCode)` then `fetchDictData(code)` for each distinct `valueEnumCode` | `proColumns` keeps `visible` columns; `formColumns` keeps `editable` ones. Has a `cancelled` guard. ⚠ imports `clearDictCache` but never calls it. |
| `useDict` | `useDict.ts` | `useDict(dictType: string)` | `{options, valueEnum, loading, getLabel, refresh}` | `fetchDictData(dictType)` | Reads the module-level cache in `services/system/dict.ts`; `refresh()` clears that cache then refetches. |
| `useMultiDict` | `useDict.ts` (**not** a separate file) | `useMultiDict<T extends readonly string[]>(dictTypes: T)` | `{...result, loading}` keyed by dict type | `Promise.all(fetchDictData(...))` | Dependency key is `dictTypes.join(',')`; a failed type yields `[]`. |
| `usePermission` | `usePermission.ts` | `usePermission(required?: string \| string[], mode?: 'any' \| 'all')` | `{isAdmin, userPerms, hasPermission, can(perm, mode)}` | none (reads `@@initialState`) | Permissions come from `currentUser.perms ?? currentUser.permissions ?? []`; `isAdmin = String(isAdmin) === '1'` → always `true`. `mode:'all'` requires every code. |
| `useFileUpload` | `useFileUpload.ts` | `useFileUpload(options?: {uploadUrl?, defaultData?, transformResponse?, onSuccess?, onError?, onFinally?})` | `{uploading, upload({file, filename, data?})}` | `POST options.uploadUrl ?? '/api/system/storage/upload'` (multipart) | Default response handling treats `code !== 200` as failure and extracts `url` / `fileId` / `bucketName` / `objectName`. |
| `useWebSocket` | `useWebSocket.ts` | `useWebSocket<T>({url, heartbeatIntervalMs=15000, reconnectDelayMs=3000, maxReconnectAttempts=2, autoReauth=true, enabled=true, onOpen?, onMessage?})` | `{connected, lastMessage, reconnect}` | WS path from `buildWsUrl` | See `00-common/09-realtime-websocket.md`. |
| `useDebounce` | `useDebounce.ts` | `useDebounce<T>(value, delay = 200)` | debounced value | none | Used by `pages/system/page-config/index.tsx`. |
| `useRealtime` | `components/GlobalRealtimeProvider.tsx` | `useRealtime()` | `{connected, info, reconnect}` | (context) | Throws outside the provider. Consumed by `pages/dashboard/index.tsx`. |
| `useAiStream` | `useAiStream.ts` | `useAiStream()` | `{stream:{loading,content,latestChunk,error,done}, start(type,params), stop()}` | WS `/ws/ai` | ⚠ **dead** (no importer) and reads the token from `localStorage` directly. |

---

## 2. `CrudTablePage` (`src/components/CrudTablePage/index.tsx`)

The single component that most system pages are one-liners around. It wires `useCrudTable` +
`usePermission` + `usePageConfig` into a ProTable plus a `BetaSchemaForm` modal.

Main props:

| Prop | Purpose |
|---|---|
| `title`, `rowKey`, `resource` | Table identity; `resource` is the `CrudResource` (`basePath`, and per-action path or `false` to disable) |
| `columns` / `columnConfig`, `formColumns` | Columns are usually passed explicitly; `columnConfig`/`usePageConfig` supplies the page-config-driven set |
| `permissions` | `{create, edit, remove, status, import, export}` — each value is a permission code checked with `usePermission().can()` |
| `excelMetaKey` | When present, renders `<ExcelToolbar metaKey={…} queryParams={lastRequestParams}/>`; **the import/export permission codes are computed but never passed to the toolbar** |
| `showCreateButton`, `showEditAction`, `showRemoveAction`, `showFormModal`, `embedded` | Action visibility |
| `showActions` | `false` ⇒ the whole 操作 column is **not rendered** (not merely hidden), for pages that give the table less width |
| `onSelectionChange(rows)` | Forwards the table's `rowSelection.onChange` (row-selection state stays owned by `rowSelection`) |
| `rowClickToSelect` | Clicking anywhere on a row **selects that row** (single — it replaces the previous selection) by driving the now-controlled `rowSelection.selectedRowKeys`; clicks inside the selection column are ignored so unticking a row still works. Used by `/system/role` (click a role ⇒ its menu permissions load on the right). The hand-rolled `onRowClick`/`isRowSelected` props (own highlight + `cursor:pointer`) were **removed** — antd renders the highlight |
| `extraActions`, `toolbarExtra`, `tableAlertExtraRender` | Row-level extra actions, extra toolbar nodes, batch-action bar |
| `beforeSubmit(values, current)`, `onSaved` | Payload shaping / post-save hooks (many pages use `beforeSubmit` to preserve fields the form omits) |
| `defaultSearchMode`, `showSearchModeToggle` | Fuzzy (keyword) ⇄ exact filter switch, backed by `useCrudTable`'s `searchMode` |
| `statusKey`, `modalWidth`, `pagination`, `scroll`, `expandable`, `formGrid`, `formColProps`, `createButtonText` | Layout / behaviour |

Behaviours worth remembering:

- `canCreate/canEdit/canRemove/canStatus` are `permissions.x ? permission.can(x) : true`, so a page
  that omits `permissions` shows every action.
- Dictionary columns are rendered as `<Tag>` from `valueEnum`.
- On edit it normalises initial values: `switch` → boolean, `textarea` containing JSON → parsed,
  `multiple` → array. **Keep that list in sync if you add a new `valueType`.**
- `status` toggle is rendered only when `resource.status !== false`.

## 3. Other live shared components

| Component | Purpose | Used by |
|---|---|---|
| `ExcelToolbar` | Template download / export / import. Endpoints `GET /api/common/excel/template`, `POST /api/common/excel/export`, `POST /api/common/excel/import`; reads `x-excel-matched-count` / `x-excel-export-count`; `MAX_EXPORT = 10000`. | `CrudTablePage` via `excelMetaKey` |
| `FileUploadModal` | Modal uploader over `useFileUpload`; props `open, onOpenChange, onUploaded?, title, uploadUrl, accept, extraData`. | `pages/system/file-config/files` |
| `IconPicker` | Ant Design icon picker (also exports `getAntdIcon(icon, style)`). | `pages/system/menu` |
| `RebuildIndexModal` | Search-index rebuild (see `pages/global-search.md`). | `pages/system/config` |
| `ErrorBoundary` | Class boundary distinguishing `ChunkLoadError` from render errors; retry/remount, reload, home. | `app.tsx` |
| `OfflineBanner` | Fixed alert while `navigator.onLine === false`. | `app.tsx` |
| `Footer` | Copyright + version link from `sys.app.name` / `sys.version`. | `app.tsx` |
| `HeaderDropdown` | styled antd `Dropdown` wrapper. | `LangDropdown`, `AvatarDropdown` |
| `AvatarDropdown` | 个人设置 / 主题设置 / 退出登录 (`outLogin()` + `resetSession()`). | `app.tsx` `avatarProps.render` |
| `GlobalSearchModal` | Ctrl+K search overlay. | `app.tsx` `actionsRender` |
| `LangDropdown` | Language switcher (8 locales). | `app.tsx` `actionsRender` |
| `GlobalRealtimeProvider` / `useRealtime` | WS context. | `app.tsx`, dashboard |
| `TokenRefreshGuard` | 60 s timer, refreshes when ≤120 s remain. | `app.tsx` |

⚠ Dead components (no importer): `RichTextEditor`, `AiStreamOutput`, `VersionDropdown`,
`DashboardRealtimeCard`, `AvatarList`, `DocLink`, the composed `RightContent`, plus
`TagSelect` / `StandardFormRow` / `ArticleListContent` (only used by unrouted scaffold pages).
`components/PageTabs/` is an **empty directory**.

## 4. Service layer (`bls-admin/src/services/`)

### 4.1 `ant-design-pro/api.ts` — every export

| Function | Method + path | Live? |
|---|---|---|
| `currentUser` | GET `/api/auth/profile` | ✔ `app.tsx`, `account/settings` |
| `outLogin` | POST `/api/auth/logout` (`{refreshToken}`, `skipAuthRefresh`, `skipErrorMessage`) | ✔ `AvatarDropdown` |
| `login` | POST `/api/auth/login` — **MD5-hashes the password client-side** | ✔ `user/login` |
| `refreshToken` | POST `/api/auth/refresh` | ✔ `auth/refresh-manager.ts` |
| `tenantLoginOptions` | GET `/api/system/tenant/public-list` | ✖ dead |
| `getDashboardStats` | GET `/api/system/dashboard/stats` | ✔ dashboard |
| `getSystemStatus` | GET `/api/system/dashboard/system-status` | ✖ dead |
| `getRecentLogs` | GET `/api/system/dashboard/recent-logs` | ✔ dashboard |
| `publicThemeConfig` | GET `/api/system/config/public-theme` | ✔ `app.tsx` |
| `publicSystemConfig` | GET `/api/system/config/public-system` | ✔ `app.tsx` |
| `themeCurrent` | GET `/api/system/theme/current` — module-level in-flight dedup (`themeCurrentPromise`) | ✔ `app.tsx` |
| `systemCurrent` | GET `/api/system/config/current` — same dedup pattern | ✔ `app.tsx` |
| `themeList` | GET `/api/system/theme/list` | ✖ dead |
| `addTheme` | POST `/api/system/theme/add` | ✔ `app.tsx` |
| `updateTheme` | PUT `/api/system/theme/edit` | ✔ `app.tsx` |

### 4.2 Other service files

| File | Exports | Notes |
|---|---|---|
| `system/crud.ts` | `listResource` (GET), `addResource` (POST), `editResource` (PUT), `removeResource` (DELETE with body `{ids}` **and** `params.ids=a,b,c`), `changeResourceStatus` (PUT); types `PageResult<T>`, `CrudResource` | `buildUrl` throws when an action is `false` (disabled). `PageResult<T>` is duplicated in `system/log.ts`. |
| `system/dict.ts` | `fetchDictData`, `clearDictCache`, `getDictLabel`, `getDictValueEnum`, `getDictFormValueEnum` | `fetchDictData` caches successful results (including `[]`) per `dictType` and dedups in-flight calls; failures are not cached. `clearDictCache()` is called on logout and by `useDict().refresh()`. The three `getDict*` helpers are dead. |
| `system/log.ts` | `listLoginLogs`, `listOperationLogs`, `listUploadAudits`, `listSqlAudits` + record types | Backs the four log pages. |
| `system/page-config.ts` | `listPageConfigs`, `getPageConfig`, `getPageColumnConfig`, `savePageConfig`, `deletePageConfig` | Backs `usePageConfig` and the page-config editor. |
| `system/settings.ts` | `setRefreshGlobalSettingsHandler(handler?)`, `refreshGlobalSettings()` | In-memory bridge: `app.tsx` registers `refreshSettings`; `system/config` and `app.tsx` call it. |
| `system/user.ts` | `updateProfile` (PUT `/api/system/user/profile`) | Used by `account/settings`. |
| `system/realtime.ts` | `fetchRealtimeInfo` (GET `/api/system/realtime/info`) | ✖ dead — no such server route; realtime data arrives over WS. |
| `system/global-search.ts` | `globalSearch(keyword)` | Backs `GlobalSearchModal`. |
| `ai/conversation.ts` | conversation + model CRUD | ✔ Live — `pages/ai/workbench`. |
| `ai/chat-provider.ts` | `chatStream`, `getConversations`, `getConversationMessages`, `saveConversation`, `deleteConversation` | ✖ dead; duplicates `ai/conversation.ts` via raw fetch. |
| `ai/module-builder.ts` | `chatCompletions` | ✖ dead; a second raw-fetch SSE implementation. |
| `ops/release.ts` | release list/detail/steps/logs/create/rollback/current/running/service-status | ✔ Live — `pages/ops/release`. |
| `security/replayInterceptor.ts` | `buildReplayHeaders`, `idempotencyKey` | Live only for the AI workbench's raw fetch. |
| `ant-design-pro/index.ts`, `ant-design-pro/login.ts` | aggregate barrel, `getFakeCaptcha` (GET `/api/login/captcha`) | ✖ dead — superseded by `services/auth/captcha.ts`; the `/api/login/captcha` endpoint does not exist. |
| `auth/captcha.ts` | `getCaptchaConfig`, `verifyCaptcha`, `CAPTCHA_REASON_TEXT` + types | ✔ Live — ALTCHA login captcha (`pages/user/login`, `components/AltchaCaptcha`). Both calls pass `skipErrorMessage:true`; the login page owns the error UX. The challenge itself is fetched by the official widget. |
| `components/AltchaCaptcha/index.tsx` | `AltchaCaptcha` (forwardRef) | ✔ Live — thin React wrapper around the **official** `<altcha-widget>`: mounts it with `challenge`/`auto`/`display`/`language="zh-cn"`, imports `altcha` + `altcha/i18n/zh-cn`, forwards `verified`/`statechange`/`expired`, and themes it through the official `--altcha-*` CSS variables. No captcha logic lives here. |

## 5. Known inconsistencies

1. `PageResult<T>` declared twice (`system/crud.ts`, `system/log.ts`).
2. Replay headers generated twice (`requestErrorConfig.ts` inline vs `buildReplayHeaders()`).
3. Three raw-fetch AI client implementations (`ai/conversation.ts` uses umi `request`;
   `ai/chat-provider.ts` and `ai/module-builder.ts` use `fetch`; the workbench has its own
   inline `fetch` with `authHeader()`), and two of them return the token from
   `localStorage['token']` instead of `tokenStore`.
4. Two permission mechanisms (`access.ts` vs `usePermission.ts`), only one used.
5. `usePageConfig.ts` imports `clearDictCache` without using it.
6. `CrudTablePage` computes `canImport`/`canExport` but never passes them to `ExcelToolbar`.
7. Dead exports keep accumulating — see §3/§4 marks; the same style of dead code exists on the
   backend (see `00-common/08` §8, `09` §5, `10` §6).

---

## 6. Cookbooks

### 6.1 Add a standard CRUD page

1. Define the resource:
   `const resource = {basePath: '/api/system/<name>'}` (set an action to `false` to disable it).
2. Insert `sys_page_config` + `sys_page_column_config` rows for the page code, **or** pass
   `columns` / `formColumns` explicitly.
3. Render:
   ```tsx
   <CrudTablePage<Record>
     title="…"
     rowKey="<pkCamel>"
     resource={resource}
     columns={columns}
     formColumns={formColumns}
     permissions={{create:'system:x:add', edit:'system:x:edit', remove:'system:x:remove',
                   status:'system:x:status', import:'system:x:import', export:'system:x:export'}}
     excelMetaKey="system-x"           // only when the Excel module has a meta for this table
     beforeSubmit={(values, current) => ({...values, id: current?.id})}
     onSaved={() => refreshGlobalSettings()}
   />
   ```
4. Backend: either `defineCrudConfig(...)` (config style — declare `fields` and let the factory
   derive the whitelists, search/filter, response projection and Zod; see
   `00-common/00-architecture.md` §5) with `permPrefix: 'system:x'`, or hand-written routes with
   `hasPerm(...)`.
5. Seed the menu + button permission rows; keep the codes identical on both sides
   (`list/add/edit/remove/status` — the factory's detail endpoint reuses `:list`).
6. Verify `npm run tsc` in `bls-admin` and `npm run lint && npm run test && npm run build` in
   `bls-server`; run `npm run openapi` whenever a route or parameter changed.

### 6.2 Add a service function

Put it in the closest `services/*` file, return the umi `request` promise, and let the global
error handler show messages — do **not** catch and re-toast unless you pass
`skipErrorMessage`. Add `skipErrorMessage: true`, `skipErrorHandler: true` or
`skipAuthRefresh: true` only when the caller handles the failure itself.

### 6.3 Use a backend dictionary in a form

```tsx
const status = useDict('sys_status');          // single
const {sysGender, sysYesNo} = useMultiDict(['sys_gender','sys_yes_no']);  // several
// status.valueEnum → ProTable column valueEnum
// status.options   → Select options
```

After editing dictionaries in `/system/dict`, call `status.refresh()` (or reload) — the module
cache does not invalidate itself.

### 6.4 Upload a file from a custom component

```tsx
const {uploading, upload} = useFileUpload();
await upload({file, data: {accessType: 'public', moduleName: 'attachment'}});
```

Validation is entirely server-side (`00-common/06-file-and-excel-security.md`); `moduleName`
must match `/^[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z0-9_-]{0,31}$/`.
