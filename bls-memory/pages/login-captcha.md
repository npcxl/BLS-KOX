# Page — Login captcha (two-level: ALTCHA silent → Tianai secondary, public, part of `/user/login`)

> **Document version:** 3.0.0 · **Code version:** 1.0.0 · **Verified commit:** 753d86a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the two-level design below (separate primary/secondary providers, server-derived
> stage, Tianai secondary) replaces v2.0.0 (single provider, ALTCHA `visible` used as "second layer")
> and is verified against the working tree on top of `753d86a`.

## 1. Summary

| Item | Value |
|---|---|
| Trigger | `POST /api/auth/login` when `sys.login.captcha.enabled=true` and `mode !== 'off'` |
| First layer (silent) | **ALTCHA** — self-hosted, <https://github.com/altcha-org/altcha> (npm `altcha`, v3), invisible Proof-of-Work |
| Second layer (secondary) | **Tianai CAPTCHA** — separate service (`blockPuzzle` / `clickWord`), Koa only proxies |
| Backend routes | `bls-server/src/api/auth/captcha/index.ts` (public, no `jwtAuth`) |
| Backend logic | `bls-server/src/security/captcha/*` (`service.ts`, `policy.ts`, `store.ts`, `config.ts`, `crypto-utils.ts`, `types.ts`, `providers/altcha-provider.ts`, `providers/tianai-provider.ts`, `altcha.ts`) |
| Frontend | `bls-admin/src/hooks/useLoginCaptcha.ts`, `bls-admin/src/pages/user/login/captcha-machine.ts`, `bls-admin/src/components/AltchaCaptcha/`, `bls-admin/src/components/TianaiCaptcha/`, `bls-admin/src/services/auth/captcha.ts` |
| Config | 8 × `sys.login.captcha.*` in `sys_config` → Dynamic Config |
| Env | `ALTCHA_HMAC_KEY` (required in production), `ALTCHA_COST`, `TIANAI_BASE_URL`, `CAPTCHA_DEV_BYPASS` |
| Menu permission | none — public endpoints, no privileged data |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md`, `08-external-api-and-service-auth.md` |

### Design rule (read this first)

**We do not implement captcha algorithms ourselves.** No slider, no image slicing, no pointer-trajectory
scoring, no browser fingerprinting.

| Concern | Owner |
|---|---|
| First-layer challenge generation + HMAC signing + expiry | `altcha/lib` → `createChallenge()` |
| First-layer Proof-of-Work solving (browser) | official `<altcha-widget>` (Web Worker) |
| First-layer payload verification (server) | `altcha/lib` → `verifySolution()` |
| Second-layer image generation + answer checking | **Tianai CAPTCHA service** (separate deployment) |
| `captchaToken`, Redis state, binding, stage decision | **this project** (not a captcha algorithm) |

### Two layers, and why ALTCHA `standard` is *not* the second layer

```
layer 1  silent     : ALTCHA display="invisible" + auto="onload" → PoW solved in background, user sees nothing
layer 2  secondary  : policy hit → Tianai CAPTCHA widget (blockPuzzle / clickWord) in the login form
```

- The **ALTCHA visible component (`display="standard"`) is not a second layer.** It is still a
  checkbox-style PoW that a script can pass; it exists only as a fallback UX when a widget must be
  shown. This project therefore uses `display="invisible"` for the first layer and never maps a
  business `stage` onto it (`ALTCHA display` value is always `invisible`; the type only allows
  `invisible | standard`, and `"visible"` is not a valid ALTCHA value).
- The real second layer is **Tianai** (`blockPuzzle` = 滑块拼图, `clickWord` = 点选文字), rendered by a
  dedicated component that **does not reuse `altcha-widget`**.

### Known limitation (state it, do not hide it)

- Self-hosted ALTCHA cannot generate image/audio code challenges (`altcha/lib` has no code-challenge
  generator). All picture puzzles come from the Tianai second layer.
- Tianai is an **external dependency**: if it is not configured, is down, times out or returns a bad
  response, the second layer **fails closed** (HTTP 503 / code `50301`) — the user cannot log in, but
  nobody bypasses the check either. Because of that, the system-parameter page validates
  `TIANAI_BASE_URL` reachability *before* saving (see §6).

### ⚠ Secure context (HTTPS) is mandatory

ALTCHA v3 computes its Proof-of-Work with **WebCrypto (`crypto.subtle`)**, which browsers only expose
in a **secure context**; the official code throws `Error: Secure context (HTTPS) required.` otherwise.
`isSecureContext` is true for `https://…`, `http://localhost` and `http://127.0.0.1` — **not** for
`http://<LAN-IP>:3000`. In that case layer 1 can never be solved (there is no library switch), so the
page must not silently wait forever.

Handling: `hooks/useLoginCaptcha.ts` checks `window.isSecureContext === false` once the config is
loaded and the feature is enabled, dispatches `ENV_UNSUPPORTED` (state `envBlocked = true`) and shows
「当前为非安全上下文（HTTP）…请改用 HTTPS 或 localhost 访问」; `canSubmit()` stays `false`. With the
feature disabled nothing is blocked. `AltchaCaptcha` additionally reports the widget's `state === 'error'`
through `onError`, so the same message appears even if the widget fails for another reason.
Dev workarounds: use `localhost`, configure HTTPS for the dev server, or temporarily mark the origin
secure via `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (debug only).

### 50301 troubleshooting (`CAPTCHA_SERVICE_UNAVAILABLE`)

Only two sources — check **which request** returned it in the browser Network panel:

| Request | Cause |
|---|---|
| `POST /captcha/secondary/challenge` / `/secondary/verify` | The policy requires layer 2 but **Tianai is unusable** (empty `TIANAI_BASE_URL`, unreachable, timeout, upstream error, or `secondaryProvider` not `tianai`). This is why the error appears "after typing the password": the username is debounced, the policy is re-evaluated with it, and the layer-2 challenge is requested immediately. |
| `POST /api/auth/login` | **Redis unavailable** — `captcha:token:*` consumption fails closed. |

`service.ts` logs `[captcha] secondary provider unavailable, login will fail closed` with a `hint`
(`TIANAI_BASE_URL` unset / provider not tianai), and `app.ts` prints a startup warning when
`TIANAI_BASE_URL` is empty. Recovery: deploy Tianai, or set `sys.login.captcha.mode=off`
(`enabled=false`), or clear `captcha:fail:*` counters (900 s TTL).

---

## 2. Endpoints

All are public (no `jwtAuth`) and answered with `Cache-Control: no-store`, except `/challenge`
which returns the raw official ALTCHA structure (the widget reads it directly).

| Method | Path | Purpose | Frontend payload |
|---|---|---|---|
| GET | `/api/auth/captcha/config` | public config + **server-decided** `requiredStage` | `?username=` |
| GET | `/api/auth/captcha/challenge` | first-layer ALTCHA challenge (**raw official JSON, no `{code,...}` wrapper**) | `?username=` |
| POST | `/api/auth/captcha/verify` | first-layer verification → one-shot `captchaToken` | `{ payload, username }` |
| POST | `/api/auth/captcha/secondary/challenge` | second-layer (Tianai) challenge + local one-shot `sessionId` | `{ username }` |
| POST | `/api/auth/captcha/secondary/verify` | second-layer verification → one-shot `captchaToken` | `{ sessionId, username, data }` |

### 2.1 `GET /config` response

```json
{
  "enabled": true,
  "mode": "adaptive",
  "primaryProvider": "altcha",
  "secondaryProvider": "tianai",
  "secondaryType": "blockPuzzle",
  "requiredStage": "silent",
  "challengeUrl": "/api/auth/captcha/challenge",
  "secondaryChallengeUrl": "/api/auth/captcha/secondary/challenge",
  "fieldName": "altchaPayload"
}
```

**Not included on purpose:** thresholds (`forceAfterFailures`, `cost`), failure counters, and the
internal policy reason (`ACCOUNT_FAILURES` / `IP_ACCOUNT_FANOUT` / `IP_RISK_HIGH` /
`RATE_LIMIT_PRESSURE` / `PRIVILEGED_ACCOUNT` / `DEVICE_ANOMALY` / `MODE_ALWAYS`).
The public surface only says *which stage is required*; the **reason** is written to the security log
only (`CAPTCHA_SECONDARY_REQUIRED` + `failureReason`).

### 2.2 Verification response

```json
{ "passed": true,  "stage": "silent", "captchaToken": "<one-shot>", "expiresAt": 1700000000000 }
{ "passed": false, "reason": "SECONDARY_REQUIRED", "requiredStage": "secondary", "message": "需要完成额外安全验证" }
{ "passed": false, "reason": "SOLUTION_INVALID" }
```

`stage` is **always** the server's own conclusion; the request body can never set it.

---

## 3. Who decides what (field ownership)

| Field | Decided by | Notes |
|---|---|---|
| `stage` (`silent` / `secondary`) | **server** | taken only from the HMAC-signed `challenge.parameters.data.stage` for layer 1, and from the consumed secondary session for layer 2 |
| `provider` / `secondaryType` in `captchaToken` | **server** | written from `primaryProvider` / `secondaryProvider` at issue time |
| `requiredStage` | **server** | `evaluateCaptchaPolicy()` over account failures, IP fan-out, IP risk, rate-limit pressure, privileged account, UA anomaly, `mode` |
| challenge `nonce`, `signature`, `expiresAt`, `data` | **server** (signed by ALTCHA HMAC) | client cannot tamper; `data = { tenantId, usernameHash, stage: 'silent', display: 'invisible' }` |
| secondary `sessionId`, `upstreamId`, binding, TTL | **server** | random 24-byte id; bound to tenant / domain / username / IP / UA |
| `captchaToken` value and TTL | **server** | 32 random bytes, Redis stores only `sha256` |
| `username` | **client** | hashed server-side; used for binding + policy evaluation |
| `payload` (layer 1) | **client** | base64 JSON produced by the official widget |
| `sessionId` + `data` (layer 2) | **client** | `data` = answer coordinates/points; no identity fields |
| `stage` / `display` / `provider` in the request body | — | **ignored**; sending `stage=visible\|secondary` changes nothing |

### Anti-forgery rules enforced in code

1. Layer-1 payload is verified **first** (expiry → signature → PoW); only then is
   `parameters.data` read. `stage` inside that data must be `silent`, otherwise `STAGE_MISMATCH`.
2. `tenantId` and `usernameHash` inside the signed data must match the current request
   (`BINDING_MISMATCH` otherwise) — a challenge solved for user A cannot be used for user B.
3. Challenge `nonce` is registered at issue time (`SET NX EX`) and **consumed atomically**
   (`GETDEL`) on verification: one PoW solution = one verification.
4. If the policy requires `secondary`, layer 1 **never issues a token** — it answers
   `requiredStage: "secondary"` (`SECONDARY_REQUIRED`); the reason goes to the audit log.
5. Secondary sessions live in Redis with `GETDEL`, so one session = one answer submission; binding is
   re-checked (tenant / domain / username / IP / UA) and `expiresAt` is enforced.
6. `captchaToken` is one-shot: `SET NX EX` marker + `GETDEL`; concurrent `/login` calls → exactly
   one wins (`CAPTCHA_REPLAYED` for the rest).

---

## 4. Redis keys and TTLs

| Key | Type | Written by | TTL |
|---|---|---|---|
| `captcha:challenge:{nonce}` | marker | issue of a layer-1 challenge | `challengeTtlSeconds` (180) |
| `captcha:secondary:{sessionId}` | JSON | issue of a layer-2 challenge | `challengeTtlSeconds` (180) |
| `captcha:token:{sha256(token)}` | JSON | successful layer 1 **or** layer 2 | `tokenTtlSeconds` (120) |
| `captcha:token-used:{sha256(token)}` | marker | `/login` consumption attempt | `tokenTtlSeconds + 300` |
| `captcha:fail:account:{tenantId}:{usernameHash}` | counter | failed `/login` | 900 s |
| `captcha:fail:ip:{ipHash}` | counter | failed `/login` | 900 s |
| `captcha:ip-accounts:{ipHash}` | set | layer-1 challenge with a **real** username | 900 s |

Nothing is stored permanently. Redis unavailable ⇒ `CaptchaUnavailableError` (fail closed).

> Note: **`captcha:ip-accounts:*` only ever receives a real `usernameHash`.** Anonymous requests must
> not insert an empty member, otherwise per-IP account fan-out statistics become meaningless (and a
> single empty member can mask real credential-stuffing).

---

## 5. Security audit events

`CAPTCHA_POW_PASSED` / `CAPTCHA_POW_FAILED` (layer 1 PoW), `CAPTCHA_SECONDARY_REQUIRED` /
`CAPTCHA_SECONDARY_PASSED` / `CAPTCHA_SECONDARY_FAILED` (layer 2), `CAPTCHA_TOKEN_INVALID` /
`CAPTCHA_TOKEN_REPLAYED`, `CAPTCHA_SERVICE_UNAVAILABLE`.

Each record contains only: `stage`, `provider`, `secondaryType`, `failureReason`, `tenantId`,
`usernameHash`, `ipHash`, `requestId`. **Never** answers, images, payloads, passwords or full tokens.

Failure reasons include the internal policy reasons (audit-only) and the verification failures
(`PAYLOAD_MISSING`, `PAYLOAD_MALFORMED`, `ALGORITHM_UNSUPPORTED`, `CHALLENGE_EXPIRED`,
`SIGNATURE_INVALID`, `SOLUTION_INVALID`, `BINDING_MISMATCH`, `STAGE_MISMATCH`, `PROVIDER_UNAVAILABLE`).

---

## 6. Configuration

| Key | Type | Range / values | Default |
|---|---|---|---|
| `sys.login.captcha.enabled` | bool | — | `true` |
| `sys.login.captcha.mode` | enum | `off` / `adaptive` / `always` | `adaptive` |
| `sys.login.captcha.primaryProvider` | enum | `altcha` / `tianai` | `altcha` |
| `sys.login.captcha.secondaryProvider` | enum | `altcha` / `tianai` | `tianai` |
| `sys.login.captcha.secondaryType` | enum | `blockPuzzle` / `clickWord` | `blockPuzzle` |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `180` |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `120` |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `3` |

- Read through **Dynamic Config** (Redis cache 60 s); `onWrite` invalidates the cache so changes apply
  immediately.
- Invalid values never crash the login page: strict parsing falls back to the default and logs a warning.
- The system-parameter page writes these rows through
  **`POST /api/system/config/batch`** (single transaction, `system:config:edit` required) so a partially
  applied change can never lock login. Before committing, the backend merges current + incoming values;
  if the effective config enables the Tianai second layer it performs a **health check** and rejects the
  save when the service is unreachable (or `TIANAI_BASE_URL` is empty).
- `TIANAI_BASE_URL` unset + `secondaryProvider=tianai` ⇒ second layer fails closed (503). Users whose
  policy only requires `silent` can still log in. **Deploying the second layer** (contract to satisfy:
  `GET /gen`, `POST /check`, `GET /health`; paths overridable with `TIANAI_GEN_PATH` /
  `TIANAI_CHECK_PATH` / `TIANAI_HEALTH_PATH`) is described in `docs/login-captcha.md` §6, with a
  "why it fails" table in §6.4.

### 6.1 Not covered by this feature

The Java (`bls-java-server`) and Rust (`bls-rust-server`) backends do not expose captcha endpoints.
The admin frontend degrades gracefully: a failed `/config` request blocks submission (fail closed) with
a clear message instead of silently skipping verification.

---

## 7. Test coverage

Backend (`bls-server/src/security/captcha/__tests__/`):
`captcha-service.test.ts` (30) — silent pass, **forged `stage` cannot pass**, `STAGE_MISMATCH`, A's
challenge rejected for B, old token invalid after username change, one-shot consumption + concurrency,
public config leaks nothing, **full silent → Tianai secondary → `/login` consumption**, secondary
session one-shot / binding / expiry, Tianai not configured / generation failure / check timeout →
fail closed, Tianai answering "wrong" → `SOLUTION_INVALID`, Redis unavailable, IP fan-out counting only
real usernames.
`captcha-audit.test.ts` (4) — event set, restricted `detail` keys, no secrets/tokens/usernames in logs,
internal reasons audit-only.
`src/api/system/config/__tests__/batch.test.ts` (7) — managed-key whitelist, Tianai health pre-check on
save (healthy / unhealthy / missing URL / captcha off / provider not tianai).

Frontend (`bls-admin`): `src/pages/user/login/__tests__/captcha-machine.test.ts` (15) — the state
machine invariants; `src/hooks/__tests__/useLoginCaptcha.test.tsx` (9) — config gate, single-flight
verify, token cleared after submit, username change invalidation, secondary flow, secondary failure;
`src/pages/user/login/index.test.tsx` (20) — page-level flows incl. captcha-enabled submit with
`captchaToken` and no auto-resubmit after `40010`.

---

## 8. Frontend state machine

`bls-admin/src/pages/user/login/captcha-machine.ts` is a pure reducer (unit-tested without React):

```
loadingConfig → waitingUsername → solvingSilent → ready → submitting
                      ↘ secondaryRequired → solvingSecondary ↗
                      ↘ error (config failed → submission blocked)
```

Invariants: no submit while `config === null` or `configError`; a username change bumps `cycleId` and
drops payload/token/expiry/secondary state; a stale response never overwrites a newer cycle; after
**any** `/login` request (success or failure) the local token is cleared because the server consumed it.

---

## 9. How to extend

- **Change the policy** (thresholds, TTLs, mode, layer-2 type): edit the `sys.login.captcha.*` rows in
  the System parameters page — no code change.
- **Add a first-layer algorithm**: extend `deriveKeyFor()` in
  `bls-server/src/security/captcha/altcha.ts` (Argon2/Scrypt additionally need the extra ALTCHA
  workers on the widget). Never write a captcha algorithm yourself.
- **Add a second-layer type**: extend `CAPTCHA_SECONDARY_TYPES` in
  `bls-server/src/config/dynamic-config.ts`, add the rendering branch in
  `bls-admin/src/components/TianaiCaptcha/index.tsx`, and keep the answer payload opaque to Koa
  (it is forwarded to Tianai as `{ id, data }`).
- **Swap the second-layer provider**: `TianaiSecondaryProvider` is the only adapter; keep the
  `createChallenge` / `verify` / `healthCheck` contract and the `sessionId` binding in `service.ts`.
