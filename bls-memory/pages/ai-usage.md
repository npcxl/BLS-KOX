# Page — AI Usage Center (`/ai/usage`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/ai/usage` (name AI 用量中心) |
| Component | `bls-admin/src/pages/ai/usage/index.tsx` (`AiUsagePage`) |
| Purpose | Read-only KPI cards + breakdown tables of AI token usage and estimated cost |
| Backend module | `bls-server/src/api/system/ai-usage/index.ts` |
| Table | `sys_ai_usage` |
| Data producer | `bls-ai-service/src/core/usage-tracker.ts` → `POST /api/system/ai-usage/report` |
| Shared docs | `03-rate-limiting.md` |

---

## 2. Frontend → API map

The page uses umi `request` directly (no dedicated service file).

| User action | Method | Endpoint | Params |
|---|---|---|---|
| Load KPI cards + charts (`fetchStats`, re-run when `days` changes) | GET | `/api/system/ai-usage/stats` | `?days=` (Select: 1 / 7 / 30 / 90, default 7) |
| Detail table (`ProTable` request) | GET | `/api/system/ai-usage/list` | `?pageNum=&pageSize=` |

There is **no export button** on this page.

Display:

- KPI cards (Ant `Masonry` + `Card` + `Statistic`): 今日调用 / Token / 费用 / 平均耗时.
- Four tables: by model, by endpoint, by user (Top 10), daily trend.
- Uses the `sys_upload_status` dictionary for the success enum.
- Cost is formatted as `$` + `Number(v).toFixed(4)`; tokens are compacted to K/M.

Types consumed: `UsageStats {today, dailyTrend, modelStats, endpointStats, userStats}` and
`UsageRecord`.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/ai-usage'`; custom handlers, no Zod.
`getTenantId(ctx) = getCurrentTenantId()` else `400 无法获取租户信息`.

### `POST /api/system/ai-usage/report`

- **No JWT**; requires `X-Internal-Secret === INTERNAL_SECRET` (and the env var must be non-empty)
  else 403.
- Inserts into `sys_ai_usage`: `usage_id` (snowflake), `tenant_id`, `user_id`, `username`,
  `model_name`, `provider`, `endpoint` (with defaults), `prompt_tokens`, `completion_tokens`,
  `total_tokens`, `estimated_cost`, `elapsed_ms`, `success` (`!== false` → 1), `error_msg`,
  `stream_mode`.
- Called by the AI service `trackUsage()`.

### `GET /api/system/ai-usage/list`

- `jwtAuth()` only — **no `hasPerm`**.
- Tenant scoped; `pageSize` max 100; maps rows to camelCase numeric fields.

### `GET /api/system/ai-usage/stats`

- `jwtAuth()`; `days` clamped to `[1, 90]`.
- `today`: `countAll`, `SUM(total_tokens)`, `SUM(estimated_cost)`, `AVG(elapsed_ms)` where
  `created_at >= today AND success = 1`.
- `dailyTrend`: raw pool query
  `SELECT LEFT(created_at,10) AS dt, COUNT(*), SUM(...) … WHERE tenant_id = ? AND created_at >= ?
   GROUP BY LEFT(created_at,10)`.
- `modelStats`: group by `model_name` (`success=1`), ordered by `SUM(total_tokens) DESC`.
- `endpointStats`: group by `endpoint`.
- `userStats`: group by `username, user_id`, limit 10.

Table: `sys_ai_usage` (DDL `sql/Init.sql` ~465–487; indexes on `tenant+created_at`,
`user+created_at`, `model_name`, `endpoint`). Migration:
`bls-server/src/scripts/migrations/20260722_008_ai_usage.sql`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /stats` | off | read 600/60 | `jwtAuth` only (menu permission `ai:usage:view`) |
| `POST /report` | n/a (internal call carries `X-Internal-Secret`, which bypasses the replay middleware) | — | `X-Internal-Secret` |

Tenant isolation: enforced by the `tenant_id` filter on both `list` and `stats`.
`report` trusts the `tenantId` in the body because it is internal-only.

⚠ `GET /list` and `/stats` require only `jwtAuth()` — any authenticated user can read their
tenant's usage. If usage is sensitive, add `hasPerm('ai:usage:view')`.

---

## 5. Frontend-only validation

None — read-only (the `days` select is limited to 1/7/30/90).

---

## 6. Quota / billing semantics

Usage is produced by the AI service (`bls-ai-service/src/core/usage-tracker.ts`):

- Token counts come from the provider `usage` when available; for streamed responses they are
  estimated (`completionTokens = ceil(chineseChars/1.5 + otherChars/4)`,
  `promptTokens = Σ ceil(content.length/4)`).
- `estimated_cost = estimateCost(modelName, promptTokens, completionTokens)` using `MODEL_PRICING`
  (USD per 1K tokens): `deepseek-chat {prompt: 0.00014, completion: 0.00028}`,
  `gpt-4o {prompt: 0.0025, completion: 0.01}`, local Ollama models `0`.
- `stream_mode` flags estimated (streamed) records.
- This page only reads/aggregates; **no quota is enforced** anywhere.

---

## 7. Known gaps / discrepancies

1. **No quota enforcement**: usage is recorded and displayed but never blocks a request.
2. Missing permission checks on `GET /list` / `GET /stats` (JWT only).
3. `estimated_cost` is an **estimate**, especially for streamed responses (token estimation).
   Surface this caveat in the UI if it drives billing decisions.
4. No export / CSV download even though the data is clearly reporting-oriented.
5. `dailyTrend` uses a raw pool query with `LEFT(created_at,10)` string grouping; it works because
   `created_at` is a MySQL datetime, but portability/sargability is limited.
6. `POST /report` trusts the body's `tenantId`; it is secret-gated, but a leaked secret would allow
   forging usage records for any tenant.

---

## 8. How to extend

- **Add a quota**: store a per-tenant limit (in `sys_config` or a new column on `sys_tenant`) and
  enforce it in `bls-ai-service` before calling the provider, or in `POST /report` by returning a
  flag the AI service respects. Add a UI banner when the quota is near exhaustion.
- **Add export**: implement `POST /api/system/ai-usage/export` (with a rate-limit rule similar to
  `excel/export`) and a button on the page.
- **Add permission checks**: wrap `/list` and `/stats` with `hasPerm('ai:usage:view')`.
- **Add a cost currency / rate config**: keep pricing out of code (`MODEL_PRICING`) and load it
  from a table so the UI and the tracker agree.
- Update this document and `pages/ai-workbench.md` §6 if accounting changes.
