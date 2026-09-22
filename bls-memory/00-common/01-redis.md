# 01 — Redis (single source of truth)

> **Document version:** 1.2.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the `captcha:*` namespaces (ALTCHA) were verified against `753d86a` +
> uncommitted captcha changes.

> This is the **one and only** Redis document. Page documents never repeat Redis details;
> they only say "uses Redis via `<subsystem>`" and link here.

---

## 1. Connection

`bls-server/src/shared/utils/redis.ts` — the single client factory `getRedisClient()`
(ioredis, `lazyConnect: true`, `maxRetriesPerRequest: 1`).

Config comes from `bls-server/src/config/env.ts`:

| Env var | Default | Meaning |
|---|---|---|
| `REDIS_ENABLED` | `true` | If `false`, `getRedisClient()` returns `null` and most subsystems fail open (no rate limit / no replay dedup / no cache). **阶段七：production requires `REDIS_ENABLED=true` — the process refuses to start otherwise.** Quota idempotency and the partner-API nonce check are the exceptions: they fail **closed** regardless of environment. |
| `REDIS_HOST` | `127.0.0.1` | |
| `REDIS_PORT` | `6379` | |
| `REDIS_USERNAME` / `REDIS_PASSWORD` | empty | Password is required in production. |
| `REDIS_KEY_PREFIX` | `bls:` | **ioredis `keyPrefix` is applied automatically**, so every key below is physically `bls:<key>`. |

Command duration and error metrics are collected by wrapping `client.call()`
(`redisOperationDurationSeconds`, `redisOperationErrorsTotal`).

**Fail-open philosophy**: Redis being down never blocks normal business traffic
(`RateLimitService` returns `allowed: true`, nonce dedup is skipped, cache falls back to DB).
The only exceptions that **fail closed** are `mode: 'signature'` replay rules, the partner-API
nonce check (`openapi:nonce:*`) and the **login captcha** (`captcha:*` — every store operation
raises `CAPTCHA_SERVICE_UNAVAILABLE` / HTTP 503 when Redis is missing or errors, so verification
can never be skipped).

`closeRedis()` is called on graceful shutdown.

---

## 2. Key namespace table

All keys below are logical names; the physical key has the `bls:` prefix.

| Key pattern | TTL | Written by | Purpose |
|---|---|---|---|
| `auth:session:{accessJti}` | access token remaining time | `api/auth/index.ts` | Maps access `jti` → `{userId, accessJti, refreshJti, refreshHash}` |
| `auth:refresh:{refreshJti}` | refresh token remaining time (7d) | `api/auth/index.ts` | Stores `sha256(refreshToken)` for rotation + reuse detection |
| `auth:user-sessions:{userId}` | — | `api/auth/index.ts` | Set of access `jti`s for the user (legacy index; purged when multi-login is disabled) |
| `auth:refresh-used:{oldJti}` | 7 days | `api/auth/index.ts` | Marks a refresh jti as already consumed → later replay = reuse attack |
| `session:{tenantId}:{userId}:{sessionId}` | 7 days | `security/session/session-center.ts` | Full `UserSession` JSON (`sessionId` is `acc:{jti}` or `ref:{jti}`) |
| `session-index:{tenantId}:{userId}` | 7 days | `security/session/session-center.ts` | Set of `sessionId`s (avoids `KEYS`) |
| `replay:{tenantId}:{userId}:{nonce}` | `nonceTtlSeconds` | `ReplayProtectionService` | Nonce dedup for authenticated requests (`SET ... NX`) |
| `replay:anonymous:{clientIp}:{nonce}` | `nonceTtlSeconds` | `ReplayProtectionService` | Nonce dedup for unauthenticated requests (e.g. login) |
| `idempotency:{tenantId}:{userId}:{key}` | `idempotentTtlSeconds` (default 3600) | `ReplayProtectionService` | Idempotency state machine (`processing` / `completed`) |
| `rate:{dims}:{dimension}:{routeKey}` | `windowSeconds` | `RateLimitService` | Rate-limit counter (`INCR` + first-hit `EXPIRE` via Lua) |
| `security:blocked_ip:{ip}` | 3600 s (auto) or until `expireAt` (manual) | event center / security center | Temporary IP block. Checked by `blockedIpMiddleware`. |
| `config:{tenantId}` | 60 s | `config/dynamic-config.ts` | Dynamic config cache (`sys_config` subset). Invalidated by `invalidateConfigCache()` on config writes. |
| `ops:release:lock:{environment}` | 600 000 ms (PX, NX) | `ops-release` | Environment deploy lock; released with a Lua compare-and-delete. |
| `ops:release:nonce:{nonce}` | window + 60 s | `ops-release` callback | Anti-replay for GitHub Actions callbacks (HMAC mechanism, **not** the generic replay middleware). |
| `storage:upload` (distributed lock) | lease 30 s, wait 5 s | `api/system/storage/index.ts` | Serialises uploads; busy → HTTP 409. Degrades (runs anyway) if Redis is unavailable. |
| `ops:release:version-cache` (via `VERSION_CACHE_TTL=60000`) | 60 s | `ops-release` | Built-version list cache. |
| `session-tenant-index:{tenantId}` | 7 days | `security/session/session-center.ts` | Set of `userId`s that currently have sessions — lets `revokeAllForTenant()` revoke **every** session of a tenant without `KEYS` (阶段一：停用/过期租户立即失效). |
| `tenant:provision:idem:{idempotencyKey}` | 15 min (processing) / 24 h (result) | `api/system/tenant/provisioning.ts` | Tenant provisioning idempotency (`SET NX`); repeat call with the same key returns the first result, concurrent call → `40903`. |
| `quota:idem:{tenantId}:{idempotencyKey}` | 24 h | `services/quota-service.ts` | One-shot quota consumption guard (`SET NX`); released on failure so the caller can retry. |
| `openapi:nonce:{nonce}` | 300 s | `middleware/openapi-auth.ts` | Partner-API nonce dedup (`SET NX`). **Redis unavailable → 503, fail-closed** (never degrades to allow). |
| `captcha:challenge:{nonce}` | `captcha_challenge_ttl` (30–900, default 180) | `security/captcha/store.ts` | `SET NX EX` marker that makes a **layer-1 ALTCHA challenge** single-use (`GETDEL` on verify). Only the nonce — the challenge itself is stateless and HMAC-signed by ALTCHA. |
| `captcha:secondary:{sessionId}` | `captcha_challenge_ttl` (default 180) | `security/captcha/store.ts` | **Layer-2 (Tianai) session** record: `type`, upstream `id`, `tenantId/usernameHash/ipHash/uaHash`, `expiresAt`. `GETDEL` before calling upstream ⇒ one session = one answer submission. |
| `captcha:escalation:{sha256(grant)}` | `min(captcha_challenge_ttl, 180)` | `security/captcha/store.ts` | One-shot **escalation grant**: issued only when `/captcha/verify` decides the risk policy must escalate; `/captcha/generate?provider=TIANAI` must consume it (`GETDEL`). Prevents clients from requesting the expensive layer-2 resource at will. The raw grant is never stored. |
| `captcha:ticket:{sha256(ticket)}` | `captcha_ticket_ttl` (30–600, default **120**) | `security/captcha/ticket-service.ts` | captchaTicket **binding record** (`scene`, `provider`, `verified`, tenantId/usernameHash/ipHash/uaHash). The raw ticket **never** appears in a key, a log line or an audit row. |
| `captcha:ticket-used:{sha256(ticket)}` | 600 (marker TTL) | `security/captcha/ticket-service.ts` | One-shot consumption marker (`SET NX EX`); already present ⇒ `CAPTCHA_REPLAYED`, missing record ⇒ `CAPTCHA_EXPIRED`. |
| `captcha:fail:account:{tenantId}:{usernameHash}` | 900 s | `security/captcha/store.ts` | Consecutive login failures per account (drives `forceAfterFailures` → **layer-2 required**); cleared on a successful login. |
| `captcha:fail:ip:{ipHash}` | 900 s | `security/captcha/store.ts` | Login failures per IP hash (risk signal). |
| `captcha:ip-accounts:{ipHash}` | 900 s | `security/captcha/store.ts` | Set of username hashes a single IP tried (≥ 3 ⇒ layer-2 required). **Only a real `usernameHash` is ever added** — anonymous requests must not insert an empty member, otherwise the fan-out statistic is meaningless. |

> The `redis.keys('security:blocked_ip:*')` call in `api/system/security/index.ts` (`/stats`)
> counts temporarily blocked IPs. It is the only `KEYS` usage and it is on a small key space.

---

## 3. Subsystem details

### 3.1 Auth sessions (access + refresh)

- On login: `auth:session:{accessJti}`, `auth:refresh:{refreshJti}`,
  `auth:user-sessions:{userId}`, plus two Session Center entries
  (`acc:{accessJti}`, `ref:{refreshJti}`).
- On refresh: new pair written, old `auth:refresh:{oldJti}` deleted,
  `auth:refresh-used:{oldJti}` set for 7 days.
- On logout: `auth:session:{jti}` + `auth:refresh:{refreshJti}` deleted, both Session Center
  entries revoked.

### 3.2 Session Center (`security/session/session-center.ts`)

Full class API: `create`, `get`, `validate`, `touch` (KEEPTTL), `revoke`, `revokeAll`, `list`,
`detectReuse(rtHash, tenantId, userId)`.

`jwtAuth()` calls `sessionCenter.validate(tenantId, userId, 'acc:'+jti)` on **every** request.
This is what makes "kick user offline", "disable user" and "change password" take effect
immediately — revoking the session invalidates the still-valid JWT.

### 3.3 Replay protection

See `00-common/02-replay-protection.md`. Redis responsibilities:

- nonce dedup: `SET key '1' EX ttl NX`; failure to set ⇒ `40901 REPLAY_DETECTED`.
- idempotency: `SET key <processing-record> EX ttl NX`; then either
  `SET key <completed-record> EX ttl` (success) or Lua compare-and-delete (failure).
- If Redis is unavailable and the rule mode is `signature`, the request is **rejected**.

### 3.4 Rate limiting

See `00-common/03-rate-limiting.md`. Atomic Lua `INCR` + `EXPIRE` on
`rate:{dims}:{dimension}:{routeKey}`; window resets on first increment.
Dimension values: `ip` (client IP), `user` (userId or `anonymous`),
`tenant` (tenantId or `000000`), `account` (`sha256(lower(trim(username)))[0:16]`, falling back to
`ip:{sha256(ip)[0:16]}` when the body has no `username`), `device`
(`sha256(user-agent)[0:16]`).

The login captcha reads back `rate:ip:{ip}:/api/auth/login` as a risk signal (rate-limit pressure).

### 3.5 IP blocking

`security:blocked_ip:{ip}` is written by:

- the event center automatic action `BLOCK_IP` (TTL 3600 s), and
- manual blacklist in the Security Center (`POST /api/system/security/blacklist`), where TTL
  is `max(1, (expireAt - now)/1000)` seconds, or 3600 if no expiry was given.

`blockedIpMiddleware()` checks the Redis key first and then the `sys_ip_blacklist` table.
Removing the blacklist entry (`DELETE /api/system/security/blacklist/:id`) also deletes the
Redis key.

### 3.6 Dynamic config cache

`config:{tenantId}` caches the raw `sys_config` rows for 60 s
(`bls-server/src/config/dynamic-config.ts`). The typed view (`multiLogin`,
`uploadLimitMB`, `demoEnabled`, `appName`) is parsed with a strict schema and safe defaults.
Any write to `sys_config` triggers `invalidateConfigCache(tenantId)`.

`uploadLimitMB` (from `sys.upload.maxSize`, default 20, range 1–500) is the dynamic file
upload limit — see `00-common/06-file-and-excel-security.md`.

### 3.6.1 Login captcha (two-level: ALTCHA silent → Tianai secondary) (`security/captcha/store.ts`)

Login human-verification — full description in
[`pages/login-captcha.md`](../pages/login-captcha.md).

- **Layer-1 challenge**: ALTCHA challenges are **stateless** (HMAC-signed by `altcha/lib`), so Redis
  stores only a single-use marker: `captcha:challenge:{nonce}` created with `SET NX EX` and consumed
  with `GETDEL`. Absent marker ⇒ the challenge expired, was already used, or was never issued.
- **Layer-2 session**: the Tianai challenge itself lives upstream; Redis keeps our own
  `captcha:secondary:{sessionId}` record (random 24-byte id + upstream id + binding + TTL). The
  session is consumed (`GETDEL`) **right before** the upstream call: the upstream
  `ImageCaptchaApplication.matching()` uses `getAndRemoveCache`, so once the request leaves Koa the
  upstream id is unusable whatever the outcome. On a transport timeout the client gets a **fresh
  escalation grant** in the `technical_error` response and re-fetches a challenge automatically.
- **Escalation grant**: `captcha:escalation:{sha256(grant)}`, one-shot, bound to
  tenant / scene / username / IP / UA. Consumed by `/captcha/generate` for `provider=TIANAI`.
- **One-shot ticket**: 32 random bytes; Redis keeps only `sha256(ticket)` — in the key **and** in the
  used-marker. Consumption is `SET captcha:ticket-used:{hash} NX EX …` followed by
  `GETDEL captcha:ticket:{hash}` — atomic, no Lua (with a `MULTI/EXEC GET+DEL` fallback).
  Concurrent callers: exactly one wins.
- **Risk counters**: `captcha:fail:account:*`, `captcha:fail:ip:*`, `captcha:ip-accounts:*` (900 s),
  written by the login handler and challenge creation (real usernames only).
- **Fail closed**: a missing client or any Redis error becomes HTTP 503
  `CAPTCHA_SERVICE_UNAVAILABLE`. There is no "allow on error" branch.

> Both layers share one namespace. Layer 2 additionally depends on an **external** service
> (Tianai): unset `TIANAI_BASE_URL`, a failed health check, a timeout or an upstream error all end in
> the same `503 CAPTCHA_SERVICE_UNAVAILABLE` — never in "verification skipped".

### 3.7 Release lock & callback nonce

`ops:release:lock:{environment}` prevents concurrent deploys of the same environment.
If Redis is unavailable, production deploys are **blocked** (`Redis 不可用，禁止生产环境发布`)
while staging is allowed to degrade. Callbacks from GitHub Actions are secured by an HMAC
signature plus `ops:release:nonce:{nonce}` replay dedup.

---

## 4. Rules for developers / AI agents

1. **Never hardcode the `bls:` prefix.** Use `getRedisClient()`; the prefix is applied there.
2. **Use SET-with-TTL**, never `SET` + separate `EXPIRE` (race condition).
3. **Use a session-index SET, never `KEYS`** to enumerate user sessions.
4. **Use compare-and-delete (Lua or read-then-check) for locks** so only the owner releases.
5. **Fail-open for availability features** (rate limit, cache), **fail-closed for
   signature-based security**.
6. When you add a new Redis key, add a row to the namespace table above **and** state the TTL
   and the writer.
