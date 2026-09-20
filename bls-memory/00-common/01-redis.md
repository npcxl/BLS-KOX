# 01 — Redis (single source of truth)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

> This is the **one and only** Redis document. Page documents never repeat Redis details;
> they only say "uses Redis via `<subsystem>`" and link here.

---

## 1. Connection

`bls-server/src/shared/utils/redis.ts` — the single client factory `getRedisClient()`
(ioredis, `lazyConnect: true`, `maxRetriesPerRequest: 1`).

Config comes from `bls-server/src/config/env.ts`:

| Env var | Default | Meaning |
|---|---|---|
| `REDIS_ENABLED` | `true` | If `false`, `getRedisClient()` returns `null` and **every subsystem fails open** (no rate limit / no replay dedup / no cache). |
| `REDIS_HOST` | `127.0.0.1` | |
| `REDIS_PORT` | `6379` | |
| `REDIS_USERNAME` / `REDIS_PASSWORD` | empty | Password is required in production. |
| `REDIS_KEY_PREFIX` | `bls:` | **ioredis `keyPrefix` is applied automatically**, so every key below is physically `bls:<key>`. |

Command duration and error metrics are collected by wrapping `client.call()`
(`redisOperationDurationSeconds`, `redisOperationErrorsTotal`).

**Fail-open philosophy**: Redis being down never blocks normal business traffic
(`RateLimitService` returns `allowed: true`, nonce dedup is skipped, cache falls back to DB).
The only exception is `mode: 'signature'` replay rules, which **fail closed**.

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
`tenant` (tenantId or `000000`), `account` (`sha256(lower(trim(username)))[0:16]`).

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
