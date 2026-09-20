# Page — Release Center (`/ops/release`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/ops/release` (parent `/ops`; `/ops` redirects here) |
| Component | `bls-admin/src/pages/ops/release/index.tsx` (`OpsReleasePage`) |
| Service | `bls-admin/src/services/ops/release.ts` |
| Purpose | Trigger deployments, watch step-by-step progress/logs, roll back, check service health |
| Backend module | `bls-server/src/api/system/ops-release/` (`index.ts`, `release.service.ts`, `release.repository.ts`, `release.schema.ts`, `release-permission.ts`, `release-callback.service.ts`, `github-actions.service.ts`, `release.ws.ts`, `release.constants.ts`) |
| Tables | `ops_release_version`, `ops_release_task`, `ops_release_step`, `ops_release_log`, `ops_environment` |
| Redis | `ops:release:lock:{environment}`, `ops:release:nonce:{nonce}`, version cache |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md` |

---

## 2. Frontend → API map

| User action | Service function | Method | Endpoint |
|---|---|---|---|
| Versions list for the create form | `getReleaseVersions` | GET | `/api/ops/releases/versions` |
| List tasks (`ProTable` request) | `getReleaseList` | GET | `/api/ops/releases` (`pageNum`, `pageSize`) |
| Detail | `getReleaseDetail` | GET | `/api/ops/releases/{taskId}` |
| Steps | `getReleaseSteps` | GET | `/api/ops/releases/{taskId}/steps` |
| Logs (`limit` 50/100) | `getReleaseLogs` | GET | `/api/ops/releases/{taskId}/logs?limit=` |
| Create release | `createRelease` | POST | `/api/ops/releases` body `{environment, version, services[], reason}` |
| Rollback | `rollbackRelease` | POST | `/api/ops/releases/{taskId}/rollback` |
| Current version card | `getCurrentVersion('production')` | GET | `/api/ops/releases/current?environment=` |
| Running task | `getRunningTask(env)` | GET | `/api/ops/releases/running?environment=` |
| Service status | `getServiceStatus(env)` | GET | `/api/ops/releases/services/status?environment=` |

Behaviour:

- Create flow: modal form → `handleCreateSubmit` (validation) → confirmation modal.
  For `environment === 'production'` the user must type the exact text **`确认发布`** before OK
  is enabled.
- Polling: `fetchStatus` every 10 s; the detail modal refreshes every 3 s; when a task reaches
  `success | failed | rolled_back | cancelled` the list reloads.
- Status keys: `pending, checking, waiting_approval, running, success, failed, rolling_back,
  rolled_back, cancelled`.
- UI permission gating: `canCreate=ops:release:create`, `canRollback=ops:release:rollback`,
  `canLogs=ops:release:logs`, `canServiceView=ops:service:view`.
- Service options: `bls-admin`, `bls-server`, `bls-ai-service`, `bls-event-service`,
  `bls-java-server`.

---

## 3. Backend endpoints

Module: `bls-server/src/api/system/ops-release/`; the default router has `prefix: '/ops'`
(→ `/api/ops/*`). JWT-protected endpoints are registered on an inner `authRouter` that applies
`jwtAuth()` first; the callback routes are registered on the outer router **before** JWT.

`getTenantId(ctx) = ctx.state.user.tenantId || '000000'`.

| Method | Path | Permission (`release-permission.ts`) | Notes |
|---|---|---|---|
| GET | `/api/ops/releases/versions` | `ops:release:view` | Deployable (built) versions |
| GET | `/api/ops/releases/current` | `ops:release:view` (mapped from `current`) | Last successful version per environment |
| GET | `/api/ops/releases/running` | `ops:release:view` | Running task for the tenant + environment |
| GET | `/api/ops/releases/services/status` | `ops:service:view` | Real health checks (see below) |
| GET | `/api/ops/releases` | `ops:release:view` | Task list |
| GET | `/api/ops/releases/:taskId` | `ops:release:view` | Detail |
| GET | `/api/ops/releases/:taskId/steps` | `ops:release:view` | Steps |
| GET | `/api/ops/releases/:taskId/logs` | `ops:release:logs` | Logs |
| POST | `/api/ops/releases` | `ops:release:create` | Create a deploy task |
| POST | `/api/ops/releases/:taskId/rollback` | `ops:release:rollback` | Roll back a failed task |
| POST | `/api/ops/releases/callback` | **no JWT** — HMAC validated | GitHub Actions progress callback |
| POST | `/api/ops/releases/build-callback` | **no JWT** — HMAC validated | Build status callback |

`releasePermission` bypasses for `user.roleKeys?.includes('admin')` — ⚠ note that `jwtAuth` sets
`ctx.state.user = profile()`, which returns `roles[]` (not `roleKeys`); the admin auto-pass
therefore effectively relies on `permissions.includes(perm)` or the platform tenant `000000`.

### Service health map (`SERVICE_HEALTH_MAP`, 3 s timeout)

| Service | Probe |
|---|---|
| `bls-admin` | `http://bls-admin:80` |
| `bls-server` | `http://bls-server:7001/api/health` |
| `bls-ai-service` | `http://bls-ai-service:7201/health` |
| `bls-event-service` | `http://bls-event-service:7101/health` |
| `bls-java-server` | `http://bls-java-server:8080/api/health` |
| `mysql` | `SELECT count(*) FROM sys_user` |
| `redis` | `PING` |
| `minio` | `http://minio:9000/minio/health/live` |

### Zod schemas (`release.schema.ts`)

- `createReleaseSchema`: `environment` enum `production | staging`;
  `version` regex `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`;
  `services` array min 1 from `SERVICE_ALLOWLIST`; `reason` 1–500.
- `releaseCallbackSchema`: `taskId`, `stage`, `status` enum
  `waiting | running | success | failed | skipped | rollback | cancelled`, `progress` 0–100,
  `message`, `timestamp`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| GETs (`versions`, `current`, `running`, `services/status`, list, detail, steps) | off | read 600/60 | as per the table above |
| `GET /logs` | off | read 600/60 | `ops:release:logs` |
| `POST /releases` | default write nonce (120 s / 300 s) | write 300/60 | `ops:release:create` |
| `POST /:taskId/rollback` | default write nonce | write 300/60 | `ops:release:rollback` |
| `POST /callback`, `/build-callback` | **custom HMAC anti-replay** (not the generic middleware) | — | HMAC signature |

### Callback anti-replay (`release-callback.service.ts`)

- HMAC-SHA256 over `timestamp \n nonce \n body` with `RELEASE_CALLBACK_SECRET`.
- Headers: `X-Release-Timestamp`, `X-Release-Nonce`, `X-Release-Signature`.
- Time window `CALLBACK_TIME_WINDOW_MS = 300000` (5 min).
- Nonce stored in Redis `ops:release:nonce:{nonce}` with TTL `window + 60 s`; a repeat →
  `Nonce 已使用（重放攻击）`.
- Uses `timingSafeEqual`.

### Environment lock (Redis)

`acquireLock('ops:release:lock:{environment}')` → `SET key token PX 600000 NX`; released with a
Lua compare-and-delete. If Redis is unavailable:

- **production**: blocked (`Redis 不可用，禁止生产环境发布`),
- **staging**: degraded (allowed).

### Tenant isolation

Repository methods take `tenantId` and filter `WHERE tenant_id = ? AND deleted = 0`.
`:taskId` endpoints call `getTaskById(taskId, tenantId)` first → 404 when not owned.
`getTaskByIdInternal` (used by the callback/rollback internals) deliberately skips the tenant
check.

---

## 5. Frontend-only validation

- `version` / `environment` / `services` are required by the modal.
- Production requires typing `确认发布`.

## 6. Backend-only rules

- Semantic version regex.
- Service must be in `SERVICE_ALLOWLIST`.
- Version must be in the **built** version list, otherwise `版本 X 尚未构建完成`.
- Environment lock — only one deploy per environment at a time.
- Rollback only allowed for tasks in `failed` status.

---

## 7. Release logic (what actually happens)

Versions and `release.service.ts`:

1. `createRelease`: verify the version is built (`getBuiltVersions()`); acquire the env lock; abort
   if a task is already running; `fromVersion =` last successful deploy target; create the task
   (`action: 'deploy'`, `status: 'pending'`); write a log; create the **9 release steps**
   (`validate, lock, backup, pull_images, update_services, wait_services, health_check,
   business_check, complete`); transition to `checking`, mark `validate` success; then
   `triggerDeployWorkflow(...)` asynchronously → on a runId, `status: 'running'`, `lock` step
   success, log `runId=`, WS push; on failure `status: 'failed'`, fail running steps, release lock.
2. `rollback`: only for `failed` tasks; `targetVersion = from_version || rollback_version`;
   acquire the env lock; create a rollback task (`action: 'rollback'`,
   `fromVersion = task.target_version`, `sourceTaskId = taskId`); origin → `rolling_back`; create
   `ROLLBACK_STEPS` (`rollback, wait_services, health_check, complete`); `status: 'running'`;
   trigger the GitHub workflow with `action: rollback`. Failure restores the origin task to
   `failed`.
3. `handleCallback`: accepted only while the task is in `running | checking | rolling_back`;
   updates step + task (current_stage/progress); WS push; on `failed` releases the lock and, for a
   rollback task (`source_task_id`), marks the origin task failed; on
   `stage === 'complete' && status === 'success'` sets the final `success`/`rolled_back`, releases
   the lock and completes the origin rollback chain.

### GitHub Actions (`github-actions.service.ts`)

- `POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/{deployWorkflow}/dispatches`
  with inputs `{action, version, environment, taskId, services, callbackUrl}`.
- Waits 3 s then `findLatestRun` (`…/runs?per_page=1`) to capture the runId.
- Env: `GITHUB_OWNER` (default `npcxl`), `GITHUB_REPO` (default `BLS-KOX`),
  `GITHUB_DEPLOY_WORKFLOW` (default `deploy-production.yml`), `GITHUB_DEPLOY_REF` (default
  `master`), `GITHUB_DEPLOY_TOKEN`, `RELEASE_CALLBACK_URL`, `RELEASE_CALLBACK_SECRET`.
  `fetchGitHubTags` reads `git/refs/tags`.

### WebSocket push (`release.ws.ts`)

Channel `ops:release:{taskId}`; `sendToChannel` delivers to clients subscribed to the exact channel
or the `ops:release:*` wildcard; message type `release_progress`.

### Tables (`sql/ops_release.sql`, migrations `20260725_009` / `20260725_010`)

- `ops_release_version`, `ops_environment`.
- `ops_release_task`: `from_version`, `target_version`, `services`, `status`, `current_stage`,
  `progress`, `reason`, `github_run_id`, `triggered_by`, `triggered_by_name`, `started_at`,
  `finished_at`, `error_message`, `rollback_version`, `lock_token`, `source_task_id`.
- `ops_release_step`, `ops_release_log`.

Constants (`release.constants.ts`): `SERVICE_ALLOWLIST`, `ENVIRONMENT_ALLOWLIST`,
`VALID_TRANSITIONS`, `VALID_STEP_TRANSITIONS`, `CALLBACK_TIME_WINDOW_MS`,
`VERSION_CACHE_TTL = 60000`, `RELEASE_LOCK_PREFIX = 'ops:release:lock:'`.

---

## 8. Known gaps / discrepancies

1. `releasePermission` checks `user.roleKeys` which `jwtAuth` does not populate (`roles[]` instead).
   Either populate `roleKeys` in `AuthService.profile()` or rely on permission/permission-`*`
   semantics. This is a latent authorization inconsistency.
2. The 2 ms/3 s/10 s polling plus the WebSocket push is redundant; consider dropping the polling
   when the WS channel is connected.
3. `RELEASE_CALLBACK_SECRET` must be configured or the callbacks are rejected — verify in
   production `.env`.
4. The Redis unavailability behaviour differs by environment (production blocked, staging
   degraded) — expected, but make sure monitoring alerts on it.
5. `version cache` TTL is 60 s (`VERSION_CACHE_TTL`); a freshly built version may take up to a
   minute to appear in the create form.

---

## 9. How to extend

- **Add a service**: add it to `SERVICE_ALLOWLIST` (constants), to the frontend service select, and
  to `SERVICE_HEALTH_MAP`.
- **Add a release step**: extend `RELEASE_STEPS` / `ROLLBACK_STEPS` and `VALID_STEP_TRANSITIONS`.
- **Add a permission**: add it to `release-permission.ts` `PERMISSIONS`, gate the route, seed a
  `sys_menu` button row (`sql/ops_release.sql` has the seed pattern), and gate the UI action with
  `usePermission().can(...)`.
- **Change the deploy provider**: replace `github-actions.service.ts` and keep the callback
  contract (HMAC headers + `releaseCallbackSchema`) intact.
- Update this document and `00-common/01-redis.md` if the lock/cache keys change.
