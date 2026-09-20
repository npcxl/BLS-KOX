# 02 — Replay Protection (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

Replay protection stops an attacker from capturing a valid request (timestamp, body,
token) and re-sending it later.

Implementation:

- Config / rules: `bls-server/src/config/replay-protection.ts`
- Middleware: `bls-server/src/middleware/replay-protection.ts`
- Service: `bls-server/src/services/ReplayProtectionService.ts`
- Error codes: `bls-server/src/shared/constants/security-error-code.ts`
- Frontend header injection: `bls-admin/src/services/security/replayInterceptor.ts`
  and `bls-admin/src/requestErrorConfig.ts`

---

## 1. Modes

| Mode | What is required | Who uses it |
|---|---|---|
| `off` | nothing | all GET/HEAD/OPTIONS |
| `timestamp` | `X-Timestamp` inside the window | not currently used by a rule |
| `nonce` | `X-Timestamp` + `X-Nonce` (16–128 chars) unique per request | **the default for browser write requests** |
| `signature` | `X-Timestamp` + `X-Nonce` + `X-Signature` (HMAC-SHA256) | high-risk / server-to-server endpoints (payment, finance, user reset-password) |

**Browser frontends must never use `signature` mode** — the HMAC secret cannot be shipped to
the browser. `buildReplayHeaders({..., secret})` supports it only for server-to-server calls.

---

## 2. Check order (`ReplayProtectionService.check`)

```
1. find rule for (path, method)          -> no rule or mode 'off' => pass through
2. window = rule.windowSeconds ?? 120
   ttl    = max(rule.nonceTtlSeconds ?? 0, window * 2 + 30)
3. validateTimestamp(timestamp, window)   // |now - ts| <= window*1000
4. if mode in (nonce, signature):
     validateNonceFormat(nonce)           // non-null, 16 <= length <= 128
5. if mode === signature:
     validateSignature(...)               // HMAC-SHA256, timing-safe compare
6. if mode in (nonce, signature):
     validateNonceDedup(nonce, ttl)       // Redis SET key '1' EX ttl NX
7. if rule.idempotent:
     checkIdempotent(...)                 // see section 4
```

Canonical string signed in `signature` mode (`bls-server/src/shared/utils/signature.ts`):

```
METHOD \n PATH \n TIMESTAMP \n NONCE \n TENANT_ID \n USER_ID \n sha256(stableStringify(body))
```

`body` is serialised with sorted keys (`stableStringify`) so logically-equal bodies hash equally.

### Nonce key

```
replay:{tenantId}:{userId}:{nonce}          # authenticated request
replay:anonymous:{clientIp}:{nonce}         # unauthenticated request (e.g. login)
```

### Failure behaviour

- **Fail-open** when Redis is unavailable, **except** for `signature` mode
  (`Redis不可用，签名接口拒绝服务`).
- Every rejection writes a row to `sys_security_log` via `writeSecurityLog()` with a mapped
  event type and `HIGH` risk (or `CRITICAL` for `SIGNATURE_INVALID`), `source: 'replay'`.
- Prometheus metrics: `replayRejectedTotal{reason=timestamp|nonce|signature}`,
  `idempotencyConflictTotal{type=...}`.

### Error code → event type mapping (middleware)

| Code | Event type | Default risk |
|---|---|---|
| 40101 | `TIMESTAMP_MISSING` | HIGH |
| 40102 | `TIMESTAMP_INVALID` | HIGH |
| 40103 | `TIMESTAMP_EXPIRED` | HIGH |
| 40104 | `NONCE_MISSING` | HIGH |
| 40901 | `NONCE_REPLAY` | HIGH |
| 40105 | `SIGNATURE_MISSING` | HIGH |
| 40106 | `SIGNATURE_INVALID` | CRITICAL |
| 40902 | `IDEMPOTENCY_KEY_MISSING` | HIGH |
| 40903 | `IDEMPOTENCY_PROCESSING` | HIGH |
| 40904 | `IDEMPOTENCY_CONFLICT` | HIGH |

---

## 3. Rule table (`defaultReplayRules`)

Matching priority: **exact path (score 1000) > `/**` wildcard (500 + prefix length) > default**.
`methods` unset means "all methods".

| # | Path | Methods | Mode | Window | Nonce TTL | Idempotent |
|---|---|---|---|---|---|---|
| 1 | `/api/system/user/reset-password` | POST | signature | 60 | 180 | — |
| 2 | `/api/system/role/add` | POST | nonce | 60 | 180 | — |
| 3 | `/api/system/role/edit` | PUT | nonce | 60 | 180 | — |
| 4 | `/api/system/role/remove` | DELETE | nonce | 60 | 180 | — |
| 5 | `/api/system/storage/add` | POST | nonce | 60 | 180 | — |
| 6 | `/api/system/storage/edit` | PUT | nonce | 60 | 180 | — |
| 7 | `/api/system/storage/remove` | DELETE | nonce | 60 | 180 | — |
| 8 | `/api/payment/**` | POST/PUT/PATCH | signature | 30 | 600 | yes, TTL 7200 |
| 9 | `/api/finance/**` | POST/PUT/PATCH | signature | 30 | 600 | yes, TTL 7200 |
| 10 | `/api/auth/login` | POST | nonce | 60 | 150 | — |
| 11 | `/api/**` | POST/PUT/PATCH/DELETE | **nonce** | 120 | 300 | — |
| 12 | `/api/ai/chat/conversations` | GET/POST/DELETE | **off** | — | — | — |
| 13 | `/api/**` | GET/HEAD/OPTIONS | **off** | — | — | — |

Consequences for page authors:

- **Any write endpoint is protected by default** (rule 11). You never need to add anything,
  but you must not "fix" a missing nonce error by disabling replay protection.
- **Reads are exempt** (rule 13).
- Rule 12 exempts only the exact collection path `/api/ai/chat/conversations`; the sub-paths
  `/api/ai/chat/conversations/{id}` (PUT rename) and `/{id}/messages` are **not** exempt and
  therefore require a nonce.
- Rule 1 targets an endpoint that **does not exist yet** in `bls-server/src/api/system/user/`
  (no `reset-password` route). If you implement it, the signature rule is already in place;
  a browser-only implementation must switch it to `nonce`.
- Bypass: any request carrying `X-Internal-Secret` skips replay protection entirely (used for
  service-to-service calls such as `bls-ai-service` → `bls-server`), and so does
  `/internal/*` (separate mount, never passes through this middleware).

---

## 4. Idempotency

Only enabled for `/api/payment/**` and `/api/finance/**` today.

Header: `Idempotency-Key` (legacy alias `X-Idempotent-Key`).

State machine, key `idempotency:{tenantId}:{userId}:{key}`:

| Step | Redis operation | Result |
|---|---|---|
| First request | `SET key {state:'processing', fingerprint, lockToken} EX ttl NX` → `OK` | execute the handler |
| Same key, same body, still running | value exists, `fingerprint` equal, `state='processing'` | `40903` "请求处理中，请稍后重试" |
| Same key, same body, finished | value exists, `state='completed'` | replay the cached `{status, body}` immediately (no handler run) |
| Same key, different body | `fingerprint` differs | `40904` "相同 Idempotency-Key 对应不同请求内容" |

`fingerprint = sha256(METHOD \n PATH \n stableStringify(body))`.

On success the middleware replaces the record with `{state:'completed', fingerprint, status, body}`
and TTL `idempotentTtlSeconds`. On failure it releases the lock with a compare-and-delete so the
client may retry.

Frontend helper: `idempotencyKey()` in `bls-admin/src/services/security/replayInterceptor.ts`
returns a UUID; the caller must manage retries itself.

---

## 5. Frontend behaviour (must know before editing request code)

`bls-admin/src/requestErrorConfig.ts` → `attachAuthHeaders()` adds, on **every** request:

```
Authorization: Bearer <accessToken>   (if a token exists)
X-Timestamp:  <Date.now()>            (milliseconds, as a string)
X-Nonce:      <UUID without dashes, or random fallback>
```

The raw `fetch` in the AI workbench re-implements this with `buildReplayHeaders()`.

On a 401 retry the interceptor **deletes** `X-Timestamp`, `X-Nonce`, `X-Signature` so the
retried request gets a fresh nonce (otherwise it would be rejected as a replay).

Practical rules:

- One nonce per request. Never reuse a nonce across retries.
- If you add a new raw `fetch`/`axios` call, add `X-Timestamp` + `X-Nonce` manually.
- If you get `40901`, the request body/headers were replayed — regenerate the nonce.
- For SSE / long-lived requests use `nonce` mode, never `signature`.
