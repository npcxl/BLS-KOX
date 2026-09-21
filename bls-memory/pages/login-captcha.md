# Page — Login captcha (ALTCHA, public, part of `/user/login`)

> **Document version:** 2.0.0 · **Code version:** 1.0.0 · **Verified commit:** 753d86a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the ALTCHA-based captcha described here replaces the earlier
> self-implemented slider/rotate design (v1.0.0) and is verified against the working tree on top of
> `753d86a`.

## 1. Summary

| Item | Value |
|---|---|
| Trigger | `POST /api/auth/login` when `sys.login.captcha.enabled=true` and `mode !== 'off'` |
| Provider | **ALTCHA** — self-hosted open source, <https://github.com/altcha-org/altcha> (npm `altcha`, v3) |
| Backend routes | `bls-server/src/api/auth/captcha/index.ts` (public, no `jwtAuth`) |
| Backend logic | `bls-server/src/security/captcha/*` (`altcha.ts`, `service.ts`, `policy.ts`, `store.ts`, `config.ts`, `crypto-utils.ts`, `types.ts`) |
| Frontend | `bls-admin/src/components/AltchaCaptcha/index.tsx` (official `<altcha-widget>` wrapper), `bls-admin/src/services/auth/captcha.ts`, `bls-admin/src/pages/user/login/index.tsx` |
| Config | 6 × `sys.login.captcha.*` in `sys_config` → Dynamic Config |
| Env | `ALTCHA_HMAC_KEY` (required in production), `ALTCHA_COST`, `TIANAI_BASE_URL`, `CAPTCHA_DEV_BYPASS` |
| Menu permission | none — public endpoints, no privileged data |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md`, `08-external-api-and-service-auth.md` |

### Design rule (read this first)

**We do not implement captcha algorithms ourselves.** No slider, no image slicing, no pointer-trajectory
scoring, no browser fingerprinting. Everything cryptographic comes from the official ALTCHA library:

| Concern | Owner |
|---|---|
| Challenge generation + HMAC signing + expiry | `altcha/lib` → `createChallenge()` |
| Proof-of-Work solving (browser) | official `<altcha-widget>` (Web Worker) |
| Payload verification (server) | `altcha/lib` → `verifySolution()` |
| Code/audio challenge fallback | official widget (only when the server supplies a `codeChallenge`) |
| `captchaToken` + Redis + binding | **this project** (not a captcha algorithm) |

### Two stages

```
invisible : widget display="invisible" + auto="onload" → PoW solved in the background, user sees nothing
visible   : policy demands human interaction → widget display="standard" (official component + a11y)
```

Both stages end the same way: the server verifies the ALTCHA payload and issues a **one-shot
`captchaToken`** which `POST /api/auth/login` consumes *before* touching `sys_user`.

### Known limitation (state it, do not hide it)

Self-hosted ALTCHA **cannot generate image/audio code challenges** — `altcha/lib` has no code-challenge
generator (`challenge.codeChallenge` is only a pass-through field filled by ALTCHA Sentinel/Cloud).
Therefore:

- the *visible* stage shows the official **checkbox/switch PoW component** (with its built-in WCAG
  support), not an image puzzle;
- if the product genuinely requires a picture/slider puzzle, switch
  `sys.login.captcha.provider=tianai` and run **Tianai CAPTCHA as a separate internal service** —
  Koa only proxies challenge/verify and still issues its own `captchaToken`. Copying or rewriting
  the Java captcha algorithm into TypeScript is forbidden.

The *security* control is always the server-side PoW verification; the visible stage is a policy/UX
escalation, not a second cryptographic factor.

---

## 2. Frontend → API map

| Action | Service function | Method | Endpoint |
|---|---|---|---|
| Page load: read config + component shape | `getCaptchaConfig({username?})` | GET | `/api/auth/captcha/config` |
| Official widget fetches a challenge itself | `<altcha-widget challenge="/api/auth/captcha/challenge">` | GET | `/api/auth/captcha/challenge` |
| Submit the solved payload | `verifyCaptcha({payload, username, stage})` | POST | `/api/auth/captcha/verify` |
| Submit the login form | `login({username, password, type, captchaToken})` | POST | `/api/auth/login` |

- `bls-admin/src/components/AltchaCaptcha/index.tsx` imports the official widget (`import 'altcha'`),
  the official Chinese locale (`import 'altcha/i18n/zh-cn'`) and forwards `verified` / `statechange` /
  `expired` events. PoW and payload creation stay inside ALTCHA — the component only themes it through
  the official CSS variables (`--altcha-color-primary` = Ant Design `#1677ff`, etc.).
- The widget must run in a **secure context**: HTTPS in production, `localhost` in dev.
- The admin nginx CSP needs `worker-src 'self' blob: data:` because the official bundle creates its
  Proof-of-Work Worker from an inline `data:` URL (`bls-admin-nginx.conf`).

---

## 3. Backend endpoints

All are public; `/config` and `/verify` are wrapped in the standard
`{code, message, data}` envelope and set `Cache-Control: no-store`.
**`/challenge` returns the official ALTCHA challenge object verbatim** (no envelope) because the
widget's `challenge` attribute consumes it directly — the only business endpoint without the
envelope, like `/api/openapi.json`.

### `GET /api/auth/captcha/config?username=`

```json
{ "enabled": true, "mode": "adaptive", "provider": "altcha",
  "display": "invisible", "challengeUrl": "/api/auth/captcha/challenge",
  "fieldName": "altchaPayload" }
```

`display` is `visible` when `mode=always`, or when the account/IP hits the escalation policy
(§4). `reason` is added in that case. Thresholds, `ALTCHA_COST` and the HMAC key are never exposed.

### `GET /api/auth/captcha/challenge?username=`

Returns the official structure, e.g.

```json
{ "parameters": { "algorithm": "PBKDF2/SHA-256", "nonce": "…", "salt": "…", "cost": 50000,
                  "keyLength": 32, "keyPrefix": "00", "expiresAt": 1789000000,
                  "data": { "tenantId": "000000", "usernameHash": "…", "display": "invisible" } },
  "signature": "…" }
```

- `parameters.data` (tenant + usernameHash + display) is **inside the HMAC signature**, so the client
  cannot tamper with it. That is what makes the tenant/account binding and the visible/invisible
  decision server-enforced.
- The `nonce` is also registered in Redis (`captcha:challenge:{nonce}`, `SET NX EX`) so every
  challenge is **single-use**, as the official docs require.

### `POST /api/auth/captcha/verify`

Body: `{ payload, username?, stage?: 'invisible' | 'visible' }` where `payload` is the widget's
`base64(JSON.stringify({ challenge: { parameters, signature }, solution }))`.

Verification order (all server-side):

1. decode + structural validation of the payload;
2. binding: `parameters.data.tenantId` must equal the resolved tenant, and
   `parameters.data.usernameHash` (when non-empty) must equal the request's username hash;
3. **policy re-evaluation**: if the policy now demands `visible` (or the challenge was issued for
   `visible`) and the client claims `invisible` → `requireVisible: true`, no token, and the challenge
   is *not* burned;
4. challenge single-use: `GETDEL captcha:challenge:{nonce}` → gone ⇒ `CHALLENGE_EXPIRED`;
5. `altcha/lib verifySolution()` → expiry → signature → PoW;
6. issue the one-shot `captchaToken`.

Responses:

```json
{ "passed": true,  "captchaToken": "…", "expiresAt": 1789000000000 }
{ "passed": false, "reason": "SOLUTION_INVALID" }
{ "passed": false, "reason": "VISIBLE_REQUIRED", "requireVisible": true }
```

`reason` ∈ `PAYLOAD_MISSING | PAYLOAD_MALFORMED | ALGORITHM_UNSUPPORTED | CHALLENGE_EXPIRED |
SIGNATURE_INVALID | SOLUTION_INVALID | BINDING_MISMATCH | PROVIDER_UNAVAILABLE | VISIBLE_REQUIRED |
ACCOUNT_FAILURES | IP_ACCOUNT_FANOUT | IP_RISK_HIGH | RATE_LIMIT_PRESSURE | PRIVILEGED_ACCOUNT |
DEVICE_ANOMALY | MODE_ALWAYS`.

### Captcha errors of `POST /api/auth/login`

| code | HTTP | meaning |
|---|---|---|
| 40010 | 400 | `CAPTCHA_REQUIRED` — token missing |
| 40011 | 400 | `CAPTCHA_INVALID` — unknown / binding mismatch |
| 40012 | 400 | `CAPTCHA_EXPIRED` |
| 40013 | 400 | `CAPTCHA_REPLAYED` |
| 50301 | 503 | `CAPTCHA_SERVICE_UNAVAILABLE` — Redis unavailable / provider not configured |

---

## 4. Escalation policy (server side, cannot be skipped by the client)

`evaluateCaptchaPolicy()` (`security/captcha/policy.ts`) switches the widget to `visible` when any of:

| Condition | `reason` |
|---|---|
| `mode=always` | `MODE_ALWAYS` |
| same account reached `forceAfterFailures` consecutive login failures (15 min window, cleared on success) | `ACCOUNT_FAILURES` |
| one IP tried ≥ 3 distinct accounts in the window | `IP_ACCOUNT_FANOUT` |
| IP risk HIGH/CRITICAL or score ≥ 70 (Security Event Center rule engine) | `IP_RISK_HIGH` |
| login rate-limit pressure ≥ 10 (`rate:ip:{ip}:/api/auth/login`) | `RATE_LIMIT_PRESSURE` |
| `sys_user.is_admin = 1` for the login account | `PRIVILEGED_ACCOUNT` |
| obvious bot UA / missing UA (header-level only) | `DEVICE_ANOMALY` |

Enforcement: the same predicate runs again inside `/verify` with the *real* username, so pre-fetching
an `invisible` challenge cannot dodge the escalation.

---

## 5. `captchaToken`

- 32 random bytes (`crypto.randomBytes`) → `base64url`. **Signing is not needed**: the Redis lookup is
  the authority, and only `sha256(token)` is ever stored/compared.
- Redis: `captcha:token:{sha256}` → `{provider, tenantId, domainHash, usernameHash, ipHash, uaHash,
  stage, issuedAt, expiresAt}`, TTL = `sys.login.captcha.tokenTtlSeconds` (default **120 s**).
- Bound to: current **domain**, **username** hash, **IP** hash, **User-Agent** hash.
- One-shot: atomic `SET NX EX` on `captcha:token-used:{sha256}` then `GETDEL` of the record
  (`GETDEL`, falling back to `MULTI/EXEC GET+DEL`). Claim fails → `CAPTCHA_REPLAYED`; record gone →
  `CAPTCHA_EXPIRED`. Concurrent requests: exactly one wins.
- Consumed by the login handler **before** `sys_user` is read, and deleted on consumption; the same
  response shape is returned whether or not the account exists (no account enumeration).

---

## 6. Security rules for this page

| Protection | Rule |
|---|---|
| Rate limit | `/captcha/challenge` GET ip 60/60 s + device 30/300 s · `/captcha/verify` POST ip 30/60 s + account 20/300 s + device 30/300 s · `/captcha/config` GET ip 120/60 s |
| Replay | normal `/api/**` nonce rule (the browser interceptor adds `X-Timestamp`/`X-Nonce`) |
| Challenge single-use | `captcha:challenge:{nonce}` — `SET NX EX` at creation, `GETDEL` at verify |
| Cache | all captcha endpoints: `Cache-Control: no-store` |
| Secrets | `ALTCHA_HMAC_KEY` only in env; never logged, never sent to the client |
| Audit | `CAPTCHA_*` security log with only `stage / provider / failureReason / tenantId / usernameHash / ipHash / requestId` — never the payload, the solution, the key or the full token |
| Fail closed | Redis disabled/erroring, or `provider=tianai` without `TIANAI_BASE_URL` → HTTP 503 `CAPTCHA_SERVICE_UNAVAILABLE`; login is refused too |

---

## 7. Configuration

| Key | Type | Range / enum | Default |
|---|---|---|---|
| `sys.login.captcha.enabled` | bool | — | `true` |
| `sys.login.captcha.mode` | enum | `off` \| `adaptive` \| `always` | `adaptive` |
| `sys.login.captcha.provider` | enum | `altcha` \| `tianai` | `altcha` |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `180` |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `120` |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `3` |

Environment variables: `ALTCHA_HMAC_KEY` (production fails to start without it, ≥ 32 chars, no
`CHANGE_TO_*`), `ALTCHA_COST` (PoW difficulty, default 50 000), `TIANAI_BASE_URL` (only for
`provider=tianai`), `CAPTCHA_DEV_BYPASS` (dev only; blocks production startup).

Seed rows: `sql/Init.sql` (`000406`–`000411`) **and**
`bls-server/migrations/20260922_017_login_captcha.sql`. Rows written by the earlier 9-parameter
design (`silentThreshold`, `secondaryTypes`, `maxAttempts`) are obsolete; Dynamic Config ignores
unknown keys, so they can simply be deleted.

Immediate effect: the config CRUD `onWrite` → `invalidateConfigCache(tid)` drops `config:{tenantId}`.

---

## 8. Known gaps / discrepancies

1. **Koa only.** `bls-java-server` / `bls-rust-server` do not implement `/api/auth/captcha/*` and
   ignore `captchaToken`; the frontend degrades to the pre-captcha flow there.
2. No image/audio fallback with the self-hosted provider (§1). Use ALTCHA Sentinel or
   `provider=tianai` if a picture puzzle is mandatory.
3. `captcha:challenge:{nonce}` cannot distinguish "expired" from "already used" — both report
   `CHALLENGE_EXPIRED`. Acceptable: neither may proceed.
4. `ALTCHA_COST` is an env knob, not a `sys_config` key (it is a CPU-cost decision for operators).
5. `provider=tianai` proxies `<TIANAI_BASE_URL>/gen` and `/check`; the exact response envelope depends
   on that service and must be confirmed against the deployed Tianai version.
6. `CAPTCHA_DEV_BYPASS=true` skips verification entirely — never use it outside local work.

---

## 9. How to extend

1. **Add a config key**: `SCHEMA` + `KEY_MAP` + `DynamicConfig` in
   `bls-server/src/config/dynamic-config.ts`, seed it in `sql/Init.sql` **and** a matching
   `bls-server/migrations/*.sql` (generate both from one source, then diff), document it in
   `00-common/07-database.md`, and expose it in
   `bls-admin/src/pages/system/config/components/CaptchaSettingPanel.tsx`.
2. **Add a Redis key**: add the namespace + TTL row to `00-common/01-redis.md`.
3. **Change the PoW algorithm**: extend `deriveKeyFor()` in `security/captcha/altcha.ts`
   (Argon2/Scrypt need the widget to import extra workers — see the ALTCHA README).
4. **Tune the escalation**: edit `evaluateCaptchaPolicy()` and extend
   `src/security/captcha/__tests__/captcha-service.test.ts`.
5. Re-run `npm run lint && npm run test && npm run build && npm run openapi` in `bls-server` and
   `npm run tsc && npm run build` in `bls-admin`.
