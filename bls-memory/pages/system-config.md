# Page — System Parameters (`/system/config`)

> **Document version:** 1.2.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the “登录人机验证” panel and the `sys.login.captcha.*` keys were verified
> against `61aaf9a` + uncommitted captcha changes.

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/config` (name 系统参数) |
| Component | `bls-admin/src/pages/system/config/index.tsx` (renders `CrudTablePage`) + `pages/system/config/components/CaptchaSettingPanel.tsx` |
| Purpose | Tenant-scoped `sys_config` key/value CRUD + one-click global-search index rebuild + the “登录人机验证” switch/advanced panel |
| Backend module | `bls-server/src/api/system/config/index.ts` (**mixed mode**) |
| Tables | `sys_config`, `sys_page_column_config` |
| Shared docs | `00-common/01-redis.md` (config cache), `03-rate-limiting.md`, `06-file-and-excel-security.md` |
| Captcha | [pages/login-captcha.md](login-captcha.md) |

This module uses **mixed mode**: `export default publicRouter` + `export const config` (so
`defineCrudModule` also runs). Because mixed mode returns early in the router scanner, the other
exported helper functions (`ConfigService`, `current`, `publicTheme`, `publicSystem`) are **not**
auto-registered — `current` / `public-*` are defined on the public router explicitly.

---

## 2. Frontend → API map

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List / search (fuzzy ⇄ exact toggle reloads) | `listResource` via `useCrudTable` | GET | `/api/system/config/list` |
| Create (新增) | `addResource` | POST | `/api/system/config/add` |
| Edit (编辑) | `editResource` | PUT | `/api/system/config/edit` |
| Delete | **disabled** (`resource.remove:false`) | — | — |
| Status toggle | **disabled** (`resource.status:false`) | — | — |
| Excel template / export / import | `ExcelToolbar` (`metaKey="system-config"`) | GET / POST / POST | `/api/common/excel/template` · `/export` · `/import` |
| Rebuild index modal → list modules | inline `request` | GET | `/api/system/global-search/index/modules` |
| Rebuild index → start | inline `request` | POST | `/api/system/global-search/index/rebuild` |
| Refresh layout settings after certain saves | `refreshGlobalSettings()` → `themeCurrent()` + `systemCurrent()` | GET | `/api/system/theme/current` + `/api/system/config/current` |
| Page columns | `usePageConfig('system_config')` | GET | `/api/system/page-config/page/system_config/columns` |
| Dicts | `useMultiDict(['sys_status','sys_config_type'])` | GET | `/api/system/dict/data/type?dictType=...` |
| **登录人机验证 panel** — load the 6 `sys.login.captcha.*` rows | `CaptchaSettingPanel` → `listResource` | GET | `/api/system/config/list?pageNum=1&pageSize=100` (filtered client-side) |
| panel — toggle 开启/关闭 | `editResource` / `addResource` (`sys.login.captcha.enabled`) | PUT / POST | `/api/system/config/edit` · `/add` |
| panel — save 高级配置 | `editResource` / `addResource` ×5 keys | PUT / POST | `/api/system/config/edit` · `/add` |

`CaptchaSettingPanel` (mounted above the table, gated by `system:config:edit` **or**
`system:config:add` via `usePermission`) reads the same `sys_config` rows and writes them back with
the same endpoints, so the table and the panel stay consistent. Rows are created on demand
(`add`) when a tenant has never customised them. Every save triggers the CRUD `onWrite` hook →
`invalidateConfigCache(tid)`, so the new values take effect immediately.

`handleSaved` refreshes global settings when the saved `configKey` is one of:
`theme.default`, `sys.app.name`, `sys.demo.enabled`, `sys.upload.maxSize`, `sys.version`,
`sys.user.defaultPassword`; for any `sys.login.captcha.*` key it only shows
“登录人机验证配置已更新，立即生效” (the login page re-reads the public captcha config on every visit).

---

## 3. Backend endpoints

### CRUD factory part (`defineCrudModule`)

| Config | Value |
|---|---|
| `table` / `pkField` | `sys_config` / `config_id` |
| `searchFields` | `config_key`, `config_name` |
| `filterFields` | `config_key`, `config_type`, `status` |
| `createFields` | `config_key`, `config_value`, `config_name`, `config_type`, `status`, `remark` |
| `updateFields` | `config_value`, `config_name`, `config_type`, `status`, `remark` (**`config_key` is create-only**) |
| `permPrefix` | `system:config` → `system:config:list/add/edit/remove/status` |
| `onWrite` | `getTenantOrFail()` then `invalidateConfigCache(tenantId)` |
| `schema` | **none** — no field type validation |
| defaults | softDelete true, statusField `status`, dataScope off, transactional false |

Generated endpoints: `GET /list`, `GET /:id`, `POST /add`, `PUT /edit`, `DELETE /remove`,
`PUT /status`.

This module still uses the **legacy array style**. It can be migrated to the config style
(`defineCrudConfig` + `fields`, see `00-common/00-architecture.md` §5) without changing any
endpoint: every `createFields`/`updateFields` entry becomes `{ type, create/update: true }` and the
whitelists are then derived from `fields`. Two behaviour differences to remember when migrating:
the response would be projected to the declared `select !== false` fields (plus the PK), and a
config with **no** writable field fails at **startup** — a read-only module must declare
`actions: { add: false, edit: false, remove: false, status: false }`.

### Public (unauthenticated) endpoints

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/system/config/public-system` | Returns the public system config subset |
| GET | `/api/system/config/public-theme` | Returns the `theme.default` row, falling back to tenant `000000` |
| GET | `/api/system/config/current` | Returns system configs (⚠ mounted on the **public** router despite its name) |

`fetchSystemConfigs` returns the keys: `sys.app.name`, `sys.demo.enabled`, `sys.upload.maxSize`,
`sys.version`, `sys.app.logo`, `sys.user.defaultAvatar`, `sys.user.defaultPassword`.

### Non-existent endpoints (do not assume)

- `config/refresh-cache` — **does not exist**; cache invalidation is implicit via `onWrite`.
- `config/public` — the real paths are `public-system` / `public-theme`.

### Caching

`bls-server/src/config/dynamic-config.ts` caches raw `sys_config` rows in Redis at
`config:{tenantId}` for **60 s**, with a strict typed view. Any config write deletes the key. If
Redis is unavailable the cache falls back to the DB. See `00-common/01-redis.md` §3.6.

Managed keys (`MANAGED_CONFIG_KEYS`) and their validation:

| Key | Type | Validation | Typed field |
|---|---|---|---|
| `sys.login.multiDevice` | bool | `1/true/0/false` | `multiLogin` |
| `sys.upload.maxSize` | number | 1–500 | `uploadLimitMB` |
| `sys.demo.enabled` | bool | `1/true/0/false` | `demoEnabled` |
| `sys.app.name` | string | — | `appName` |
| `sys.login.captcha.enabled` | bool | `1/true/0/false` | `captchaEnabled` |
| `sys.login.captcha.mode` | **enum** | `off` \| `adaptive` \| `always` | `captchaMode` |
| `sys.login.captcha.provider` | **enum** | `altcha` \| `tianai` | `captchaProvider` |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `captchaChallengeTtlSeconds` |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `captchaTokenTtlSeconds` |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `captchaForceAfterFailures` |

An invalid value (wrong type / out of range / unknown enum member / a CSV list that loses every
item) is **replaced by the declared default** and logged as
`[dynamic-config] invalid … , using default`; it is never silently coerced. Numbers must match
`^-?\d+(\.\d+)?$` (so `12abc` is rejected). `toPublicCaptchaConfig()` projects only
`{enabled, mode, secondaryTypes}` for the public endpoint.

Seed rows for the 6 captcha keys (tenant `000000`): `sql/Init.sql` (`000406`–`000411`) for fresh
installs **and** `bls-server/migrations/20260922_017_login_captcha.sql` for already deployed
databases (both generated from the same source, identical content, no DDL).
Obsolete rows from the earlier design (`silentThreshold` / `secondaryTypes` / `maxAttempts`) are
ignored by Dynamic Config and can be deleted.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `/current`, `/public-system`, `/public-theme` | off | read 600/60 | `system:config:list` for `/list`; the public ones need **no auth** |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:config:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:config:edit` |
| `DELETE /remove` (exists in backend, disabled in UI) | default write nonce | write 300/60 | `system:config:remove` |
| `PUT /status` (exists in backend, disabled in UI) | default write nonce | write 300/60 | `system:config:status` |
| `POST /api/common/excel/export` | default write nonce | user 5/60 + tenant 200/3600 | `jwtAuth` only |
| `POST /api/system/global-search/index/rebuild` | default write nonce | write 300/60 | see global-search module |

Tenant isolation: `sys_config` carries `tenant_id`; writes use `systemTenantId()` which fails
closed via `requireTenantId()`. Public reads fall back to `000000`.

---

## 5. Frontend-only validation

- `configName`, `configKey`, `configValue` required.
- `configType` default `'sys'`; `status` default `'0'`.
- `CaptchaSettingPanel`: numeric ranges mirror the backend schema (force 1-100, challenge TTL 30-900,
  token TTL 30-600); provider choices are `altcha` (default) and `tianai`. The ALTCHA HMAC key, the
  PoW cost and the Tianai base URL come from environment variables and are **not** editable here.

## 6. Backend-only rules

- Field whitelist filtering only.
- **No enum validation** of `config_type` (any string is accepted).
- **No uniqueness check** on `config_key` — duplicates are possible.
- No length caps on `config_value`.
- `config_key` cannot be edited after creation.
- Values consumed through Dynamic Config **are** type/range/enum validated at read time (see the
  table in §3) — that validation is the last line of defence if a bad value is written anyway.

---

## 7. Known gaps / discrepancies

1. `config_key` has no uniqueness constraint enforced in code — a duplicate key makes the
   dynamic-config cache and `sys.user.defaultPassword` lookups ambiguous. Consider a
   `uk_config_tenant_key` unique index.
2. `config_value` for JSON-ish keys (e.g. `theme.default`) is a plain textarea; there is no
   JSON validation on either side.
3. `GET /api/system/config/current` is **unauthenticated** though it looks like an authenticated
   endpoint. Do not put secrets there.
4. `public-system` exposes `sys.user.defaultPassword` in its key list — check whether that value
   is actually returned publicly; if so it is a security issue.

---

## 8. How to extend

- **Add a dynamic config key**: add it to `SCHEMA` + `KEY_MAP` in
  `bls-server/src/config/dynamic-config.ts` (with type, default, min/max), seed a row in
  `sys_config`, and read it through `getDynamicConfig(tenantId)`.
- **Add validation for a config value**: two options — keep the array style and add
  `schema: { create, update }` (remember to keep `createFields`/`updateFields` aligned), or migrate
  the module to the config style and declare the field type
  (`config_value: { type: 'json', create: true, update: true }`), which generates the Zod schema
  from `fields` automatically (`00-common/00-architecture.md` §5).
- **Expose a new public setting**: add a small handler on `publicRouter` (name it
  `public<Something>` to keep future auto-registration public).
- Update this document and the Redis key table if you add a cache.
