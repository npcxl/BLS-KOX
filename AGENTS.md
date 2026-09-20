# BLS-KOX — Agent Rules

## 1. Page memory — read this first

The end-to-end memory for every admin page ("frontend action → backend validation") lives in
`bls-memory/`:

- **Index & usage guide**: `bls-memory/README.md` — page index, document template, version-metadata
  rules, and how an agent should use the set.
- **Page documents**: `bls-memory/pages/<page>.md` — one file per page, containing:
  frontend action → frontend service function → HTTP endpoint → backend handler & validation →
  permission code → tenant isolation → the replay / rate-limit rules that apply → frontend-only
  validation → known gaps → extension steps.
- **Shared documents**: `bls-memory/00-common/*.md`.

**Workflow**: locate the page in `bls-memory/README.md` → read its page document → if the change
touches a shared mechanism, read the matching `00-common/*` document as well.

| Shared document | Content |
|---|---|
| `00-architecture.md` | Modules/ports, Koa middleware order, response envelope & error codes, router auto-scan, CRUD factory, naming hard rules, verify commands |
| `01-redis.md` | **The only Redis document**: connection, key prefix, every key namespace + TTL, each subsystem |
| `02-replay-protection.md` | Replay protection (timestamp / nonce / signature / idempotency): modes, check order, full rule table |
| `03-rate-limiting.md` | Rate limiting: dimensions, Lua algorithm, full rule table, per-page cheat sheet |
| `04-auth-and-permissions.md` | JWT, refresh rotation & reuse detection, Session Center, `jwtAuth`/`hasPerm`, tenant isolation, data scope, passwords |
| `05-security-log-and-event-center.md` | Security event types, risk levels, risk rules, automatic actions, IP blocking |
| `06-file-and-excel-security.md` | Upload validation pipeline, storage providers, Excel import/export |
| `07-database.md` | **Database entry point**: all 40 tables (with the owning page document), conventions & exceptions, seed data, migration workflow, known drift |
| `08-external-api-and-service-auth.md` | `/api`, `/api/v1`, `/openapi/v1` (API Key + HMAC), `/internal` (service token + IP allow-list), error format, Swagger |
| `09-realtime-websocket.md` | `/ws/realtime` protocol, broadcast payload, nginx upgrade blocks, frontend `useWebSocket` / `GlobalRealtimeProvider` |
| `10-job-api-and-queue.md` | Job API (`/api/system/jobs`) and the `sys_jobs` queue semantics, worker, job types |
| `11-frontend-shell.md` | Build config (utoopack), dev proxy, routes, `app.tsx` runtime, access control, request pipeline, i18n |
| `12-frontend-data-layer.md` | Every hook, `CrudTablePage`, shared components, the full `services/*` surface, cookbooks |

### After changing code — mandatory sync

1. Update the affected `bls-memory/pages/*.md` (and/or `00-common/*.md`).
2. Refresh the metadata line under that document's H1:

   ```markdown
   > **Document version:** x.y.z · **Code version:** <repo-root VERSION> · **Verified commit:** <short sha> · **Last verified:** <YYYY-MM-DD>
   ```

   `Verified commit` records the commit whose **application code** the content was checked
   against. A commit that only touches `bls-memory/`, `docs/` or `.codebuddy/` does **not**
   invalidate verification, and documents you did not re-read must not be re-stamped.
3. Add an entry to `bls-memory/CHANGELOG.md` (Keep a Changelog style).
4. A new Redis key must be added to the namespace table in `01-redis.md`.
   A new table or column must be added to `07-database.md` **and** to `sql/Init.sql` **and** as a
   new file in `bls-server/migrations/`.

## 2. Project skill

Read and follow the project skill before any repository operation:

`.codex/skills/bls-kox/SKILL.md`

## 3. Database schema

**Prefer `bls-memory/00-common/07-database.md`** — it was checked table by table against the 40
`CREATE TABLE` statements in `sql/Init.sql` (PK, multi-tenant flag, soft-delete flag, owning page
document, migration workflow, known drift).

`.codex/skills/bls-kox/references/database-schema.md` is **STALE — historical reference only**: it
covers just 18 of the 40 tables, and two of them are named wrongly — `## sys_job` (the real table
is `sys_jobs`) and `## sys_file_config` (the real table is `sys_storage_config`).

For the exact DDL of a table, read the source file:

```bash
rg -n "CREATE TABLE \`sys_user\`" -A 30 sql/Init.sql
```

## 4. Other documentation

Entry point for the long-form project documentation: `docs/index.md`.
Directory layout, commands and constraints are governed by the skill file and `bls-memory/`.
