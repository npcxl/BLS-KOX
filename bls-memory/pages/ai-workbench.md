# Page — KOX-AI Workbench (`/ai/workbench`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/ai/workbench` (parent `/ai`; `/ai` redirects here) |
| Component | `bls-admin/src/pages/ai/workbench/index.tsx` (`AiWorkbench`) |
| Purpose | Multi-tenant chat console: conversation list CRUD, model selection, SSE streaming chat, file/OCR ingestion |
| Backend | Conversation CRUD → **`bls-server`** `src/api/ai/chat/index.ts`; SSE chat / models / OCR → **`bls-ai-service`** |
| Tables | `ai_conversation`, `ai_conversation_message`, `sys_ai_usage` (usage reporting) |
| Shared docs | `00-common/01-redis.md`, `02-replay-protection.md`, `03-rate-limiting.md` |

**Path split (nginx, not the backend):**

```
/api/ai/chat/conversations   -> bls-server:7001
/api/ai/                     -> bls-ai-service:7201   (limit_req zone=api burst=30 nodelay, proxy_buffering off)
```

---

## 2. Frontend → API map

Service file: `bls-admin/src/services/ai/conversation.ts` (umi `request`, so replay headers are
added automatically).

| User action | Service function | Method | Endpoint |
|---|---|---|---|
| Init load conversation list | `getAiConversations` | GET | `/api/ai/chat/conversations` |
| Load messages (click / init) | `getAiConversationMessages` | GET | `/api/ai/chat/conversations/{id}/messages` |
| New conversation | `createAiConversation(title)` | POST | `/api/ai/chat/conversations` (`{title, id?}`) |
| Auto-create on first message | `createAiConversation(val.slice(0,20))` | POST | `/api/ai/chat/conversations` |
| Save messages after streaming | `saveConversationMessages(id, msgs, title?)` | POST | `/api/ai/chat/conversations` |
| Delete conversation | `deleteAiConversation` | DELETE | `/api/ai/chat/conversations/{id}` |
| Rename conversation | `renameAiConversation` | PUT | `/api/ai/chat/conversations/{id}` (`{title}`) |
| Load model list | `getAiModels` | GET | `/api/ai/models` |
| Switch model | local state only — the value is sent in the chat body | — | — |

Raw `fetch` calls (not umi; must add `Authorization` + `buildReplayHeaders` manually):

| Action | Method | Endpoint | Headers |
|---|---|---|---|
| Send message (SSE) | POST | `/api/ai/chat/completions` | `Content-Type: application/json`, `Authorization: Bearer <token>`, `X-Timestamp`, `X-Nonce` |
| OCR file ingest | POST | `/api/ai/ocr/recognize` | same; body `{image: base64, filename}` |
| OCR-then-chat (Upload `beforeUpload`) | POST | `/api/ai/chat/completions` | same |

Other behaviours:

- **Stop generation**: `Sender.onCancel` → `abortRef.current?.abort()`; `AbortError` keeps the
  partial answer or removes an empty AI bubble.
- **File upload**: Ant `Upload.beforeUpload` → base64 via `FileReader` → `doOCR` → injects the OCR
  text as a synthetic user message prefixed `[系统上下文：用户上传了文件 "..."]`.
- **SSE parsing**: split on `\n`, keep lines starting with `data: `, skip `[DONE]`, read
  `parsed.choices[0].delta.content`, throw on `parsed.error`.
- `authHeader()` reads `localStorage.getItem('token')` and prepends `Bearer ` if missing.

---

## 3. Backend endpoints

### 3.1 Conversation CRUD — `bls-server/src/api/ai/chat/index.ts`

Custom router `prefix: '/ai/chat'`; **no CRUD factory, no Zod**; raw Kysely queries.
Helpers: `getUserId(ctx) = ctx.state.user.userId`;
`getTenantId(ctx) = ctx.state.user.tenantId || getCurrentTenantId() || '000000'`.

Tables: `ai_conversation` (id, user_id, tenant_id, title, deleted, created_at, updated_at) and
`ai_conversation_message` (id, conversation_id, role, content, deleted, created_at)
(schema in `sql/Init.sql` ~494–519).

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/ai/chat/conversations` | `WHERE user_id = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 50` |
| GET | `/api/ai/chat/conversations/:id/messages` | `WHERE conversation_id = ? AND deleted = 0 ORDER BY created_at ASC`; on error returns `{code:200, data:[]}` (silent) |
| POST | `/api/ai/chat/conversations` | Upsert: if `id` exists → update `updated_at` (+ `title` if provided); else insert (`id = body.id \|\| generateSnowflakeId()`, `title = body.title \|\| '新对话'`). Then inserts each `body.messages[]` into `ai_conversation_message` with a new snowflake id |
| DELETE | `/api/ai/chat/conversations/:id` | Soft delete `{deleted:1} WHERE id = ? AND user_id = ?` |
| PUT | `/api/ai/chat/conversations/:id` | Rename; empty `title.trim()` → 400 `标题不能为空` |

⚠ Timestamps are written as `now = new Date().toISOString().slice(0,19).replace('T',' ')`
(i.e. UTC wall-clock), consistent with the rest of the codebase.

### 3.2 SSE chat / models / OCR — `bls-ai-service`

- Chat: `POST /api/ai/chat/completions` (`src/api/chat/index.ts`) with
  `aiRateLimit(env.rateLimit.aiPerMinute)`.
- Models: `GET /api/ai/models` (`src/app.ts`) — reads `getModelConfigs()` (fetched from
  `bls-server` `GET /api/system/ai-model/internal-list` with `X-Internal-Secret`, 30 s cache),
  keeps `status === '0'`, returns `{provider, currentModel, models:[{value,label,modelType,provider}]}`,
  and falls back to env `env.ai.*`.
- OCR: `POST /api/ai/ocr/recognize` (`src/api/ocr/index.ts`).
- All `/api/ai/*` routes sit behind `aiRouter.use(jwtAuth())` + `auditLogMiddleware`.

**SSE protocol** (`chat/index.ts`):

1. Validation: missing `body.messages` → `400 {code:400, message:'缺少 messages 参数'}`.
2. Request shape `{messages:[{role,content}], model?, stream?}`; role coerced to
   `user | assistant | system`.
3. Non-stream (`stream === false`): `ai.complete()`, `success(ctx, {content})`.
4. Stream: headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
   `Connection: keep-alive`; `ctx.respond = false`; `ctx.res.writeHead(200, …)`.
   - Per token: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` (OpenAI-compatible).
   - System prompt: `SYSTEM_PROMPT` (KOX-AI dev-assistant prompt) + `buildToolContext()`;
     `temperature: 0.3`.
   - If the provider has no `completeStream`, it falls back to `complete()` and writes the whole
     content as one delta.
   - End: `data: [DONE]\n\n` then `ctx.res.end()`.
   - Error: `data: {"error":{"message":"..."}}\n\n`.
5. Provider: `bls-ai-service/src/provider/openai.ts` (OpenAI-compatible
   `POST {baseUrl}/chat/completions`, `stream:true`); chosen by
   `provider/factory.ts` (`getAiProvider()` / `getAiProviderForModel(modelId)`).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit |
|---|---|---|
| `/api/ai/chat/conversations` **exact path**, GET/POST/DELETE | **off** (explicit exemption rule) | write 300/60 (POST/DELETE), read 600/60 |
| `/api/ai/chat/conversations/{id}` (PUT rename) | default write nonce (120 s / 300 s) | write 300/60 |
| `/api/ai/chat/conversations/{id}/messages` (GET) | off | read 600/60 |
| `/api/ai/chat/completions` (bls-ai-service) | not behind the Koa replay middleware | `aiRateLimit` (`aiPerMinute`) + nginx `limit_req` |
| `/api/ai/models` | n/a (ai-service) | ai-service limiter / nginx |
| `/api/ai/ocr/recognize` | n/a (ai-service) | `aiRateLimit` |

Ownership / tenant notes:

- `GET /conversations` filters by **`user_id` only** (plus `deleted=0`) — not `tenant_id`.
- `POST /conversations` writes `tenant_id` on create, but the **update branch filters only by `id`**
  (no user/tenant check) — a security hole if ids leak.
- `DELETE` / `PUT /conversations/:id` filter by `id AND user_id` (user ownership enforced).
- `GET /conversations/:id/messages` filters by `conversation_id` only — **no ownership check**.
- Conversation endpoints require `jwtAuth()` but **no `hasPerm`**; the menu permission is
  `ai:workbench:view`.

---

## 5. Frontend-only validation

- Empty message is not sent.
- Model selection is client-side; the value is validated by the AI service/provider.
- The replay exemption means the frontend does **not** need a fresh nonce for the exempted
  collection path, but the raw `fetch` still sends one (harmless).

---

## 6. Quota / billing

After each completion the AI service calls `trackUsage()` (fire-and-forget,
`bls-ai-service/src/core/usage-tracker.ts`):

- Token counting: from the provider `usage` when available (non-stream); otherwise estimated
  (`completionTokens = ceil(chineseChars/1.5 + otherChars/4)`,
  `promptTokens = Σ ceil(content.length/4)`).
- Cost via `estimateCost()` with `MODEL_PRICING` (USD / 1K tokens), e.g.
  `deepseek-chat {prompt: 0.00014, completion: 0.00028}`, `gpt-4o {0.0025, 0.01}`,
  local Ollama models = 0.
- Reported to `bls-server` `POST /api/system/ai-usage/report` with
  `X-Internal-Secret: env.internalSecret`.
- **No per-user hard quota** is enforced on chat; only rate limits apply.

---

## 7. Known gaps / discrepancies

1. **Replay exemption is exact-match only**: `PUT /api/ai/chat/conversations/{id}` (rename) and the
   `/{id}/messages` sub-paths are **not** exempt and require a nonce. The raw `fetch` chat call is
   not affected (it targets `/api/ai/chat/completions`, which is on the ai-service).
2. **Ownership gaps** in the conversation CRUD (see §4) — the POST update branch and the messages
   GET do not verify ownership. Fix before exposing conversation ids to untrusted callers.
3. `GET /conversations/:id/messages` swallows errors and returns an empty list, hiding failures.
4. The raw `fetch` reads the token from `localStorage['token']` directly instead of
   `tokenStore.getAccessToken()` — it works because both use the same key, but it bypasses the
   pre-emptive refresh logic. If the access token is expired the request fails.
5. The AI service hardcodes `provider:'deepseek'` and `estimatedCost:0` in the direct
   `trackUsage` call, but `usage-tracker.ts` recomputes `estimatedCost` via
   `estimateCost(record.modelName, …)` before POSTing, so the body value is overwritten.
6. OCR is used only to pre-process an uploaded image into context; there is no attachment storage.

---

## 8. How to extend

- **Add a conversation feature** (pin, archive, share): add a column to `ai_conversation`, extend
  the CRUD handlers, and remember to add ownership checks (`user_id`) to every new query.
- **Fix ownership**: filter the POST update branch and the messages GET by `user_id` /
  `tenant_id`.
- **Add a chat quota**: enforce a per-tenant/per-user limit in
  `POST /api/system/ai-usage/report` (or in the AI service before calling the provider), and
  surface remaining quota in this page.
- **Use the token store in the raw fetch**: replace `localStorage.getItem('token')` with
  `tokenStore.getAccessToken()` and call `ensureValidSession()` before sending.
- Update this document and `pages/ai-usage.md` if accounting changes.
