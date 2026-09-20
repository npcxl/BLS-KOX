# BLS-KOX Page Memory

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

This folder is the **page-by-page operating memory** of the BLS-KOX SaaS platform.

It is written **for an AI coding agent (and for humans who are new to the project)**.
Each document describes one admin page end-to-end:

```
Frontend user action  ->  frontend service function  ->  HTTP endpoint
                      ->  backend module / handler  ->  validation + DB tables
                      ->  permission code, tenant isolation, replay + rate-limit rules
```

If you are asked to *change, fix, extend or re-implement* a page, read the matching
page document first, then follow the shared documents in `00-common/` for cross-cutting rules.

---

## How an AI agent should use this memory

1. Find the page you are working on in the index table below and read its file.
2. Read the page document top-to-bottom. It contains the exact endpoint paths, permission
   codes, Zod schemas, table names, and frontend service functions.
3. If your change touches authentication, permissions, tenancy, rate limiting, replay
   protection, Redis, file upload or Excel import/export, also read the matching
   `00-common/*.md` document.
4. **When you change behaviour, update the matching memory document in the same commit.**
   This memory is only useful if it stays true.
5. Verify with the commands listed in `00-common/00-architecture.md` ("Verify after change").
6. Refresh the document's version metadata (see "Version metadata & maintenance") and add a
   line to [`CHANGELOG.md`](CHANGELOG.md).

> The documents are written in English on purpose: it is the most reliably recognised
> language for AI agents and avoids encoding issues with the original Chinese source.

---

## Version metadata & maintenance

Every document starts with a machine-readable metadata line right under its H1
(`x.y.z` = document version, `V` = the repo-root `VERSION` value, `SHA` = the git commit the
content was verified against, `DATE` = `YYYY-MM-DD`):

```markdown
> **Document version:** <x.y.z> · **Code version:** <V> · **Verified commit:** <SHA> · **Last verified:** <DATE>
```

| Field | Meaning | When to change |
|---|---|---|
| `Document version` | SemVer version of **this document** | Bump on a substantive rewrite (new/removed sections, re-verified facts, restructure). `patch` = correction, `minor` = new content, `major` = restructure. |
| `Code version` | The repo-root `VERSION` value the content was verified against | Update in **every** document when the project is released (`npm run release:patch\|minor\|major` bumps `VERSION`). |
| `Verified commit` | The git commit (`git rev-parse --short HEAD`) whose code the content was checked against | Update in **every** document after re-verifying against a new commit. Needed because `VERSION` only changes on release — the commit is what actually identifies the verified code. |
| `Last verified` | `YYYY-MM-DD` of the last time the content was checked against the actual code | Set to the current date whenever you touch the document. |

Rules:

1. **Metadata is part of the document.** A document whose `Code version` is behind the current
   repo `VERSION`, or whose `Verified commit` is not reachable from the current `HEAD`, must be
   treated as *unverified* — re-check it against the code before relying on it.
2. Every document-level change gets an entry in [`CHANGELOG.md`](CHANGELOG.md)
   (Keep a Changelog style, same convention as the project `CHANGELOG.md`).
3. These files are tracked by git — `git log -- bls-memory/` is the authoritative history; the
   metadata line is the fast, per-file signal.

### Re-verifying after new commits

```bash
# 1. which documents are behind?
rg "Verified commit:\*\* <old-sha>" bls-memory

# 2. what changed since they were verified?
git diff --stat <old-sha> HEAD -- bls-admin bls-server bls-java-server sql

# 3. re-check only the affected documents, fix them, then update the metadata line of
#    every re-verified document and add a CHANGELOG entry.
```

---

## Repository layout (where things live)

| Module | Stack | Dev port | Purpose |
|---|---|---|---|
| `bls-admin/` | React 19 + Ant Design Pro 6 + UmiJS Max | 9000 | The admin frontend. Source of every page in this memory. |
| `bls-server/` | Koa 3 + TypeScript + Kysely + Zod | 6001 (Docker 7001) | Default/main backend. |
| `bls-java-server/` | Spring Boot 3.3.5 + Java 21 + MyBatis-Plus | 8080 | Compatible alternative backend. |
| `bls-ai-service/` | Node + TS | Docker 7201 | AI microservice (SSE streaming, OCR, model calls). |
| `bls-event-service/` | Node + TS | Docker 7101 | Optional event/audit microservice. |
| `bls-rust-server/` | Rust Axum | — | Experimental backend. |
| `sql/Init.sql` | MySQL 8.0 DDL + seed data | — | Shared by both backends. |

Pages talk to `/api/*`. Nginx (or `bls-admin/config/proxy.ts` in dev) decides whether
`/api/*` goes to the Koa server or the Java server. The API contract is identical.

---

## Index of page memories

### Authentication / entry pages

| Page | Route | Memory file |
|---|---|---|
| Login | `/user/login` | [pages/user-login.md](pages/user-login.md) |
| Register + result | `/user/register`, `/user/register-result` | [pages/user-register.md](pages/user-register.md) |

### Dashboard & personal

| Page | Route | Memory file |
|---|---|---|
| Dashboard | `/dashboard` | [pages/dashboard.md](pages/dashboard.md) |
| Personal settings | `/account/settings` | [pages/account-settings.md](pages/account-settings.md) |

### System management (`/system/*`)

| Page | Route | Memory file |
|---|---|---|
| Departments | `/system/dept` | [pages/system-dept.md](pages/system-dept.md) |
| Users | `/system/user` | [pages/system-user.md](pages/system-user.md) |
| Roles | `/system/role` | [pages/system-role.md](pages/system-role.md) |
| Menus | `/system/menu` | [pages/system-menu.md](pages/system-menu.md) |
| System parameters | `/system/config` | [pages/system-config.md](pages/system-config.md) |
| Dictionaries | `/system/dict` | [pages/system-dict.md](pages/system-dict.md) |
| Theme | `/system/theme` | [pages/system-theme.md](pages/system-theme.md) |
| Page config | `/system/page-config` | [pages/system-page-config.md](pages/system-page-config.md) |
| Log center – operation + upload audit | `/system/log/audit` | [pages/system-log-audit.md](pages/system-log-audit.md) |
| Log center – security log | `/system/log/security` | [pages/system-log-security.md](pages/system-log-security.md) |
| Log center – login log | `/system/log/login` | [pages/system-log-login.md](pages/system-log-login.md) |
| Log center – SQL audit | `/system/log/sql-audit` | [pages/system-log-sql-audit.md](pages/system-log-sql-audit.md) |
| Security center | `/system/security` | [pages/system-security-center.md](pages/system-security-center.md) |
| Webhook | `/system/webhook` | [pages/system-webhook.md](pages/system-webhook.md) |

### File center (`/file-config/*`)

| Page | Route | Memory file |
|---|---|---|
| Storage config | `/file-config/storage` | [pages/file-config-storage.md](pages/file-config-storage.md) |
| File manager | `/file-config/files` | [pages/file-config-files.md](pages/file-config-files.md) |

### Tenant management (`/tenant/*`)

| Page | Route | Memory file |
|---|---|---|
| Tenant list | `/tenant/list` | [pages/tenant-list.md](pages/tenant-list.md) |
| Tenant package | `/tenant/package` | [pages/tenant-package.md](pages/tenant-package.md) |

### AI (`/ai/*`)

| Page | Route | Memory file |
|---|---|---|
| KOX-AI workbench | `/ai/workbench` | [pages/ai-workbench.md](pages/ai-workbench.md) |
| AI model config | `/ai/models` | [pages/ai-model.md](pages/ai-model.md) |
| AI usage center | `/ai/usage` | [pages/ai-usage.md](pages/ai-usage.md) |

### Operations (`/ops/*`)

| Page | Route | Memory file |
|---|---|---|
| Release center | `/ops/release` | [pages/ops-release.md](pages/ops-release.md) |

---

## Shared (cross-cutting) memories

| Document | Content |
|---|---|
| [00-common/00-architecture.md](00-common/00-architecture.md) | Repos, request pipeline, response format, router auto-scan, CRUD factory, naming rules, verify commands |
| [00-common/01-redis.md](00-common/01-redis.md) | **All Redis usage** — connection, key prefix, every key namespace (session, replay, idempotency, rate limit, IP block, config cache, release lock, upload lock) |
| [00-common/02-replay-protection.md](00-common/02-replay-protection.md) | Replay protection (timestamp + nonce + signature + idempotency) and the full rule table |
| [00-common/03-rate-limiting.md](00-common/03-rate-limiting.md) | Rate limiting dimensions, algorithm and the full rule table |
| [00-common/04-auth-and-permissions.md](00-common/04-auth-and-permissions.md) | JWT, refresh rotation, session center, `jwtAuth`/`hasPerm`, tenant isolation, data scope |
| [00-common/05-security-log-and-event-center.md](00-common/05-security-log-and-event-center.md) | Security event types, risk levels, risk rules, automatic actions, IP blacklist |
| [00-common/06-file-and-excel-security.md](00-common/06-file-and-excel-security.md) | Upload validation (ext/mime/magic/size), path safety, Excel import/export endpoints |

---

## Page document template

Every page document uses the same sections so an agent can parse them mechanically:

1. **Summary** — route, component file, menu permission, backend module files.
2. **Frontend → API map** — table of user action / service function / method / endpoint.
3. **Backend endpoints** — permission, handler, validation, behaviour, tables.
4. **Security rules for this page** — replay rule + rate limit rule (pointing at the shared docs).
5. **Frontend-only validation** — checks that exist only in the browser.
6. **Known gaps / discrepancies** — known mismatches and unfinished features.
7. **How to extend** — the concrete steps to add a field / endpoint / permission.
