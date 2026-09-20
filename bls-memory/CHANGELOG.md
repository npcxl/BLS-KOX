# Document Changelog — `bls-memory/`

All notable changes to the **bls-memory documents** (not to the application code) are recorded
here.

Format: [Keep a Changelog](https://keepachangelog.com/).
Versioning: [Semantic Versioning](https://semver.org/) applied to the **document set**.

Each document also carries its own metadata line:

```markdown
> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20
```

- `Document version` — SemVer of that single document.
- `Code version` — the repo-root `VERSION` the content was verified against.
- `Verified commit` — the git commit whose code the content was checked against.
- `Last verified` — date of the last check against the code.

Rules: see the "Version metadata & maintenance" section of [`README.md`](README.md).

> The application changelog lives in the repo root `CHANGELOG.md`.

---

## [1.0.1] — 2026-09-20

Aligned the whole document set with the code as committed on 2026-09-20
(`HEAD = 0fc7c43`, `VERSION = 1.0.0`).

Scope of the review: the two commits of that day
(`fd1b4aa` — *fix(权限): 统一权限校验与租户隔离*, `0fc7c43` — document metadata). The changed
code surface was: `bls-server/src/core/{crud,router,errors}.ts`,
`bls-server/src/middleware/permission.ts`, `bls-server/src/api/auth/index.ts`,
`bls-server/src/api/common/excel/index.ts`, the system modules
(`ai-model, config, dept, dict, menu, package, page-config, role, storage, tenant, theme, user`),
`sql/Init.sql` + `bls-server/migrations/20260920_012_crud_completeness.sql`,
`bls-admin/src/hooks/usePermission.ts` and four admin pages, plus the Java backend and
`bls-server/openapi.json`.

### Added

- **`Verified commit`** field in the metadata line of all 34 documents, and a matching row /
  "Re-verifying after new commits" procedure in `README.md`.
- Java-side note kept in sync with the same permission codes as Koa (no document change needed).

### Fixed

- `pages/ai-model.md` — the `system:ai-model:list/add/edit/remove/status` button permissions are
  now seeded in `sql/Init.sql` (`ai_model_*_0001`, children of menu `ai_model_0001`); the previous
  note that only `ai:models:view` existed was removed.
- `pages/file-config-storage.md` — the page's `permissions` prop is
  `{import, export, create, edit, remove}`; the `status` key was removed when the status toggle was
  disabled. Also clarified that none of these keys is enforced (no Excel toolbar is rendered).
- `pages/system-webhook.md` — verified that `sys_page_config` row **id** `PC_WEBHOOK` carries
  `page_code = system:webhook:list`, which matches `usePageConfig`; the previous "verify it
  matches" caveat was replaced with the confirmed fact.

### Verified (no change required)

- Permission codes for every documented endpoint, cross-checked against `hasPerm(...)` in
  `bls-server/src/api/**` and `releasePermission(...)` in `ops-release/release-permission.ts`.
- `bls-admin` `permissions` props on user / theme / tenant / package / config / role / ai-model /
  storage / files / log-login pages.
- Replay rule table (`config/replay-protection.ts`) and rate-limit rule table
  (`security/rate-limit/rules.ts`) — both files were untouched by the day's commits.
- `core/crud.ts` semantics documented in `00-common/00-architecture.md`
  (`SYSTEM_FIELDS`, `permit()` → `${permPrefix}:${action}`, `softDelete ?? true`,
  `statusField ?? 'status'`, `globalTable`), `middleware/permission.ts` dual-field permission
  compatibility, `AuthService.profile()` returning both `perms` and `permissions`,
  `usePermission()` reading `perms ?? permissions` with the `isAdmin === '1'` short-circuit.
- Excel module `hasDeleted` / `tenantAware` behaviour in `00-common/06-file-and-excel-security.md`.
- `core/router.ts` auto-registration modes, `GET /:id` + 0-rows → 404, and the
  `filterFields`/`createFields`/`updateFields` whitelists on `system/config` and `system/theme`.
- `CrudTablePage` still computes `canImport`/`canExport` but renders
  `ExcelToolbar` only when `excelMetaKey` is set (so the declared import/export permissions remain
  unenforced — still listed as a known gap).
- Confirmed still-missing seed data: dictionary types `sys_storage_type` and
  `sys_bucket_access_type` are referenced by page column configs but not seeded.

---

## [1.0.0] — 2026-09-20

Document set created. Code version verified against: **1.0.0**.

### Added

- `README.md` — purpose, AI-agent usage steps, page index, shared-document index, per-page
  document template, and the version metadata convention.
- `00-common/00-architecture.md` — modules and ports, Koa middleware order, response envelope
  and security error codes, router auto-scan modes, generic CRUD factory, hard project rules,
  verification commands.
- `00-common/01-redis.md` — the single Redis reference: connection config and key prefix,
  full key-namespace table (auth sessions, Session Center, replay nonces, idempotency, rate
  limiting, IP blocking, dynamic config cache, release lock, upload lock), subsystem details,
  and developer rules.
- `00-common/02-replay-protection.md` — modes, check order, signature canonical payload, the
  complete 13-rule table, error-code → event-type mapping, idempotency state machine, frontend
  header behaviour.
- `00-common/03-rate-limiting.md` — dimensions, Lua counter algorithm, the complete 7-rule
  table, per-page cheat sheet, event-center relationship, how to add a rule.
- `00-common/04-auth-and-permissions.md` — auth endpoints, login domain resolution, tokens and
  sessions, refresh rotation and reuse detection, `jwtAuth`/`hasPerm`, permission code
  convention, tenant isolation and data scope, password hashing, frontend token strategy.
- `00-common/05-security-log-and-event-center.md` — security event types, risk levels and
  default mapping, the 6 risk rules, automatic actions, IP-block middleware, log tables,
  known `sys_security_log` schema mismatch.
- `00-common/06-file-and-excel-security.md` — upload validation pipeline (extension, MIME,
  magic number, size, module name, object key), storage provider implementation status, secret
  masking, Excel import/export endpoints and rules.
- 26 page documents under `pages/`, one per admin route:
  `user-login`, `user-register`, `dashboard`, `account-settings`,
  `system-dept`, `system-user`, `system-role`, `system-menu`,
  `system-config`, `system-dict`, `system-theme`, `system-page-config`,
  `system-log-audit`, `system-log-security`, `system-log-login`, `system-log-sql-audit`,
  `system-security-center`, `system-webhook`,
  `file-config-storage`, `file-config-files`,
  `tenant-list`, `tenant-package`,
  `ai-workbench`, `ai-model`, `ai-usage`,
  `ops-release`.
  Each covers: summary, frontend → API map, backend endpoints with validation, security rules
  (replay + rate limit + permissions + tenant isolation), frontend-only validation,
  known gaps, and extension steps.

### Known issues documented (not fixed in code)

- `sys_security_log` schema does not match `writeSecurityLog()` (missing `log_id` / `source`).
- The login flow never writes `sys_login_log`.
- `POST /api/system/user/reset-password` has a replay rule but no route.
- `GET /api/system/storage/file/:fileId/download` returns a DB row instead of the file.
- Log endpoints (`/api/system/log/*`) apply no tenant filter.
- AI conversation endpoints have incomplete ownership checks.
- The `/api/ai/chat/conversations` replay exemption is exact-match only.
- `sys_tenant.expire_time` is stored but never enforced; `package_id` is not validated.
- Only the MinIO storage provider is a real implementation; the others are stubs.

### Conventions established

- Documents are written in **English** so AI agents parse them reliably.
- Redis is documented **once**, in `00-common/01-redis.md`; page documents only reference it.
- The backend permission code is the source of truth when the frontend disagrees.

### Corrections made while verifying against the code

- `system:theme` and `system:user`: the frontend `permissions` prop now uses `:add` (matching the
  backend), so the previously noted `:create` ↔ `:add` mismatch was dropped.
- `system:user`: the batch "kick offline" action is gated by `system:user:kick` (documented).
- `system:ai-model`: the frontend `permissions` prop holds permission strings
  (`system:ai-model:add/edit/remove/status`) — documented as such.
