# 11 — Frontend Shell: config, app.tsx, routing, i18n, request pipeline

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

Everything in `bls-admin` that is **not** a page: build config, dev proxy, the app runtime
(`getInitialState` / `layout` / `rootContainer`), routing, access control, the request pipeline,
i18n and global style/PWA files.

Read this together with `00-common/04-auth-and-permissions.md` (token strategy) and
`12-frontend-data-layer.md` (hooks, `CrudTablePage`, services).

---

## 1. Build config — `bls-admin/config/config.ts`

| Key | Value | Note |
|---|---|---|
| `alias` | `@root` → `bls-admin/` | |
| `hash` / `publicPath` | `true` / `'/'` (hard-coded constant) | Non-root deploys need this changed. |
| `routes` | `./routes.ts` | Only pages referenced there are compiled. |
| bundle | **`utoopack` (`@utoo/pack`)** | ⚠ There is **no `mfsu` and no `esbuild` config**; `module.rules['*.md']` uses the local loader `config/md-raw-loader.cjs` (`as: '*.js'`), `sourceMaps:false`. The build expects `dist/stats.json` to keep being emitted. |
| `proxy` | `proxy[UMI_ENV]` | `UMI_ENV` defaults to `'dev'`. |
| `define` | `process.env.CI`, `process.env.COMMIT_HASH` (from `COMMIT_HASH` / `CF_PAGES_COMMIT_SHA` / `git rev-parse HEAD`), `__APP_VERSION__` (package.json version), `__UMI_VERSION__`, `__UTOO_VERSION__` | Shown in the footer / version tooltip. |
| `locale` | `{default:'zh-CN', antd:true, baseNavigator:true}` | `baseNavigator` lets the browser language win. |
| `antd` | `{configProvider:{variant:'filled', theme:{token:{fontFamily:'AlibabaSans, sans-serif'}}}}` | |
| plugins | `['@umijs/max-plugin-openapi']` + `openAPI` pointing at `config/oneapi.json` (mock disabled) | |
| `layout` | `{locale:false, ...defaultSettings}` | Disables ProLayout's own menu i18n. |
| `moment2dayjs`, `ignoreMomentLocale`, `fastRefresh`, `routePrefetch`, `manifest`, `model`, `initialState`, `request`, `reactQuery`, `access` | enabled (`{}`) | `access` is enabled but unused — see §5. |
| `headScripts` | `[{src:'/scripts/loading.js', async:true}]` | First-paint spinner. |
| CSP | only a **commented-out** dev-only `headers` block | Production security headers come from `nginx.conf`. |

API base URL: `app.tsx` exports `request = {baseURL: '' /* both dev and prod */, ...errorConfig}`.
Dev reaches the backend through the Umi dev-server proxy; production is same-origin behind nginx.

## 2. Dev proxy — `bls-admin/config/proxy.ts`

Only the `dev` key exists (`proxy[UMI_ENV]` with `UMI_ENV=pre|test` would yield `undefined`).

| Rule | Target | Notes |
|---|---|---|
| `/api/ai/chat/conversations` | `http://localhost:6001` | Koa backend — **listed before** the generic `/api/ai/` rule |
| `/api/ai/` | `http://localhost:7201` | AI micro-service, `proxyTimeout: 300000` (5 min for SSE) |
| `/api/` | `http://localhost:6001` | Koa backend (switch to `:8080` for Java or `:6002` for Rust) |
| `/ws/` | `ws://localhost:6001` | `ws: true`, `changeOrigin: true` |

There is **no `/files` dev rule** — MinIO public URLs (`/files/...`) only work behind nginx.

## 3. Routing — `config/routes.ts`

- All route `name` values are **literal Chinese strings**, consistent with `layout.locale:false`
  and with the fact that the sidebar is driven by backend menus (§4).
- Groups: `/user/*` (`layout:false`), `/dashboard`, `/account/settings`, `/system/*`
  (dept, user, role, menu, config, dict, theme, page-config, log/{audit,security,login,sql-audit},
  security, webhook), `/file-config/{storage,files}`, `/tenant/{list,package}` (`hideInMenu`),
  `/ai/{workbench,models,usage}`, `/ops/release`, `/` → `/dashboard`, `/*` → `./exception/404`.
- `config/routes.simple.ts` is a **maintainer template only** (consumed by `scripts/simple.js` to
  strip the Ant Design Pro scaffold). It is imported by nothing and references pages that no
  longer exist (`./Welcome`, `./Admin`, `./table-list`) — do not treat it as the route source.

## 4. App runtime — `src/app.tsx`

Exports: `getInitialState`, `layout`, `request`, `rootContainer`.

### `getInitialState()`

1. `fetchUserInfo()` → `GET /api/auth/profile`; stores into `tokenStore.setCurrentUser()`;
   on error redirects to `/user/login?redirect=<current>`.
2. `fetchPublicSettings()` → `Promise.all([publicThemeConfig({skipErrorMessage:true}), publicSystemConfig({skipErrorMessage:true})])`
   (unwraps `data.data ?? data`) → `{theme, systemMap}`.
3. `fetchAuthSettings()` → `Promise.all([themeCurrent(), systemCurrent()])` — deliberately **without**
   `skipErrorHandler` so a 401 can trigger a refresh.
4. `refreshSettings()` — logged-in → `fetchAuthSettings()` (failure keeps the current values);
   else `fetchPublicSettings()`. Merges `defaultSettings` + theme, resolving `title` from
   `sys.app.name` and `logo` from `sys.app.logo`. Registered globally through
   `setRefreshGlobalSettingsHandler(refreshSettings)`.
5. Public route (`/user/login`, `/user/register`, `/user/register-result`) → return immediately.
6. Otherwise `await ensureValidSession()`; not `'valid'` → `redirectToLogin()` and return a
   minimal state. Then `fetchAuthSettings()` (throw → `redirectToLogin()`), merge, and
   `currentUser = await fetchUserInfo()`.

Returned state: `{fetchUserInfo, refreshSettings, settings, themeMeta, currentUser, settingDrawerOpen, systemMap}`.

### `layout` (RunTimeLayoutConfig)

| Hook | Behaviour |
|---|---|
| `menuDataRender()` | Builds the sidebar from **backend** `initialState.currentUser.menus` (`mapBackendMenus`): drops `menuType==='2'` (buttons) and any `/dashboard` node, maps `icon` string → Ant Design icon component, sets `locale:false` on every node, and always prepends a synthetic `/dashboard` node titled by `systemMap['sys.dashboard.name']` (fallback `首页`). **Router config therefore only limits what is reachable; the API decides what is displayed.** |
| `selectedKeys` | `normalizeSelectedKeys(pathname)` — special-cases `/system/`, `/tenant/`, `/ai/`, `/dashboard`. |
| `menuItemRender` | Wraps any item with a `path` in `<Link prefetch>`. |
| `actionsRender()` | `[<GlobalSearchModal key="global-search"/>, localeEnabled && <LangDropdown key="lang"/>]`, where `localeEnabled = settings.locale !== false`. |
| `avatarProps` | `src` = `currentUser.avatar || systemMap['sys.user.defaultAvatar']`; `title` = nickname → username → `sys.app.name` → `defaultSettings.title`; `render` wraps children in `<AvatarDropdown>`. |
| `footerRender()` | `null` on `/ai/*` pages, else `<Footer/>`. |
| `onPageChange()` | No `currentUser` and not on the login path → redirect to login with `redirect=`. |
| `childrenRender()` | Children + `<SettingDrawer disableUrlParams enableDarkTheme collapse={settingDrawerOpen}>`. `onSettingChange` **skips the first automatic invocation** (the drawer fires once on mount) and then saves optimistically: `setInitialState` → `updateTheme({themeId,…})` or `addTheme(payload)` (`buildThemePayload` converts booleans to `0|1`, `tokenJson` to JSON, passes `tenantId`) → `refreshGlobalSettings()`; on failure it rolls back via `refreshGlobalSettings()` (or `previousSettings`). |
| `ErrorBoundary`, `bgLayoutImgList: []`, `links: []`, `menuHeaderRender: undefined` | — |

### `rootContainer` — provider order (outer → inner)

```
<OfflineBanner/>            // fixed alert when navigator.onLine === false
  <ErrorBoundary>
    <TokenRefreshGuard>     // 60 s timer; refresh when the access token has ≤120 s left
      <GlobalRealtimeProvider>   // WebSocket /ws/realtime (see 00-common/09)
        {container}
```

## 5. Access control — `src/access.ts` (⚠ effectively dead)

`access(initialState)` returns `{canAdmin: currentUser && currentUser.access === 'admin'}`.
It is imported **only by its own test**; no route, page or component calls `useAccess`/`canAdmin`.
Real per-button gating is done by `hooks/usePermission.ts` (reading `currentUser.perms`), which is
a separate mechanism. If you add `access`-based routing, be aware the two systems are unrelated
and `currentUser.access` is not part of the backend profile payload.

## 6. Request pipeline — `src/requestErrorConfig.ts`

Registered as `request` in `app.tsx`. Full detail is in `00-common/04-auth-and-permissions.md` §6;
the mechanics an agent must not break:

- **Single request interceptor** `ensureFreshToken`: attach `Authorization`; attach
  `X-Timestamp` + `X-Nonce`; if the access token is expired (30 s buffer) and the URL is not in
  the skip list, refresh **first** and then attach the new token. Purpose: avoid the
  "first table loads empty because of a 401 race" problem.
- Skip list (`isRefreshSkippedUrl`): `/api/auth/login`, `/api/auth/refresh`, `/api/auth/register`,
  `/api/system/config/public-*`, `/api/system/tenant/public-*`.
- **`errorThrower`** converts `{success:false}` bodies into `Error{name:'BizError', info:{errorCode,errorMessage,showType,data}}`.
- **`errorHandler`** order: `skipErrorMessage`/`skipErrorHandler` → silent; HTTP 401 branch
  (login URL returns; skip list / `skipAuthRefresh` → redirect; `code 40101` → confirm modal;
  already retried → redirect; else refresh + retry **once** with regenerated replay headers);
  then `BizError` per `showType` (`SILENT|WARN_MESSAGE|ERROR_MESSAGE|NOTIFICATION|REDIRECT`);
  then generic response errors; then offline handling; then `None response!` / `Request error`.
- **Response interceptor**: `convertTinyIntToBoolean` rewrites `0/1` → `boolean` for a known
  field list (`visible, searchable, editable, copyable, ellipsis, required, enabled, isAdmin,
  isDefault, softDelete, deleted, fixedHeader, fixSiderbar, colorWeak, multiLogin, demoEnabled,
  success`). If you add a `tinyint(1)` flag column, add it here or the frontend keeps seeing
  `0/1`.
- Auth headers are also generated inline here, duplicating
  `services/security/replayInterceptor.ts` `buildReplayHeaders()` — keep the two in sync.

## 7. Global style / PWA / misc files

| File | Reality |
|---|---|
| `src/global.tsx` | `import './tailwind.css';` — active (umi auto-loads `global.*`). |
| `src/tailwind.css` | `@import "tailwindcss";` |
| `src/global.less` | Base resets + ant-layout / sider / responsive table rules — active. |
| `src/global.style.ts` | **Dead** — duplicate of `global.less`, never imported. |
| `src/loading.tsx` | `<Skeleton active/>` route loading fallback. |
| `src/service-worker.js`, `src/manifest.json` | **Dead PWA scaffold** — never registered or referenced. |
| `src/typings.d.ts` | `API` namespace used across services. |
| `src/test-setup.ts`, `src/access.test.ts` | Vitest setup + the only test of `access.ts`. |

## 8. i18n

- 8 languages, each with 7 namespace files plus an aggregator:
  `zh-CN, zh-TW, en-US, ja-JP, pt-BR, id-ID, fa-IR, bn-BD`.
- Namespaces: `component.ts`, `globalHeader.ts`, `menu.ts`, `network.ts`, `pages.ts`,
  `settingDrawer.ts`, `settings.ts` — merged in `src/locales/<lang>.ts`.
- Loaded by the umi `locale` plugin by convention; **nothing imports `@/locales` directly**.
- `LangDropdown` (`components/RightContent/index.tsx`) lists only the languages present in its
  local `localeLabelMap`, returns `null` when ≤1 is supported, and switches with
  `setLocale(key.replace('lang-',''), false)`. It is rendered from `actionsRender` only when
  `settings.locale !== false`.
- ⚠ **Backend menu names bypass i18n** (`locale:false` in `mapBackendMenus`), as do all route
  `name` values. Only component-internal strings are translated.

---

## 9. Known gaps

1. **17 unrouted pages** (Ant Design Pro scaffold leftovers) are still compiled/shipped:
   `account/center/**`, `exception/403`, `exception/500`, `form/{basic,advanced,step}-form`,
   `list/{basic-list,card-list,search/**}`, `profile/{basic,advanced}`, `result/{success,fail}`,
   plus the orphan `pages/system/log/upload.tsx`. Delete them (or route them) — note
   `components/TagSelect`, `StandardFormRow`, `ArticleListContent` are only used by them.
2. `config/routes.simple.ts` is stale and references non-existent pages.
3. `access.ts` / `canAdmin` is dead; two competing permission mechanisms exist.
4. `global.style.ts`, `service-worker.js`, `manifest.json` are dead.
5. Anti-replay header generation is duplicated (`requestErrorConfig.ts` vs
   `services/security/replayInterceptor.ts`).
6. `isRefreshSkippedUrl` still lists `/api/auth/register`, which the backend does not implement
   (see `pages/user-register.md`).
7. The build is `utoopack`, not `mfsu`/`esbuild` — older Umi guidance found online does not apply.

---

## 10. How to add a page (checklist)

1. Create `bls-admin/src/pages/<area>/<name>/index.tsx`.
2. Add the route to `config/routes.ts` (`path`, `name`, `component`).
3. Insert a `sys_menu` row (`menu_type='1'`, `path`, `component`, `perms`, `sort_num`) and any
   button rows (`menu_type='2'`) in `sql/Init.sql` + a migration, then grant them to roles
   `000001` / `100001` and the packages `P001` / `P100` (follow
   `bls-server/migrations/20260920_012_crud_completeness.sql`).
4. If it lists data, register `sys_page_config` + `sys_page_column_config` rows for the page code
   so `usePageConfig` has columns.
5. Gate actions with `usePermission().can('<code>')` and pass them via the `permissions` prop.
6. Write the page document in `bls-memory/pages/` (use the standard template) and add a
   `CHANGELOG.md` entry.
7. Verify: `cd bls-admin; npm run tsc; npm run test`.
