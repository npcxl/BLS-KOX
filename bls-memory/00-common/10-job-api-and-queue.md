# 10 — Job API & Queue (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

The backend has one asynchronous job system: a MySQL-backed queue (`sys_jobs`) polled by an
in-process worker. This document covers the **public Job API**, the queue mechanics an API
consumer must understand, and the four registered job types.

Files: `bls-server/src/api/system/job/index.ts`, `bls-server/src/queue/{queue,worker,job-types}.ts`,
`bls-server/src/queue/jobs/*.job.ts`, `bls-server/src/app.ts`.
Table: `sys_jobs` (see `00-common/07-database.md`).

---

## 1. Job API endpoints

Module prefix is **`/system/jobs`** (plural) — the full paths are `/api/system/jobs…`.

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/api/system/jobs` | `system:job:create` | `{jobType, jobData}` | `{code:200, data:{jobId, status}}` |
| GET | `/api/system/jobs/:jobId` | `system:job:read` | — | `{code:200, data:job}` / `404 {code:404, message:'任务不存在'}` |
| GET | `/api/system/jobs` | `system:job:read` | query `status?` | `{code:200, data:jobs[]}` — **limit hard-coded to 50**, no pagination |

Validation in POST:

- missing `jobType` or `jobData` → `400 {code:400, message:'缺少 jobType 或 jobData'}`;
- `jobType` not in `ALLOWED_JOB_TYPES` → `400 {code:400, message:'不允许的 Job 类型: <type>'}`;
- `ALLOWED_JOB_TYPES = new Set(['export','import','notification','webhook'])`.
- `jobData` is passed through with **no schema validation** beyond presence — validate inside the
  handler.

Tenant scope: POST uses `requireTenantId()` (fail-closed → `缺少租户上下文，禁止写操作`); GETs use
`getCurrentTenantId() ?? '000000'`. Enqueue body:
`{tenantId: tid, userId: ctx.state.user?.userId, jobType, jobData}`.

⚠ **Nothing in `bls-admin` calls these endpoints** — the Job API is currently only used
internally (e.g. `POST /api/system/webhooks/:id/retry` calls `enqueue()` directly). The
permission codes `system:job:create` / `system:job:read` are also **not seeded** in `sql/Init.sql`,
so a non-platform tenant would get 403 until they are granted.

---

## 2. Queue mechanics (`queue/queue.ts`)

`TABLE = 'sys_jobs'`, `STALE_TIMEOUT = 300_000` (5 min).

| Function | Behaviour |
|---|---|
| `enqueue({tenantId, userId?, jobType, jobData, maxAttempts?})` | Snowflake `jobId`; insert `status:'queued', attempt:0, max_attempts:3 (default), next_retry_at:now`; returns the mapped `JobRecord`; logs `[queue] enqueued` |
| `dequeue()` | `recoverStale()` first, then in a transaction: `SELECT … WHERE status='queued' AND next_retry_at <= now ORDER BY next_retry_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`; then `UPDATE status='processing', attempt = attempt + 1` |
| `completeJob(jobId, result)` | `status='completed'`, `result = JSON.stringify(result)`; increments `jobQueueCompletedTotal` |
| `failJob(jobId, record, error)` | `attempt = record.attempt + 1`; if `attempt >= maxAttempts` → `status='dead'` + `error_message` and increments `jobQueueFailedTotal`; else back to `status='queued'` with `next_retry_at = now + 2^(attempt-1) * 1000` ms |
| `getJob(tenantId, jobId)` | tenant scoped |
| `listJobs(tenantId, {status?, limit?})` | `ORDER BY created_at DESC` |
| `recoverStale(db)` | rows stuck in `processing` for more than 5 min → back to `queued` with `error_message='Recovered from stale processing'` |

Key properties: **claim safety** via `FOR UPDATE SKIP LOCKED` (many workers/replicas are safe);
**retry** with exponential backoff (1 s, 2 s, 4 s, … capped by `maxAttempts`);
**dead letter** = `status='dead'`.

`JobStatus = 'queued' | 'processing' | 'completed' | 'dead' | 'cancelled'`
(`JobRecord` also carries `jobId, tenantId, userId, jobType, jobData, attempt, maxAttempts,
nextRetryAt, errorMessage, result, createdAt, updatedAt`).

### ⚠ Status enum drift

| Source | Enum |
|---|---|
| `sql/Init.sql` `sys_jobs` | `enum('queued','processing','completed','failed','cancelled')` — has `failed`, **no `dead`** |
| `bls-server/migrations/20260710_001_jobs.sql` | `enum('queued','processing','completed','dead','cancelled')` — has `dead`, **no `failed`** |
| `queue.ts` / `JobStatus` | writes `'dead'` on permanent failure |

On a **fresh install from `Init.sql`** the `dead` write is rejected (or silently truncated,
depending on `sql_mode`), so permanently failed jobs may stay in `processing`. Fix by aligning
both DDLs on `enum('queued','processing','completed','dead','cancelled')`.

---

## 3. Worker (`queue/worker.ts`)

| Constant | Value |
|---|---|
| `POLL_INTERVAL` | `2000` ms |
| `DEFAULT_TIMEOUT` | `60_000` ms (per job, overridable per handler) |
| `DRAIN_TIMEOUT` | `30_000` ms (graceful stop) |

- `worker.register(definition)` stores handlers in a `Map<string, JobDefinition>`; there is **no
  central registry** — jobs are registered imperatively in `app.ts`:
  `worker.register(exportJob).register(importJob).register(notificationJob).register(webhookJob).start()`.
- `poll()` dequeues **one job per iteration**, spawns it without awaiting (`inflight` set), then
  waits `POLL_INTERVAL`. Concurrency is therefore unbounded by design — it is limited only by the
  DB claim rate, not by a worker pool size.
- `processJob`: unknown `jobType` → `failJob(..., 'No handler for: <type>')`; otherwise
  `withTimeout(handler(jobData), definition.timeout ?? DEFAULT_TIMEOUT)`; success →
  `completeJob`; throw → `failJob(..., err.message)`.
- `stop()`: clears the timer, drains `inflight` with `Promise.race([allSettled, DRAIN_TIMEOUT])`,
  logs `[worker] draining` / `[worker] drain complete` / `[worker] stopped`.
  Called from the graceful-shutdown path in `app.ts`.

---

## 4. Registered jobs

| `type` | File | maxAttempts | timeout | Payload | Status |
|---|---|---|---|---|---|
| `export` | `queue/jobs/export.job.ts` | 2 | 120 000 | `tenantId, userId, pageCode, exportFields, keyword` | **stub** (TODO) — returns `{fileName:'export_<pageCode>_<ts>.xlsx', recordCount:0}`, writes nothing |
| `import` | `queue/jobs/import.job.ts` | 2 | 180 000 | `tenantId, userId, excelMetaKey, fileUrl` | **stub** (TODO) — returns `{imported:0, failed:0, errors:[]}` |
| `notification` | `queue/jobs/notification.job.ts` | 3 | 10 000 | `tenantId, userId, title, content` | **stub** — a comment claims it writes `sys_notification`, but it writes nothing and returns `{sent:true, title}` |
| `webhook` | `queue/jobs/webhook.job.ts` | 5 | 15 000 | `webhookId, url, secret, events, event, tenantId, attempt?, data?` | **real** — `fetch` POST with `Content-Type: application/json`, `X-Webhook-Signature` = `HMAC-SHA256(secret, payloadString)`, `X-Webhook-ID`, `redirect:'manual'`, 10 s `AbortController`; logs each attempt to `sys_webhook_delivery` |

The webhook job is what really delivers webhooks; `POST /api/system/webhooks/:id/test` performs a
synchronous single attempt instead (see `pages/system-webhook.md`).

Note: the Excel **import/export used by the UI is synchronous** (`/api/common/excel/*`, guarded by
a Redis lock), not queued. The queued `export` / `import` handlers are a not-yet-finished second
implementation — check which one is wired before extending either.

---

## 5. Where `sys_jobs` is written

Only `queue/queue.ts` (INSERT/UPDATE). `core/audit.ts` does **not** touch `sys_jobs` — it writes
`sys_operation_log`, `sys_upload_audit` and `sys_login_log`. The only read outside the queue is
the Prometheus gauge `bls_kox_job_queue_waiting` (count of `status='queued'`).

---

## 6. Known gaps

1. `sys_jobs` status enum drift between `Init.sql` and the migration (§2) — the `dead` state may
   not be writable on a fresh install.
2. `export` / `import` / `notification` handlers are **stubs**; `notification`'s comment is
   wrong about `sys_notification`.
3. `system:job:create` / `system:job:read` are not seeded in `sql/Init.sql`, and no permission
   row exists for any menu → the API is effectively platform-tenant-only today.
4. No pagination on the list endpoint (hard-coded 50) and no filtering by `jobType`.
5. No frontend UI at all (no job list page, no retry/cancel action).
6. `cancelled` is a valid status but nothing ever sets it.
7. `dequeue()` calls `recoverStale()` on **every** poll (every 2 s) — a cheap but unnecessary
   query on every tick.
8. Worker concurrency is unbounded; a burst of queued jobs can exhaust DB connections or memory.
9. `jobData` is unvalidated per type; a malformed payload fails only inside the handler (and then
   retries until `dead`).

---

## 7. How to extend

1. **Add a job type**: create `queue/jobs/<name>.job.ts` exporting
   `{ type: '<name>', handler, maxAttempts?, timeout? }`, add the name to
   `ALLOWED_JOB_TYPES` in `api/system/job/index.ts`, register it in `app.ts`
   (`worker.register(...)`), and seed a permission row if the type becomes callable by tenants.
2. **Enqueue from a module**: `import { enqueue } from '../../../queue/queue'` and pass
   `{tenantId, userId, jobType, jobData}`. Always derive `tenantId` from the request context.
3. **Add progress reporting**: there is no progress field — either add a `progress` column to
   `sys_jobs` or use the job's `result` on completion. Do not reuse the dead ops-release WS push
   (see `00-common/09-realtime-websocket.md` §3).
4. **Add a job UI**: a page listing `GET /api/system/jobs` with a detail drawer calling
   `GET /api/system/jobs/:jobId`; gate it with `system:job:read` and add a page document.
5. **Fix the enum**: align `sql/Init.sql` and the migration in one change, then update
   `00-common/07-database.md` §7.
6. Update this document + `CHANGELOG.md`.
