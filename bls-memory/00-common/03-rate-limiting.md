# 03 — Rate Limiting (shared)

> **Document version:** 1.1.0 · **Code version:** 1.0.0 · **Verified commit:** 61aaf9a · **Last verified:** 2026-09-21
>
> *Uncommitted note:* the `device` dimension, the `account` fallback and the ALTCHA captcha rules
> were verified against `753d86a` + uncommitted captcha changes.

Implementation:

- Rules: `bls-server/src/security/rate-limit/rules.ts`
- Middleware: `bls-server/src/security/rate-limit/middleware.ts`
- Service (Lua counter): `bls-server/src/security/rate-limit/RateLimitService.ts`
- Types: `bls-server/src/security/rate-limit/types.ts`
- Registered globally in `bls-server/src/app.ts` (after replay protection / IP block).

---

## 1. Dimensions

| Dimension | Resolved value | Notes |
|---|---|---|
| `ip` | request client IP (`::ffff:` stripped) | used for login by IP |
| `user` | `userId` from the request context, else `anonymous` | default dimension |
| `tenant` | `tenantId` from the request context, else `000000` | |
| `account` | `sha256(trim(lowercase(body.username)))[0:16]`, **falling back to `ip:{sha256(ip)[0:16]}`** when the body has no `username` | used for login / captcha by account. The fallback prevents every anonymous caller from sharing one `anon` bucket (which could be used to exhaust it for others) |
| `device` | `sha256(user-agent)[0:16]` | coarse device dimension used by the captcha endpoints |

---

## 2. Algorithm

One Redis key per (rule, dimension value, route key):

```
rate:{dimensions joined by ':'}:{dimension}:{routeKey}
```

`routeKey` is the **rule path** (so all requests matched by the same wildcard share one bucket).
The counter is incremented with an atomic Lua script:

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
```

- `allowed = count <= limit`; on the first breach the middleware returns immediately.
- Successful responses carry `X-RateLimit-Remaining` and `X-RateLimit-Reset` (unix seconds).
- Breach response: HTTP **429**, header `Retry-After`, body
  `{ "code": 42901, "message": "请求过于频繁，请稍后再试", "data": null }`.
- Metric: `rateLimitRejectedTotal{route, dimension}`.
- **Fails open** if Redis is unavailable (`allowed: true`).

---

## 3. Rule table (`defaultRateLimitRules`)

All matching rules for a path are evaluated; exact path rules beat wildcard rules
(`matchRateLimitRules`: exact = 1000, `/**` = 500 + prefix length).

| # | Path | Methods | Dimension | Limit | Window |
|---|---|---|---|---|---|
| 1 | `/api/auth/login` | POST | `ip` | 20 | 60 s |
| 2 | `/api/auth/login` | POST | `account` | 5 | 300 s |
| 3 | `/api/common/excel/export` | POST | `user` | 5 | 60 s |
| 4 | `/api/common/excel/export` | POST | `tenant` | 200 | 3600 s |
| 5 | `/api/system/storage/upload` | POST | `user` | 30 | 60 s |
| 6 | `/api/auth/captcha/challenge` | GET | `ip` | 60 | 60 s |
| 7 | `/api/auth/captcha/challenge` | GET | `device` | 30 | 300 s |
| 8 | `/api/auth/captcha/verify` | POST | `ip` | 30 | 60 s |
| 9 | `/api/auth/captcha/verify` | POST | `account` | 20 | 300 s |
| 10 | `/api/auth/captcha/verify` | POST | `device` | 30 | 300 s |
| 11 | `/api/auth/captcha/config` | GET | `ip` | 120 | 60 s |
| 12 | `/api/**` | POST/PUT/PATCH/DELETE | `user` | 300 | 60 s |
| 13 | `/api/**` | GET/HEAD/OPTIONS | `user` | 600 | 60 s |

Rules 1+2 are both applied to login (two independent counters), 3+4 to export, and every captcha
path expands to 1–3 counters (see the captcha page document). The captcha limits exist mainly to
stop unlimited challenge creation / verification from burning CPU (ALTCHA Proof-of-Work costs real
server CPU) and Redis memory.

### Page authors' cheat sheet

| Your endpoint shape | Effective limit |
|---|---|
| Any write (`POST`/`PUT`/`PATCH`/`DELETE`) not listed above | 300 / min / user |
| Any read (`GET`) | 600 / min / user |
| File upload `POST /api/system/storage/upload` | 30 / min / user |
| Excel export `POST /api/common/excel/export` | 5 / min / user **and** 200 / hour / tenant |
| Login | 20 / min / IP **and** 5 / 5 min / account |
| Captcha challenge (`GET`) | 60 / min / IP + 30 / 5 min / device |
| Captcha verify (`POST`) | 30 / min / IP + 20 / 5 min / account + 30 / 5 min / device |
| Captcha public config (`GET`) | 120 / min / IP |

Notes:

- **Page-config autosave** issues `POST /api/system/page-config/save` roughly every 600 ms of
  idle editing. Heavy editing draws on the 300/min write bucket and can return 429.
- The AI service has its **own** rate limiter in `bls-ai-service/src/middleware/rate-limit.ts`
  (`aiPerMinute`, Redis key `rate:ai:{userId}:{routeKey}`, window 60 s), applied to
  `/api/ai/chat/completions` and `/api/ai/ocr/recognize`. nginx additionally applies
  `limit_req zone=api burst=30 nodelay` on `/api/ai/`.
- Rate limits are keyed by an already-authenticated `userId`; for unauthenticated requests the
  `user` bucket degenerates to `anonymous` and is effectively shared — this is why login has a
  dedicated `ip` dimension and why the captcha endpoints additionally use `account` and `device`.
- `account` no longer collapses to a single `anon` bucket: when the body carries no `username` the
  key becomes `ip:{sha256(ip)[0:16]}`, so one anonymous caller cannot exhaust the bucket for
  everybody else.

---

## 4. Relationship with the event center

Sustained rate limiting is itself a risk signal. Rule `rule_rate_limit` in
`bls-server/src/security/event-center/risk-rules.ts` watches `RATE_LIMIT_EXCEEDED`
(60 s window, threshold 50, risk MEDIUM, action `ALERT_ONLY`).
See `00-common/05-security-log-and-event-center.md`.

---

## 5. Adding a rule

```ts
// bls-server/src/security/rate-limit/rules.ts
{ path: '/api/system/xxx/bulk', methods: ['POST'], dimensions: ['user'], limit: 10, windowSeconds: 60 },
```

Checklist:

1. Add the rule above the default rules (exact match wins anyway, but keep it readable).
2. Prefer `user` or `tenant` for authenticated endpoints, `ip` + `account` for login-like flows.
3. Also consider the replay rule (window should be shorter than the rate-limit window).
4. Update this table and the page document that owns the endpoint.
