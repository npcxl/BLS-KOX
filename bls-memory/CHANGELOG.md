# Document Changelog — `bls-memory/`

All notable changes to the **bls-memory documents** (not to the application code) are recorded
here.

Format: [Keep a Changelog](https://keepachangelog.com/).
Versioning: [Semantic Versioning](https://semver.org/) applied to the **document set**.

Each document also carries its own metadata line:

```markdown
> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20
```

- `Document version` — SemVer of that single document.
- `Code version` — the repo-root `VERSION` the content was verified against.
- `Last verified` — date of the last check against the code.

Rules: see the "Version metadata & maintenance" section of [`README.md`](README.md).

> The application changelog lives in the repo root `CHANGELOG.md`.

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
- Frontend permission codes `system:theme:create` / `system:user:create` do not match the
  backend `:add` codes.
- Log endpoints (`/api/system/log/*`) apply no tenant filter.
- AI conversation endpoints have incomplete ownership checks.
- The `/api/ai/chat/conversations` replay exemption is exact-match only.
- `sys_tenant.expire_time` is stored but never enforced; `package_id` is not validated.
- Only the MinIO storage provider is a real implementation; the others are stubs.

### Conventions established

- Documents are written in **English** so AI agents parse them reliably.
- Redis is documented **once**, in `00-common/01-redis.md`; page documents only reference it.
- The backend permission code is the source of truth when the frontend disagrees.
