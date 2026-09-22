# Page — Login captcha (two-level: ALTCHA silent → Tianai secondary, public, part of `/user/login`)

> **Document version:** 4.0.0 · **Code version:** 1.0.0 · **Verified commit:** 5773b0f · **Last verified:** 2026-09-22
>
> *Uncommitted note:* v4.0.0 records the contract repair done on top of `5773b0f`:
> ① the Tianai payload is now the **official `ImageCaptchaTrack` DTO** (no more custom `{x,y}` /
> `{points}`); ② the configuration keys are **only** the 8 flat keys (`login_captcha_enabled` /
> `captcha_*`), `mode` is gone; ③ `captcha_tianai_enabled=true` now **fail-closes** when the service
> is unusable instead of silently downgrading to layer 1; ④ the layer-2 challenge can only be
> requested with a one-shot **escalation grant**; ⑤ `captchaTicket` is hashed with `sha256` in Redis
> keys; ⑥ the audit event `CAPTCHA_RISK_NOTED` was split from `CAPTCHA_SECONDARY_REQUIRED`.

## 1. Summary

| Item | Value |
|---|---|
| Trigger | `POST /api/auth/login` when `login_captcha_enabled=true` |
| First layer (silent) | **ALTCHA** — self-hosted, <https://github.com/altcha-org/altcha> (npm `altcha`, v3), invisible Proof-of-Work |
| Second layer (secondary) | **Tianai CAPTCHA** — separate Java service (`SLIDER` / `WORD_IMAGE_CLICK`), Koa only proxies |
| Backend routes | `bls-server/src/api/captcha/index.ts` (public, no `jwtAuth`) |
| Backend logic | `bls-server/src/security/captcha/*` (`service.ts`, `policy.ts`, `store.ts`, `ticket-service.ts`, `config.ts`, `crypto-utils.ts`, `types.ts`, `providers/altcha-provider.ts`, `providers/tianai-provider.ts`, `altcha.ts`) |
| Frontend | `bls-admin/src/hooks/useLoginCaptcha.ts`, `bls-admin/src/pages/user/login/captcha-machine.ts`, `bls-admin/src/components/AltchaCaptcha/`, `bls-admin/src/components/TianaiCaptcha/`, `bls-admin/src/services/auth/captcha.ts` |
| Config | **8 flat keys**: `login_captcha_enabled`, `captcha_primary_provider`, `captcha_fallback_provider`, `captcha_ticket_ttl`, `captcha_tianai_enabled`, `captcha_challenge_ttl`, `captcha_force_after_failures`, `captcha_secondary_type` |
| Env | `ALTCHA_HMAC_KEY` (required in production), `ALTCHA_COST`, `TIANAI_BASE_URL`, `CAPTCHA_DEV_BYPASS` |
| Bridge service | `bls-captcha-service` (`CaptchaBridgeController`), Docker-internal `:8083`, **never exposed to browsers** |
| Menu permission | none — public endpoints, no privileged data |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md`, `07-database.md`, `08-external-api-and-service-auth.md` |

### Design rule (read this first)

**We do not implement captcha algorithms ourselves.** No slider, no image slicing, no pointer-trajectory
scoring, no browser fingerprinting.

| Concern | Owner |
|---|---|
| First-layer challenge generation + HMAC signing + expiry | `altcha/lib` → `createChallenge()` |
| First-layer Proof-of-Work solving (browser) | official `<altcha-widget>` (Web Worker) |
| First-layer payload verification (server) | `altcha/lib` → `verifySolution()` |
| Second-layer image generation + answer checking | **Tianai CAPTCHA service** (separate deployment) |
| `captchaTicket`, Redis state, binding, escalation decision | **this project** (not a captcha algorithm) |

### Two layers

```
layer 1  ALTCHA   : display="invisible" + auto="onload" → PoW solved in background, user sees nothing
layer 2  TIANAI   : risk policy hit → Tianai widget (SLIDER / WORD_IMAGE_CLICK) in the login form
```

- The **ALTCHA visible component (`display="standard"`) is not a second layer.** It is still a
  checkbox-style PoW that a script can pass. Layer 1 always uses `display="invisible"`.
- The real second layer is **Tianai**, rendered by a dedicated component that does **not** reuse
  `altcha-widget`.
- Escalation is **server-decided and gated**: when `/captcha/verify` decides the risk policy must
  escalate it returns `requireFallback: true` **plus a one-shot `escalationGrant`**.
  `/captcha/generate` with `provider=TIANAI` consumes that grant; without it the request is rejected
  (`40011`). A client can never request the (expensive) layer-2 resource at will.

### Known limitation (state it, do not hide it)

- Self-hosted ALTCHA cannot generate image/audio code challenges. All picture puzzles come from Tianai.
- Tianai is an **external dependency**. With `captcha_tianai_enabled=false` the deployment has no layer
  2 at all and risk hits are only *noted* (`CAPTCHA_RISK_NOTED`). With `captcha_tianai_enabled=true` a
  risk hit **must** complete Tianai; if the service is unusable (missing `TIANAI_BASE_URL`, failed
  health check, timeout) the request **fails closed** (HTTP 503 / `50302`) — nobody bypasses the check,
  and nobody is silently downgraded either.

### ⚠ Secure context (HTTPS) is mandatory

ALTCHA v3 computes its Proof-of-Work with **WebCrypto (`crypto.subtle`)**, which browsers only expose in
a **secure context**; the official code throws `Error: Secure context (HTTPS) required.` otherwise.
`isSecureContext` is true for `https://…`, `http://localhost`, `http://127.0.0.1` — **not** for
`http://<LAN-IP>`. Handling: `useLoginCaptcha.ts` dispatches `ENV_UNSUPPORTED` (`envBlocked = true`) and
`canSubmit()` stays `false`; with the feature disabled nothing is blocked.

### 503 troubleshooting

Only three sources:

| Code | Meaning |
|---|---|
| `50301` `CAPTCHA_SERVICE_UNAVAILABLE` | **Redis** unavailable — challenge / session / ticket storage fails closed. |
| `50302` `TECHNICAL_ERROR` | **Upstream Tianai** unreachable / timeout / bad response, or `captcha_tianai_enabled=true` while the service cannot run. |
| `40010`–`40013` | `captchaTicket` missing / invalid / expired / replayed. |

`app.ts` prints a startup warning when `TIANAI_BASE_URL` is empty; the system-parameter page performs a
health check (2xx + JSON body) **before** saving.

---

## 2. Endpoints

All are public (no `jwtAuth`) and answered with `Cache-Control: no-store`.

| Method | Path | Purpose | Frontend payload |
|---|---|---|---|
| GET | `/api/captcha/config` | public config: `enabled`, `primaryProvider`, `fallbackProvider`, `tianaiEnabled`, `generateUrl`, `verifyUrl`, `fieldName` | `?username=` |
| POST | `/api/captcha/generate` | layer-1 ALTCHA challenge **or** layer-2 Tianai challenge (needs `escalationGrant`) | `{ scene?, provider?, username?, escalationGrant? }` |
| POST | `/api/captcha/verify` | verify → Koa issues a one-shot `captchaTicket` | `{ scene?, provider?, username?, payload? (ALTCHA), sessionId? + data? (Tianai) }` |

`POST /api/auth/login` accepts **only** `captchaTicket` and consumes it atomically **before** looking up
the user or checking the password.

### 2.1 `GET /config` response

```json
{
  "enabled": true,
  "primaryProvider": "ALTCHA",
  "fallbackProvider": "TIANAI",
  "tianaiEnabled": false,
  "generateUrl": "/api/captcha/generate",
  "verifyUrl": "/api/captcha/verify",
  "fieldName": "altchaPayload"
}
```

**Not included on purpose:** thresholds (`captcha_force_after_failures`, `ALTCHA_COST`), failure
counters, and the internal policy reason (`ACCOUNT_FAILURES` / `IP_ACCOUNT_FANOUT` / `IP_RISK_HIGH` /
`RATE_LIMIT_PRESSURE` / `PRIVILEGED_ACCOUNT` / `DEVICE_ANOMALY`). There is **no** `requiredStage` and
**no** `mode`: the server only tells the client how to render and where to call.

### 2.2 Verification response

```json
{ "status": "passed", "provider": "ALTCHA", "captchaTicket": "<one-shot>", "expiresAt": 1700000000000 }
{ "status": "failed", "provider": "ALTCHA", "reason": "SECONDARY_REQUIRED",
  "requireFallback": true, "nextProvider": "TIANAI", "escalationGrant": "<one-shot>",
  "escalationExpiresAt": 1700000180000 }
{ "status": "failed", "provider": "TIANAI", "reason": "SOLUTION_INVALID" }
{ "status": "technical_error", "provider": "TIANAI", "reason": "UPSTREAM_TIMEOUT",
  "requireFallback": true, "nextProvider": "TIANAI", "escalationGrant": "<renewed>" }
```

- `status` ∈ `passed` / `failed` / `technical_error`. `technical_error` is **never** the user's fault.
- On a layer-2 technical failure the response carries a **fresh** `escalationGrant`, so the browser
  re-fetches a challenge automatically — the user does not have to submit once first.

---

## 3. Who decides what (field ownership)

| Field | Decided by | Notes |
|---|---|---|
| `provider` in the response | **server** | `ALTCHA` / `TIANAI` (uppercase) |
| `escalationGrant`, `captchaTicket`, `sessionId`, `upstreamId`, TTLs | **server** | random 32 / 24-byte; Redis stores only `sha256` |
| challenge `nonce`, `signature`, `expiresAt`, `data` | **server** (ALTCHA HMAC) | `data = { scene, tenantId, usernameHash, provider }` — client cannot tamper |
| `username` | **client** | hashed server-side; used for binding + policy evaluation |
| `payload` (layer 1) | **client** | base64 JSON produced by the official widget |
| `sessionId` + `data` (layer 2) | **client** | `data` = official `ImageCaptchaTrack` DTO; no identity fields |
| `stage` / `display` / `captchaMode` in the request body | — | **ignored** (those concepts no longer exist) |

### Anti-forgery rules enforced in code

1. Layer-1 payload is verified **first** (expiry → signature → PoW); only then is `parameters.data`
   read. `scene` / `tenantId` / `usernameHash` inside it must match the request (`STAGE_MISMATCH` /
   `BINDING_MISMATCH`).
2. Challenge `nonce` is registered at issue time (`SET NX EX`) and consumed atomically (`GETDEL`):
   one PoW solution = one verification.
3. If the risk policy requires layer 2, layer 1 **never issues a ticket**; it returns
   `SECONDARY_REQUIRED` + a one-shot `escalationGrant`.
4. `/captcha/generate?provider=TIANAI` requires the grant (`GETDEL`); forged / missing / reused grants
   → `40011` and the upstream is never called.
5. Secondary sessions use `GETDEL` **before** the upstream call (upstream `matching()` itself uses
   `getAndRemoveCache`), so one session = one answer submission.
6. `captchaTicket` is one-shot: `SET NX EX` marker + `GETDEL`; concurrent `/login` calls → exactly one
   wins (`CAPTCHA_REPLAYED` for the rest). Every login attempt invalidates the ticket whether the
   password was right or wrong.

---

## 4. Redis keys and TTLs

| Key | Type | Written by | TTL |
|---|---|---|---|
| `captcha:challenge:{nonce}` | marker | issue of a layer-1 challenge | `captcha_challenge_ttl` (180) |
| `captcha:secondary:{sessionId}` | JSON | issue of a layer-2 challenge | `captcha_challenge_ttl` (180) |
| `captcha:escalation:{sha256(grant)}` | JSON | risk-policy escalation | `min(challenge_ttl, 180)` |
| `captcha:ticket:{sha256(ticket)}` | JSON | successful layer 1 **or** layer 2 | `captcha_ticket_ttl` (120) |
| `captcha:ticket-used:{sha256(ticket)}` | marker | `/login` consumption attempt | 600 |
| `captcha:fail:account:{tenantId}:{usernameHash}` | counter | failed `/login` | 900 s |
| `captcha:fail:ip:{ipHash}` | counter | failed `/login` | 900 s |
| `captcha:ip-accounts:{ipHash}` | set | challenge request with a **real** username | 900 s |

Nothing is stored permanently; no plaintext ticket/grant ever appears in a key. Redis unavailable ⇒
`CaptchaUnavailableError` (fail closed).

---

## 5. Security audit events

`CAPTCHA_POW_PASSED` / `CAPTCHA_POW_FAILED`, `CAPTCHA_SECONDARY_REQUIRED` / `CAPTCHA_RISK_NOTED` /
`CAPTCHA_SECONDARY_PASSED` / `CAPTCHA_SECONDARY_FAILED`, `CAPTCHA_TOKEN_INVALID` /
`CAPTCHA_TOKEN_REPLAYED`, `CAPTCHA_SERVICE_UNAVAILABLE`.

- `CAPTCHA_SECONDARY_REQUIRED` = really escalated, **no ticket issued**. Mutually exclusive with
  `CAPTCHA_POW_PASSED` inside one `/verify` call.
- `CAPTCHA_RISK_NOTED` = a risk signal fired but the deployment has `captcha_tianai_enabled=false`, so
  there is nothing to escalate to; the reason is recorded only (LOW risk, request still passes).

Each record contains only: `provider`, `scene`, `secondaryType`, `failureReason`, `tenantId`,
`usernameHash`, `ipHash`, `requestId`. **Never** answers, images, payloads, passwords, full tickets or
grants.

---

## 6. Configuration

| Key | Type | Range / values | Default |
|---|---|---|---|
| `login_captcha_enabled` | bool | — | `true` |
| `captcha_primary_provider` | enum | `ALTCHA` / `TIANAI` | `ALTCHA` |
| `captcha_fallback_provider` | enum | `ALTCHA` / `TIANAI` | `TIANAI` |
| `captcha_ticket_ttl` | number | 30–600 | `120` |
| `captcha_tianai_enabled` | bool | — | **`false`** (enable after deploying Tianai) |
| `captcha_challenge_ttl` | number | 30–900 | `180` |
| `captcha_force_after_failures` | number | 1–100 | `3` |
| `captcha_secondary_type` | enum | `blockPuzzle` / `clickWord` | `blockPuzzle` |

- Read through **Dynamic Config** (Redis cache 60 s); `onWrite` invalidates the cache immediately.
- Invalid values never crash the login page: strict parsing falls back to the default and logs a warning.
- Old keys `sys.login.captcha.*` are **not read at runtime** (migration `20260922_018` soft-deletes
  them); there is deliberately only one key set.
- The system-parameter page writes through **`POST /api/system/config/batch`** (whitelist + single
  transaction, `system:config:edit`). Before committing, the backend merges current + incoming values;
  if the effective config has `captcha_tianai_enabled=true` it performs a **health check (2xx + JSON)**
  and rejects the save when unreachable or when `TIANAI_BASE_URL` is empty. Any write failure rolls the
  whole batch back.
- Frontend panel: `bls-admin/src/pages/system/config/components/CaptchaSettingPanel.tsx`
  (its row lookup **pages through** `sys_config`, because the table can exceed the 100-row page limit).

---

## 7. Tianai contract (the layer-2 payload)

**The only request contract is the official DTO**
`cloud.tianai.captcha.validator.common.model.dto.ImageCaptchaTrack`:

```json
{
  "bgImageWidth": 600,
  "bgImageHeight": 300,
  "templateImageWidth": 120,
  "templateImageHeight": 300,
  "startTime": 1700000000000,
  "stopTime": 1700000000800,
  "trackList": [
    { "x": 0,   "y": 5, "t": 0,   "type": "DOWN" },
    { "x": 227, "y": 9, "t": 800, "type": "UP"   }
  ]
}
```

- `type` ∈ `DOWN` / `MOVE` / `UP` / `CLICK` (official `TrackTypeConstant`).
- **Slider**: the official check is `(last.x - first.x) / bgImageWidth ≈ randomX / bgImageWidth`.
  Coordinates are **pixels**; y varies naturally with the pointer.
- **Word click**: every click is a `type: "CLICK"` entry in **pixel** coordinates; the number of entries
  must equal the count the bridge returns (`data.clickCount`). Custom `{points}` payloads are rejected.
- Sizes come **only** from the upstream response (`backgroundImageWidth/Height`,
  `templateImageWidth/Height`). There is no `randomY` and no 320×160 / 50×50 fallback: if the render
  fields are missing the component shows "验证码加载失败 + 刷新".
- Pointer / touch / keyboard produce the same structure (keyboard: arrow keys → `MOVE`, `Enter` → `UP`
  or `CLICK`).

Koa forwards the DTO verbatim to the bridge as `{ id, data }`; the bridge returns
`{ code: 200, valid: bool }`, and returns **5xx** when the track structure is incomplete (so a frontend
bug is never recorded as "the user failed").

---

## 8. Test coverage

Backend (`bls-server`):
`src/security/captcha/__tests__/captcha-service.test.ts` (~39) — feature off/on; ALTCHA pass / failed /
expired / replayed / binding mismatch; **ticket only in `sha256` form in Redis keys**; escalation →
grant → Tianai → ticket; grant is one-shot, bound and hash-only; client cannot request layer 2 without
a grant; Tianai user failure / technical failure (renewed grant) / generate failure; `tianaiEnabled=true`
+ missing URL ⇒ **fail closed, no ticket**; Redis unavailable ⇒ fail closed; audit semantics are
mutually exclusive.
`captcha-audit.test.ts` (4) — event set, restricted `detail` keys, no secrets/tickets/grants/usernames.
`src/api/system/config/__tests__/batch.test.ts` (10) — managed-key whitelist (old keys rejected), Tianai
health pre-check, **transaction rollback on write failure**.
`src/config/__tests__/dynamic-config.test.ts` — the 8 flat keys, defaults (`tianai_enabled=false`),
old keys ignored.
`src/__tests__/openapi-captcha-contract.test.ts` (4) — login schema is `captchaTicket`, no old concepts.

Frontend (`bls-admin`):
`src/pages/user/login/__tests__/captcha-machine.test.ts` — state-machine invariants incl. grant handling;
`src/hooks/__tests__/useLoginCaptcha.test.tsx` — config gate, single-flight verify, ticket cleared after
submit, stale responses dropped on username change, escalation flow, **technical failure auto-refreshes
the challenge**, user failure returns to layer 1, no TIANAI request without a grant;
`src/pages/user/login/index.test.tsx` — page flows incl. submit with `captchaTicket` and **no password
replay after 401/40010**;
`src/components/TianaiCaptcha/__tests__/tianai-track.test.tsx` — official DTO contract for slider
(pointer / keyboard / touch), word-click, and "no guessed sizes".
`src/pages/system/config/components/__tests__/CaptchaSettingPanel.test.ts` — official keys, whitelisted
batch items, paged row lookup.

Java (`bls-captcha-service`): `CaptchaBridgeContractTest` — type mapping, official DTO deserialization
(slider + click), structure rejection, render-field pass-through incl. `clickCount`.

---

## 9. Frontend state machine

`bls-admin/src/pages/user/login/captcha-machine.ts` is a pure reducer (unit-tested without React):

```
loadingConfig → waitingUsername → solvingSilent → ready → submitting
                      ↘ secondaryRequired → solvingSecondary ↗
                      ↘ error (config failed / env unsupported → submission blocked)
```

Invariants: no submit while `config === null` or `configError`; a username change bumps `cycleId` and
drops ticket/expiry/grant/secondary state; a stale response never overwrites a newer cycle; after
**any** `/login` request (success or failure) the local ticket is cleared because the server consumed it.
`ESCALATION_RENEWED` replaces the grant and drops the old challenge so the hook re-fetches immediately.

---

## 10. How to extend

- **Change the policy / TTLs / layer-2 type**: edit the 8 flat keys in the System parameters page — no
  code change.
- **Add a first-layer algorithm**: extend `deriveKeyFor()` in `bls-server/src/security/captcha/altcha.ts`
  (Argon2/Scrypt additionally need the extra ALTCHA workers on the widget). Never write a captcha
  algorithm yourself.
- **Add a second-layer type**: extend `CAPTCHA_SECONDARY_TYPES` in
  `bls-server/src/config/dynamic-config.ts`, add the rendering branch in
  `bls-admin/src/components/TianaiCaptcha/index.tsx`, and keep the answer payload opaque to Koa.
- **Swap the second-layer provider**: `TianaiProvider` is the only adapter; keep the
  `generate` / `verify` / `healthCheck` contract and the `sessionId` binding in `service.ts`.
- **Rust backend**: `bls-rust-server` currently has **no** captcha implementation (see §6.1). Porting is
  tracked as a follow-up: `GET /captcha/config`, `POST /captcha/generate`, `POST /captcha/verify`, plus
  `POST /auth/login` accepting `captchaTicket`, must mirror §2–§5 byte for byte.

### 6.1 (kept) — Other backends

The Java (`bls-java-server`) and Rust (`bls-rust-server`) backends do not expose captcha endpoints yet.
The admin frontend degrades gracefully: a failed `/config` request blocks submission (fail closed) with
a clear message instead of silently skipping verification.
