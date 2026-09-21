# Page — Two-stage login captcha (public, part of `/user/login`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-20
>
> *Uncommitted note:* this mechanism exists only in the working tree at `61aaf9a` + uncommitted
> captcha changes — it is **not yet committed**.

## 1. Summary

| Item | Value |
|---|---|
| Trigger | `POST /api/auth/login` when `sys.login.captcha.enabled=true` and `mode !== 'off'` |
| Frontend | `bls-admin/src/services/auth/captcha.ts`, `bls-admin/src/auth/behavior-collector.ts`, `bls-admin/src/components/CaptchaChallenge/index.tsx`, `bls-admin/src/pages/user/login/index.tsx` |
| Backend routes | `bls-server/src/api/auth/captcha/index.ts` (public, no `jwtAuth`) |
| Backend logic | `bls-server/src/security/captcha/*` (`service.ts`, `silent.ts`, `image.ts`, `policy.ts`, `store.ts`, `config.ts`, `crypto-utils.ts`) |
| Config | 9 × `sys.login.captcha.*` in `sys_config` → Dynamic Config (`bls-server/src/config/dynamic-config.ts`) |
| Env | `CAPTCHA_SECRET` (required in production, ≥ 32 chars), `CAPTCHA_DEV_BYPASS` (dev only) |
| Menu permission | none — the endpoints are public and return no privileged data |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `04-auth-and-permissions.md`, `05-security-log-and-event-center.md`, `08-external-api-and-service-auth.md` |

### Two stages

```
POST /captcha/challenge ──► stage: silent   ──► POST /captcha/silent/verify ──► passed ─► captchaToken
                                            └─► stage: secondary (forced/risky)      ─┐
                        ──► stage: secondary ─────────────────────────────────────────┴─► POST /captcha/secondary/verify ─► captchaToken
                                                                                          POST /auth/login {captchaToken}
```

`mode=always` → `/challenge` answers `stage:'secondary'` directly.
`mode=adaptive` → silent first; the server forces the second stage on risk (see §4).
`mode=off` or `enabled=false` → the endpoints report `{enabled:false}` and `POST /auth/login`
ignores `captchaToken` (fully back-compatible).

---

## 2. Frontend → API map

| User action | Service function | Method | Endpoint |
|---|---|---|---|
| Page load: read public config | `getCaptchaConfig()` | GET | `/api/auth/captcha/config` |
| Page load / retry: create challenge | `createCaptchaChallenge({username?, stage?})` | POST | `/api/auth/captcha/challenge` |
| Submit the form: stage 1 | `verifyCaptchaSilent({challengeId, nonce, username, startedAt, finishedAt, interactionSummary, proof?})` | POST | `/api/auth/captcha/silent/verify` |
| Stage 2 modal: verify | `verifyCaptchaSecondary({challengeId, username, answer, nonce?})` | POST | `/api/auth/captcha/secondary/verify` |
| Stage 2 modal: images | plain `<img src>` (not `request()`) | GET | `/api/auth/captcha/image/:imageId` |
| Submit the form | `login({username, password, type, captchaToken})` | POST | `/api/auth/login` |

All captcha calls pass `skipErrorMessage:true`; the login page owns the error UX.

`bls-admin/src/auth/behavior-collector.ts` accumulates **statistics only**: counts, interval
mean/σ, speed mean/max, blur/visibility counters and `navigator.webdriver` / plugins / languages.
It never stores coordinates or key values, so the payload cannot contain a trajectory or a password.

---

## 3. Backend endpoints

All five are **public** and set `Cache-Control: no-store, no-cache, must-revalidate, private`.

### `GET /api/auth/captcha/config`

`{code:200, data:{enabled, mode, secondaryTypes}}` — **only** these three fields.
`silentThreshold`, `forceAfterFailures`, `challengeTtlSeconds`, `tokenTtlSeconds`, `maxAttempts`
and `provider` are never exposed. When the domain cannot be resolved → `{enabled:false}`.

### `POST /api/auth/captcha/challenge`

Body: `{username?, stage?:'secondary'}`.
Response: `{enabled:true, challengeId, stage, expiresAt, nonce, secondaryType?, payload?}` or
`{enabled:false}`.
`payload` (secondary only, never contains the answer):

| Field | slider | rotate |
|---|---|---|
| `canvasWidth` / `canvasHeight` | 320×160 | 200×200 |
| `pieceSize`, `pieceY` | ✔ | — |
| `backgroundImageUrl`, `pieceImageUrl` | ✔ | — |
| `imageUrl` | — | ✔ |
| `tolerance` | 8 px | 15° |
| `keyboardHint`, `keyboardStep`, `hint` | ✔ | ✔ |

### `POST /api/auth/captcha/silent/verify`

Body: `{challengeId, nonce, username, startedAt, finishedAt, interactionSummary, proof?}`.
`interactionSummary` is whitelisted server-side by `sanitizeInteractionSummary()` — unknown keys
(trajectories, key contents, any PII) are dropped and numbers are clamped.

Response (pass): `{passed:true, captchaToken, expiresAt}`
Response (fail): `{passed:false, nextStage:'secondary', secondaryChallenge:{...}}`

### `POST /api/auth/captcha/secondary/verify`

Body: `{challengeId, username, answer:{x} | {angle}, nonce?}`.

Response (pass): `{passed:true, captchaToken, expiresAt}`
Response (fail): `{passed:false, retryable, remainingAttempts, reason}` where `reason` ∈
`ANSWER_MISMATCH | MISSING_ANSWER | MAX_ATTEMPTS | CHALLENGE_EXPIRED | CHALLENGE_NOT_FOUND |
CHALLENGE_STAGE_MISMATCH | TOKEN_BINDING_MISMATCH`.

### `GET /api/auth/captcha/image/:imageId`

`image/svg+xml`, generated by `security/captcha/image.ts` (`crypto.randomInt` randomness:
random gradient + shapes + noise, random piece position, random jigsaw outline, random rotation
20°–340°). Returns 404 when the image expired. The answer is **never** part of the image.

---

## 4. Security design

### Silent scoring (`security/captcha/silent.ts`)

| Input | Use |
|---|---|
| challenge existence / expiry / stage | hard gate before scoring |
| nonce | tampered ⇒ force stage 2 (`NONCE_REPLAY`) |
| dwell time | server-side `now - challenge.createdAt`, clamped by the client value |
| mouse / touch event counts | two equal-weight modalities (max 40) |
| interval mean/σ | σ≈0 with many events ⇒ `IRREGULAR_TIMING` |
| keyboard interval only | count + mean/σ (max 35) — **no key contents** |
| focus / blur / visibility | small bonus, penalty for heavy switching |
| `navigator.webdriver` / headless / bot UA | hard fail `AUTOMATION_DETECTED` |
| account / IP / device failure counters | force stage 2 |
| IP risk (Event Center rules) | force stage 2 at HIGH/CRITICAL or score ≥ 70 |
| rate-limit pressure (`rate:ip:{ip}:/api/auth/login`) | force stage 2 above 10 |
| optional PoW (`proof:{nonce,difficulty}`, difficulty 4-8) | ±20 |

Availability rules: **“no mouse movement” is never a bot verdict.** Keyboard-only and touch-only
users reach the default threshold 70 on their own (count ≥ 8 keys / ≥ 8 touches + dwell ≥ 1.2 s +
natural σ + focus bonus). When the score really is too low the user simply gets the visible
challenge instead of being rejected.

### Force-second-stage policy (`security/captcha/policy.ts`)

Cannot be bypassed from the client: there is no request field that skips stage 2, and every
condition is evaluated server-side inside `verifySilent`.

Trigger | Reason enum
---|---
`accountFailures ≥ forceAfterFailures` (default 3, 15 min window, cleared on successful login) | `ACCOUNT_FAILURES`
same IP tried ≥ 3 distinct accounts in 15 min | `IP_ACCOUNT_FANOUT`
IP risk HIGH/CRITICAL or score ≥ 70 | `IP_RISK_HIGH`
nonce mismatch / replay | `NONCE_REPLAY`
binding mismatch (IP / UA / domain / username) or bot-like UA | `DEVICE_ANOMALY`
`sys_user.is_admin = 1` for the login account | `PRIVILEGED_ACCOUNT`
login rate-limit pressure ≥ 10 | `RATE_LIMIT_PRESSURE`
`mode=always` | `RISK_FORCED`

### captchaToken

```
captchaToken = base64url({v:1,c:challengeId,t:tenantId,e:expEpochSeconds}) + '.' + base64url(HMAC-SHA256(payload, CAPTCHA_SECRET))
```

- Only `sha256(captchaToken)` is stored in Redis (`captcha:token:{hash}`).
- One-shot consumption: atomic `SET NX EX` on `captcha:token-used:{hash}` **then** `GETDEL` of the
  payload (`GETDEL` falls back to `MULTI/EXEC GET+DEL`; no Lua required).
  - claim fails → `CAPTCHA_REPLAYED`; claim succeeds but payload gone → `CAPTCHA_EXPIRED`.
- Bound to `challengeId`, tenant, **tenant domain hash**, `username` hash, **IP hash**, **UA hash**.
  Any mismatch → `CAPTCHA_INVALID` (the token has already been burned).
- The login handler consumes it **before** touching `sys_user`, so a captcha failure cannot leak
  whether the account exists. Responses are structurally identical for existing/non-existing users.
- Comparisons use `timingSafeEqual` (`crypto-utils.safeEqual`).

### Secondary challenge

- Type chosen randomly from `secondaryTypes`; images generated server-side.
- The correct `x` (slider) / `angle` (rotate) live only in `captcha:challenge:{id}`.
- Tolerance: slider ±8 px, rotate ±15° — never a fixed coordinate.
- `attempts` is an atomic `INCR` counter; the `(maxAttempts + 1)`-th verification invalidates the
  challenge immediately (even with the right answer).
- Success deletes the challenge before issuing the token.
- Both challenge types are driven by an antd `Slider`, which keeps arrow-key + Enter operation as
  the reserved keyboard-accessible alternative (payload carries `keyboardHint` / `keyboardStep`).

### Fail closed

`CaptchaStore` converts “Redis disabled” and any Redis command error into
`CaptchaUnavailableError` (HTTP 503 / code 50301). The captcha endpoints and `POST /auth/login`
therefore refuse to proceed when Redis is unavailable — there is no path that skips verification.

### Secrets & startup validation

| Variable | Rule |
|---|---|
| `CAPTCHA_SECRET` | production: required, ≥ 32 chars, no `CHANGE_TO_*` / common-password substring (`env.ts` + `app.ts` startup block) |
| `CAPTCHA_DEV_BYPASS` | only dev; `true` in production **blocks startup**; when active it short-circuits every captcha check and the public config reports `enabled:false` |

---

## 5. Configuration (`sys_config` → Dynamic Config)

| Key | Type | Range / enum | Default |
|---|---|---|---|
| `sys.login.captcha.enabled` | bool | `1/true/0/false` | `true` |
| `sys.login.captcha.mode` | enum | `off` \| `adaptive` \| `always` | `adaptive` |
| `sys.login.captcha.silentThreshold` | number | 0–100 | `70` |
| `sys.login.captcha.forceAfterFailures` | number | 1–100 | `3` |
| `sys.login.captcha.challengeTtlSeconds` | number | 30–900 | `180` |
| `sys.login.captcha.tokenTtlSeconds` | number | 30–600 | `120` |
| `sys.login.captcha.secondaryTypes` | csv subset | `slider`, `rotate` | `slider,rotate` |
| `sys.login.captcha.maxAttempts` | number | 1–20 | `5` |
| `sys.login.captcha.provider` | enum | `builtin` | `builtin` |

Invalid values (wrong type / out of range / unknown enum member / unknown csv item) are **rejected
and replaced by the documented default** with a `[dynamic-config]` warning — never silently coerced.
Rows for these keys are seeded for tenant `000000` in **both**:

- `sql/Init.sql` (`000406`–`000414`, lines 68–76) — fresh installs;
- `bls-server/migrations/20260922_017_login_captcha.sql` (`INSERT IGNORE`, re-runnable) — already
  deployed databases via `npm run db:migrate up`.

There is no DDL in either file (`sys_security_log.event_type` is `varchar(64)`, so the `CAPTCHA_*`
event types need no schema change). Other tenants fall back to the built-in defaults until a row is
added (the System parameters page can add them on demand).

Immediate effect: the System parameters CRUD config has
`onWrite: () => invalidateConfigCache(tid)`, so saving any `sys_config` row drops
`config:{tenantId}` and the next read re-reads the DB (the 60 s cache TTL only matters for other
instances / out-of-band DB writes).

---

## 6. Security rules for this page

| Protection | Rule |
|---|---|
| Replay | normal `/api/**` nonce rule (POST) — the captcha endpoints send `X-Timestamp`/`X-Nonce` from the browser interceptor; server-to-server callers do not need extra headers |
| Rate limit | `/challenge` ip 30/60 s, account 10/300 s, device 20/300 s · `/silent/verify` ip 60/60 s, account 20/300 s · `/secondary/verify` ip 30/60 s, account 15/300 s, device 30/300 s · `/config` ip 120/60 s |
| Cache | every captcha endpoint + image: `Cache-Control: no-store` |
| Redis TTL | challenge = `challengeTtlSeconds`, attempts = same, nonce = same, token = `tokenTtlSeconds`, used marker = `tokenTtlSeconds + 300`, image = `challengeTtlSeconds`, failure counters = 900 s. No permanent keys. |
| Audit | `CAPTCHA_*` security log with only `challengeId / stage / secondaryType / riskScore / failureReason / tenantId / usernameHash / ipHash / requestId` |
| Logging | answers, passwords, behaviour traces and full tokens are never written to logs or audit rows |

---

## 7. Frontend-only validation

- `username` / `password` required; single-submit guard (`submittingRef`).
- The captcha token is kept in a ref only and cleared after a successful login.
- `captchaRetryRef` limits automatic retry after `4001x` to one attempt per submit.
- Closing the stage-2 modal cancels the pending login and shows “已取消安全验证，登录未完成”.
- Slider/rotate use an antd `Slider` ⇒ mouse, touch and keyboard all work; the modal width is
  `min(canvasWidth + 96, 440)` with `max-width: 94vw` for phones.

---

## 8. Known gaps / discrepancies

1. **Koa only.** `bls-java-server` and `bls-rust-server` have no `/api/auth/captcha/*`; selecting
   them disables the feature (login stays compatible).
2. `provider` only accepts `builtin`; there is no third-party adapter yet.
3. PoW is accepted (`proof`) but never *required* — the challenge payload does not request it.
4. The stage-2 image is generated as SVG from numbers only (no canvas dependency). A determined
   bot can still template-match the puzzle hole; the jitter/noise only raises the cost.
5. `/api/auth/captcha/image/:imageId` matches the generic `/api/**` GET rate-limit rule (`user`
   dimension = `anonymous`), so image fetches share one bucket per 60 s window.
6. Dev bypass (`CAPTCHA_DEV_BYPASS`) skips verification entirely — never use it outside local work.

---

## 9. How to extend

1. **Add a config key**: add it to `SCHEMA` + `KEY_MAP` + `DynamicConfig` in
   `bls-server/src/config/dynamic-config.ts`, seed the default row in **`sql/Init.sql`** *and* a
   matching `bls-server/migrations/*.sql` (pure seed data still needs the migration so deployed
   databases are upgraded by `npm run db:migrate up` — see `00-common/07-database.md` §5),
   document it in `00-common/07-database.md`, and expose it on the System parameters page
   (`pages/system/config/components/CaptchaSettingPanel.tsx`).
2. **Add a Redis key**: add the namespace + TTL row to `00-common/01-redis.md`.
3. **Add a secondary type**: see §7 of [user-login.md](user-login.md).
4. **Tune the policy**: edit `security/captcha/policy.ts` (force conditions) or
   `security/captcha/silent.ts` (scoring) and extend
   `security/captcha/__tests__/{silent,captcha-service}.test.ts`.
5. Re-run `npm run lint && npm run test && npm run build && npm run openapi` in `bls-server`.
