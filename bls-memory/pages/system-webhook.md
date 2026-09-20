# Page — Webhook Management (`/system/webhook`)

> **Document version:** 1.0.1 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/webhook` (icon `LinkOutlined`) |
| Component | `bls-admin/src/pages/system/webhook/index.tsx` (no service file — inline `request`) |
| Purpose | Register / edit / delete outbound webhooks, send a test payload, inspect delivery logs |
| Backend module | `bls-server/src/api/system/webhook/index.ts` (+ `validate.ts`) |
| Tables | `sys_webhook` (`T`), `sys_webhook_delivery` (`DL`) |
| Shared docs | `03-rate-limiting.md`, `04-auth-and-permissions.md` |

---

## 2. Frontend → API map

Permission gating via `usePermission().can(...)`:
`canAdd='system:webhook:add'`, `canEdit='system:webhook:edit'`,
`canRemove='system:webhook:remove'`, `canTest='system:webhook:test'`,
`canLogs='system:webhook:logs'`.

| User action | Method | Endpoint |
|---|---|---|
| List table | GET | `/api/system/webhooks` |
| Create (modal submit) | POST | `/api/system/webhooks` |
| Edit | PUT | `/api/system/webhooks/{webhook_id \|\| webhookId}` |
| Delete (Popconfirm) | DELETE | `/api/system/webhooks/{wid}` |
| Test send (Popconfirm) | POST | `/api/system/webhooks/{wid}/test` |
| Delivery-log drawer | GET | `/api/system/webhooks/{webhookId}/logs?pageNum=&pageSize=` |
| Columns | GET | `/api/system/page-config/page/system:webhook:list/columns` (page code passed to `usePageConfig` is `'system:webhook:list'`) |
| Dicts | GET | `/api/system/dict/data/type?dictType=sys_status` and `sys_upload_status` |

`EVENT_OPTIONS`: `USER_CREATED`, `USER_DISABLED`, `ORDER_CREATED`, `PAYMENT_COMPLETED`,
`FILE_UPLOADED`, `SESSION_REVOKED`.

Modal fields: `name` (required), `url` (required, `type:'url'`), `events` (multi-select),
`status` (edit only). The list is `rowKey="webhookId"`, `search={false}`, `pagination={false}`
(total = `data.length`).

Test result: `res.code === 200` → `测试成功 (${res.data?.elapsedMs ?? '?'}ms)`, else
`message.warning(res.message ?? '发送失败')`.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/webhooks'`; `FETCH_TIMEOUT = 10_000`; no CRUD factory,
no Zod — hand-written validation plus `validateWebhookUrl`.

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| POST | `/api/system/webhooks` | `system:webhook:add` | `tid = requireTenantId()`; `validateWebhookUrl(b.url)` (400 on failure); generates `secret = sha256(Date.now()+Math.random()).slice(0,32)`; inserts `{webhook_id, tenant_id, name, url: trimmed, events: JSON.stringify(events ?? []), secret, status:'0', created_at, updated_at}`. Returns `{code:200, data:{webhookId, secret}, message:'注册成功'}` |
| GET | `/api/system/webhooks` | `system:webhook:list` | `tid = getCurrentTenantId() ?? '000000'`; `WHERE tenant_id = tid ORDER BY created_at DESC`; no pagination; returns raw `webhook_id` (the page handles both `webhook_id` and `webhookId`) |
| PUT | `/api/system/webhooks/:id` | `system:webhook:edit` | `requireTenantId()`; row must match `webhook_id = :id AND tenant_id = tid` else 404; re-validates a new URL; updates `name`/`url`/`events`/`status`/`updated_at` |
| DELETE | `/api/system/webhooks/:id` | `system:webhook:remove` | `requireTenantId()`; `DELETE ... WHERE webhook_id = :id AND tenant_id = tid` |
| GET | `/api/system/webhooks/:id/logs` | `system:webhook:logs` | `tid = getCurrentTenantId() ?? '000000'`; `sys_webhook_delivery WHERE webhook_id = :id AND tenant_id = tid`, optional `event =`; `pageNum`/`pageSize` (max 100, default 20); `ORDER BY created_at DESC` |
| POST | `/api/system/webhooks/:id/test` | `system:webhook:test` | Loads the webhook (id + tenant) else 404; `payload = {event:'test', timestamp}`; `signature = HMAC-SHA256(secret, payload)` sent as `X-Webhook-Signature`; `fetch` with `redirect:'manual'`; records the delivery (`event='test'`, `responseBody.slice(0,500)`, `attempt=1`) |
| POST | `/api/system/webhooks/:id/retry` | `system:webhook:logs` | Calls `handleRetry(...)` → enqueues a `webhook` job (`{webhookId, url, secret, events, event: body?.event ?? 'manual_retry', tenantId}`); returns `{code:200, message:'已重新入队'}` |

### Asynchronous delivery

`bls-server/src/queue/jobs/webhook.job.ts`:

- `type: 'webhook'`, `maxAttempts: 5`, `timeout: 15_000`, fetch timeout `10_000`.
- Signature = `HMAC-SHA256(secret, {webhookId, event, timestamp, data})`, headers
  `X-Webhook-Signature` **and** `X-Webhook-ID`, `redirect: 'manual'`.
- On error → log delivery `failed` (`请求超时` on `AbortError`) and rethrow.
- Retries use the queue's exponential backoff `2^(attempt-1) * 1000` ms; after `maxAttempts` the
  job is marked `dead` (dead-letter) — see `bls-server/src/queue/queue.ts`
  (`SELECT … FOR UPDATE SKIP LOCKED` claim, `STALE_TIMEOUT = 300_000` recovery, 2 s poll).

### SSRF / URL validation (`validate.ts`)

Two-phase `validateWebhookUrl(raw)`:

- Blocklisted hosts: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`.
- Blocklisted prefixes: `10.`, `172.16.`–`172.31.`, `192.168.`, `169.254.`, `fd`, `fc`.
- Blocklisted protocols: `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`; metadata IP
  `169.254.169.254`.
- Protocol must be `http:`/`https:`; hostname required.
- DNS check (skipped when the host is already an IP): resolve A/AAAA via `Promise.allSettled`;
  empty resolution → `DNS 解析失败`; a private/metadata address → `DNS 解析到内网地址`.

Tests: `bls-server/src/api/system/webhook/__tests__/webhook.test.ts`.

### Tables

`sys_webhook`: `webhook_id` (PK), `tenant_id`, `name`, `url`, `events` (json), `secret`,
`status` char(1) `'0'`/`'1'`, `created_at`, `updated_at`.

`sys_webhook_delivery`: `id` (PK), `webhook_id`, `event`, `payload`, `status`
(`pending`/`success`/`failed`), `response_code`, `response_body`, `error_message`, `attempt`,
`tenant_id`, `created_at`.

DDL: `sql/Init.sql` (~1197–1234); migration
`bls-server/migrations/20260713_007_webhook_delivery_log.sql` (also seeds menus `000210`–`000216`
and page config `PC_WEBHOOK` / columns `PCC_WH_01..05`).

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| `GET /webhooks`, `GET /:id/logs` | off | read 600/60 | `system:webhook:list` / `system:webhook:logs` |
| `POST /webhooks` | default write nonce (120 s / 300 s) | write 300/60 | `system:webhook:add` |
| `PUT /:id`, `DELETE /:id` | default write nonce | write 300/60 | `system:webhook:edit` / `remove` |
| `POST /:id/test` | default write nonce | write 300/60 | `system:webhook:test` |
| `POST /:id/retry` | default write nonce | write 300/60 | `system:webhook:logs` |

Key security properties:

- **SSRF protection** via `validateWebhookUrl` (static + DNS) at create and update time.
- The **secret is returned exactly once**, on create. It is stored in `sys_webhook.secret`.
- Tenant isolation: writes fail closed with `requireTenantId()`; reads use
  `getCurrentTenantId() ?? '000000'` and always filter `tenant_id = tid`.
- Outbound requests never follow redirects (`redirect: 'manual'`) to prevent redirect-based SSRF.
- Payloads are signed with HMAC-SHA256 so the receiver can verify authenticity.

---

## 5. Frontend-only validation

- `name` required; `url` required with `type: 'url'`.
- `events` multi-select (optional; defaults to `[]`).

## 6. Backend-only rules

- Full URL validation (protocol, host, DNS, private ranges).
- The webhook must exist within the tenant for edit/delete/test/retry/logs.

---

## 7. Known gaps / discrepancies

1. **No retry button in the UI** although `POST /api/system/webhooks/:id/retry` exists.
2. The **secret is shown only once**; the page displays it via a message/toast on create. There is
   no "rotate secret" action — rotating requires delete + recreate.
3. `GET /webhooks` has no pagination (`pagination={false}`) and returns raw snake_case
   `webhook_id`; the page defensively accepts both forms. Prefer the `wrapCamel` convention.
4. `status` is only editable via the edit modal (no inline toggle).
5. The page config key passed to `usePageConfig` is `system:webhook:list`. Verified against
   `sql/Init.sql`: the `sys_page_config` row with **id** `PC_WEBHOOK` carries exactly that
   `page_code`, with columns `PCC_WH_01..05`. Keep id and `page_code` in sync if you rename it.
6. Delivery logs are recorded by both the API (`logDeliveryLocal`, for test sends) and the job
   (`logDelivery`); make sure a change keeps both paths consistent.

---

## 8. How to extend

- **Add a retry button**: call `POST /api/system/webhooks/{id}/retry` from the delivery-log drawer
  and gate it with `system:webhook:logs`.
- **Add secret rotation**: implement `POST /api/system/webhooks/:id/rotate-secret` (permission
  `system:webhook:edit`), return the new secret once, and update the webhook.job to read the
  current secret at send time.
- **Add a new event type**: extend `EVENT_OPTIONS` on the frontend and the event source that
  triggers the delivery (outbox subscriber / queue enqueue).
- **Add inline status toggle**: implement `PUT /api/system/webhooks/:id/status` (or reuse the edit
  endpoint) and gate it with `system:webhook:edit`.
- Update this document.
