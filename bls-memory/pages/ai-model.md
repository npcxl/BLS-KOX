# Page — AI Model Configuration (`/ai/models`)

> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/ai/models` (component `./system/ai-model`) |
| Component | `bls-admin/src/pages/system/ai-model/index.tsx` (`AiModelConfigPage`, renders `CrudTablePage`) |
| Purpose | CRUD of AI model providers/endpoints (`ai_model_config`), choose the default model |
| Backend module | `bls-server/src/api/system/ai-model/index.ts` |
| Table | `ai_model_config` |
| Consumer | `bls-ai-service/src/provider/factory.ts` via the internal-list endpoint |
| Shared docs | `02-replay-protection.md`, `03-rate-limiting.md` |

---

## 2. Frontend → API map

Resource: `{ basePath: '/api/system/ai-model', status: false }` (the status toggle is disabled;
`status` is edited via the form).

| User action | Service / call | Method | Endpoint |
|---|---|---|---|
| List (ProTable request) | `listResource` | GET | `/api/system/ai-model/list` (`pageNum, pageSize, keyword, …`) |
| Detail (not called by the page) | — | GET | `/api/system/ai-model/:id` |
| Create | `addResource` | POST | `/api/system/ai-model/add` |
| Edit | `editResource` | PUT | `/api/system/ai-model/edit` |
| Delete / batch delete | `removeResource` | DELETE | `/api/system/ai-model/remove` (`{ids}` body + `?ids=` query) |
| Status toggle | `changeResourceStatus` | PUT | `/api/system/ai-model/status` — **disabled in UI** because `resource.status === false` |

Form fields (`formColumns`): `modelName*`, `modelType` (`api` | `local`, default `local`),
`provider` (`openai` | `deepseek` | `qwen` | `custom` | `ollama`, default `ollama`), `modelId*`,
`apiKey` (password), `baseUrl`, `temperature` (0–2, default 0.3), `maxTokens` (1–131072,
default 4096), `timeoutMs` (5000–300000, default 60000), `isDefault`, `status`, `sortNum`, `remark`.

Permissions passed by the page: `create:system:ai-model:add`, `edit:system:ai-model:edit`,
`remove:system:ai-model:remove`, `status:system:ai-model:status` (no `list` gating).

There is **no "test connection"** feature in the page or the backend.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/ai-model'`, `T = 'ai_model_config'`.
Custom handlers **with Zod** (not `defineCrudModule`).

Zod schemas:

| Schema | Fields |
|---|---|
| `createSchema` | `modelName` 1–100, `modelType` enum `api \| local` (default `api`), `provider` 1–50, `modelId` 1–100, `apiKey` ≤500 nullish, `baseUrl` ≤500 nullish, `temperature` 0–2, `maxTokens` int 1–2 000 000, `timeoutMs` int 1000–600 000, `isDefault` enum `'0' \| '1'`, `status` enum `'0' \| '1'`, `sortNum` int 0–100000, `remark` ≤500 nullish |
| `updateSchema` | `createSchema.partial()` + `configId` 1–32 |
| `statusSchema` | `configId` 1–32, `status` enum `'0' \| '1'` |

`parseOrThrow` → `ValidationError('参数错误', issues)`.

| Method | Path | Auth / permission | Behaviour |
|---|---|---|---|
| GET | `/internal-list` | **no JWT**; requires `X-Internal-Secret === INTERNAL_SECRET` else 403 | Optional `tenantId` query or `X-Tenant-Id` header scoping. **Returns `api_key`** (needed by the AI service) |
| GET | `/list` | `system:ai-model:list` + `requireTenantId()` | `pageSize` max 100; `WHERE tenant_id = ? AND deleted = 0 ORDER BY sort_num ASC, create_time DESC`; rows go through `maskRow` |
| GET | `/:id` | `system:ai-model:list` | Tenant scoped; 404 when missing; masked |
| POST | `/add` | `system:ai-model:add` | Snowflake id; defaults `temperature 0.3`, `max_tokens 4096`, `timeout_ms 60000`, `status '0'`, `sort_num 0`; **transaction**; if `is_default='1'` first clears other default rows for the tenant |
| PUT | `/edit` | `system:ai-model:edit` | Existing tenant-scoped row required. **API key masking**: if incoming `apiKey` is undefined/null/`''` or contains `****` → keep existing; else overwrite. Transaction clears competing defaults |
| DELETE | `/remove` | `system:ai-model:remove` | `extractIds(body, query)` deduped; all ids must be visible for the tenant; soft delete |
| PUT | `/status` | `system:ai-model:status` | Tenant scoped; 404 when 0 rows |

Tables: `ai_model_config` (DDL `sql/Init.sql` ~431–459; seeds `ai_cfg_001` Qwen2.5 local,
`ai_cfg_002` DeepSeek api, `ai_cfg_003` Unlimited-OCR).

Secrets: `INTERNAL_SECRET = process.env.INTERNAL_SECRET`; masking helpers `maskKey`
(first4 + `****` + last4, ≤8 → `****`), `isMaskedValue`, `maskRow`.

### How the AI service consumes this

`bls-ai-service/src/provider/factory.ts` calls
`GET /api/system/ai-model/internal-list` with `X-Internal-Secret`, caches for 30 s, selects by
`modelId` and `status === '0'`, and falls back to `env.ai.*`. An `apiKey` starting with
`CHANGE_TO_` is ignored in favour of `env.ai.apiKey`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /list`, `GET /:id` | off | read 600/60 | `system:ai-model:list` |
| `POST /add` | default write nonce (120 s / 300 s) | write 300/60 | `system:ai-model:add` |
| `PUT /edit` | default write nonce | write 300/60 | `system:ai-model:edit` |
| `DELETE /remove` | default write nonce | write 300/60 | `system:ai-model:remove` |
| `PUT /status` | default write nonce | write 300/60 | `system:ai-model:status` |
| `GET /internal-list` | n/a (bypasses `/api` replay via the secret-bearing internal call) | — | `X-Internal-Secret` |

- **Internal endpoint protection**: `/internal-list` has no JWT; it is protected solely by the
  shared `INTERNAL_SECRET` and must never be exposed publicly (the nginx config only routes
  `/api/`, so `/internal/*` is not reachable externally — but keep it that way).
- Tenant isolation: all CRUD scoped by `requireTenantId()` + `WHERE tenant_id = ?`.
- API keys are masked in every response except the internal list.

---

## 5. Frontend-only validation

- `modelName`, `modelId` required; numeric ranges for `temperature` / `maxTokens` / `timeoutMs`.
- Leaving `apiKey` blank on edit keeps the stored key (server-enforced via the mask rule).

## 6. Backend-only rules

- Enum validation for `modelType` / `status` / `isDefault`, numeric ranges, string length caps.
- Only one default model per tenant (`is_default='1'` clears the others).
- `apiKey` masking / preservation on edit.

---

## 7. Known gaps / discrepancies

1. The **status toggle is disabled** in the UI (`resource.status === false`) even though the
   backend implements `PUT /status`; enable it or remove the endpoint.
2. The `system:ai-model:*` button permissions are now seeded in `sql/Init.sql`
   (`ai_model_list_0001` / `add` / `edit` / `remove` / `status`, added 2026-09-20, all children of
   menu `ai_model_0001`), so the buttons no longer depend on the platform-tenant bypass. Grant
   them to new roles explicitly.
3. The page does not gate the `list` action on `system:ai-model:list`.
4. There is **no connection test** — a wrong `baseUrl`/`apiKey` is only discovered at chat time.
5. `GET /internal-list` returns the plaintext `api_key`. It is secret-gated, but consider
   encrypting the key at rest and returning a short-lived token instead.

---

## 8. How to extend

- **Add a test-connection endpoint**: `POST /api/system/ai-model/test` with
  `hasPerm('system:ai-model:edit')`, build the provider from the submitted config and issue a
  minimal completion; add a dedicated rate-limit rule (it calls an external service).
- **Add a provider**: extend the `provider` enum end-to-end (frontend select, Zod schema, the
  provider factory in `bls-ai-service`).
- **Enable the status toggle**: set `resource.status` to the default and pass the status
  permission code.
- **Seed button permissions**: insert `sys_menu` rows for `system:ai-model:add/edit/remove/status`.
- Update this document.
