# 05 — Security Log & Event Center (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Last verified:** 2026-09-20

This is what makes the **Security Center** page (`/system/security`) and the
**Security Log** page (`/system/log/security`) show data.

Relevant files:

| Concern | File |
|---|---|
| Security log writer + event types + risk levels | `bls-server/src/core/security-audit.ts` |
| Login/operation/upload audit writers | `bls-server/src/core/audit.ts` |
| SQL error audit | `bls-server/src/core/sql-audit.ts` |
| Event center (aggregation + actions) | `bls-server/src/security/event-center/event-center.ts` |
| Risk rules | `bls-server/src/security/event-center/risk-rules.ts` |
| IP block middleware | `bls-server/src/security/event-center/ip-block-middleware.ts` |
| Security Center API | `bls-server/src/api/system/security/index.ts` |
| Log Center API | `bls-server/src/api/system/log/index.ts` |

---

## 1. Event types (`SecurityEventType`)

```text
LOGIN_FAILED            LOGIN_BRUTE_FORCE       TOKEN_EXPIRED
TOKEN_INVALID           PERMISSION_DENIED       CROSS_TENANT_ACCESS
TIMESTAMP_MISSING       TIMESTAMP_INVALID       TIMESTAMP_EXPIRED
NONCE_MISSING           NONCE_REPLAY            SIGNATURE_MISSING
SIGNATURE_INVALID       IDEMPOTENCY_KEY_MISSING IDEMPOTENCY_PROCESSING
IDEMPOTENCY_CONFLICT    RATE_LIMIT_EXCEEDED     FREQUENCY_LIMIT
BATCH_EXPORT            ROLE_CHANGE             PERM_CHANGE
REFRESH_TOKEN_REUSE     API_KEY_CREATED         API_KEY_REVOKED
SENSITIVE_DATA_ACCESS   SECURITY_VALIDATION_FAILED
```

## 2. Risk levels and default mapping (`EVENT_RISK`)

`LOW | MEDIUM | HIGH | CRITICAL`

| Event | Default risk |
|---|---|
| `LOGIN_FAILED` | LOW |
| `LOGIN_BRUTE_FORCE` | HIGH |
| `TOKEN_INVALID` | MEDIUM |
| `CROSS_TENANT_ACCESS` | HIGH |
| `NONCE_REPLAY` | HIGH |
| `SIGNATURE_INVALID` | CRITICAL |
| `RATE_LIMIT_EXCEEDED` | HIGH |
| `PERM_CHANGE` | HIGH |
| `SENSITIVE_DATA_ACCESS` | CRITICAL |
| `SECURITY_VALIDATION_FAILED` | MEDIUM |

`writeSecurityLog()` also:

- **redacts** sensitive keys (`password`, `oldPassword`, `newPassword`, `token`, `accessToken`,
  `refreshToken`, `authorization`, `secret`, `apiKey`, `apiSecret`, `signSecret`, `idCard`,
  `idNumber`, `bankCard`, `bankAccount`, `creditCard`) → `[REDACTED]`,
- truncates strings > 500 chars to `...[TRUNCATED]` and depth > 3 to `[NESTED]`,
- emits Prometheus counters (`securityEventsTotal`, `crossTenantAccessTotal`,
  `loginFailedTotal`, `refreshReuseDetectedTotal`),
- publishes the event to the external event service,
- calls `collectEvent()` (event center) **only if** `source !== 'event-center'` and
  `clientIp !== 'unknown'` (loop guard).

`actorFromCtx(ctx)` builds the actor from the verified request context — it never trusts a
client-supplied `x-tenant-id`.

---

## 3. Event center — automatic risk handling

`collectEvent({eventType, ip, tenantId, userId})`:

1. Aggregate `sys_security_log` rows for the same `client_ip` in a 300 s window, grouped by
   `event_type`, then add +1 for the current event.
2. Evaluate with `evaluateRisk(stats, DEFAULT_RULES)`
   (`score = min(100, (totalCount / threshold) * weight * 10)`) and `getOverallRisk()`
   (CRITICAL if any CRITICAL or average ≥ 90; ≥70 HIGH; ≥40 MEDIUM; else LOW).
3. If `overall.critical` or `score >= 70` → `executeActions()`.

### Risk rules (`DEFAULT_RULES`)

| ID | Name | Event types | Window | Threshold | Risk | Actions | Weight |
|---|---|---|---|---|---|---|---|
| `rule_login_brute_force` | Login brute force | `LOGIN_FAILED` | 300 s | 20 | HIGH | `BLOCK_IP`, `LOCK_ACCOUNT` | 8 |
| `rule_refresh_reuse` | Refresh token reuse | `REFRESH_TOKEN_REUSE` | 3600 s | 1 | CRITICAL | `REVOKE_ALL_SESSIONS` | 10 |
| `rule_cross_tenant` | Cross-tenant access | `CROSS_TENANT_ACCESS` | 3600 s | 1 | CRITICAL | `ALERT_ONLY` | 9 |
| `rule_signature_invalid` | Repeated bad signatures | `SIGNATURE_INVALID` | 60 s | 5 | HIGH | `BLOCK_IP` | 7 |
| `rule_replay_attack` | Replay attack | `NONCE_REPLAY`, `REPLAY_DETECTED` | 60 s | 10 | HIGH | `BLOCK_IP` | 8 |
| `rule_rate_limit` | High-frequency limiting | `RATE_LIMIT_EXCEEDED` | 60 s | 50 | MEDIUM | `ALERT_ONLY` | 4 |

### Actions (`executeActions`)

| Action | Effect |
|---|---|
| `ALERT_ONLY` | `logger.warn('[event-center] ALERT', …)` |
| `BLOCK_IP` | `redis.set('security:blocked_ip:'+ip, '1', 'EX', 3600)` + `RATE_LIMIT_EXCEEDED` log titled `自动封禁 IP：<ip>` |
| `LOCK_ACCOUNT` | `UPDATE sys_user SET status = 1 WHERE user_id=? AND tenant_id=?` + `SECURITY_VALIDATION_FAILED` log titled `自动锁定账户：<userId>` |
| `REVOKE_ALL_SESSIONS` | `sessionCenter.revokeAll(tenantId, userId)` + `TOKEN_INVALID` log titled `吊销全部会话：<userId>` |
| `REVOKE_SESSION`, `REQUIRE_REAUTH` | declared but **not implemented** (log only) |

`getSecurityStats(tenantId)` exists but the Security Center computes its own stats.

---

## 4. IP blocking middleware

`blockedIpMiddleware()` runs globally (after replay protection, before rate limiting):

1. Normalise the IP (strip `::ffff:`).
2. Redis `EXISTS security:blocked_ip:{ip}` → `403 {code:403, message:'IP 已被临时封禁'}`.
3. Else query `sys_ip_blacklist WHERE ip_address=? AND status='0' AND (expire_at IS NULL OR expire_at > now)`
   → `403 {code:403, message:'IP 已被加入黑名单'}`.

Writers of the block state:

- event center `BLOCK_IP` (TTL 3600 s),
- manual blacklist via Security Center `POST /api/system/security/blacklist`
  (TTL = remaining seconds until `expireAt`, or 3600 s when no expiry),
- unblock via `DELETE /api/system/security/blacklist/:id` (also deletes the Redis key).

---

## 5. Tables

| Table | Written by | Read by |
|---|---|---|
| `sys_security_log` | `writeSecurityLog()` (replay, permission, auth, event center) | `/api/system/log/security`, `/api/system/security/events`, `/api/system/security/stats` |
| `sys_login_log` | `writeLoginLog()` in `core/audit.ts` (⚠ **currently not called by the login flow** — login publishes events to the event service instead) | `/api/system/log/login` |
| `sys_operation_log` | audit writer in `core/audit.ts` | `/api/system/log/operation`, `/api/system/dashboard/recent-logs` |
| `sys_upload_audit` | storage upload flow | `/api/system/log/upload` |
| `sys_sql_audit` | `writeSqlError()` in `core/sql-audit.ts` (fire-and-forget raw pool, bypasses the audit hook to avoid recursion) | `/api/system/log/sql-audit` |
| `sys_ip_blacklist` | Security Center API | Security Center list/stats, IP block middleware |

⚠ Known schema discrepancy: `sql/Init.sql` defines `sys_security_log` with PK `id` and **no
`log_id` / `source` columns**, while `writeSecurityLog()` inserts `log_id` and `source`, and the
frontend uses `rowKey="logId"`. Verify the live schema (`ALTER TABLE` or migration) before
debugging this page. No migration in the repo adds those columns.

---

## 6. Audit helpers (non-security)

- `core/audit.ts` — `writeLoginLog(...)`, `writeOperationLog(...)`, `writeUploadAudit(...)`.
  All are fire-and-forget inserts into the respective `sys_*_log` tables.
- `core/sql-audit.ts` — `writeSqlError(operation, sql, error)` records failing SQL only
  (`query`, `query_one`, `execute`, `transaction`), truncating SQL to 10 000 chars and the
  error to 2 000 chars.
- Login activity is currently published as `LOGIN_SUCCESS` / `LOGIN_FAILED` events to
  `bls-server/src/services/event-client` (external event service), **not** written to
  `sys_login_log` by the auth module. So local brute-force aggregation (which relies on
  `LOGIN_FAILED` *security* logs) only triggers if a `LOGIN_FAILED` security log is written
  somewhere else.

---

## 7. How to add a security event

1. Add the member to `SecurityEventType` in `core/security-audit.ts`.
2. Add the default risk to `EVENT_RISK`.
3. If it should trigger automatic action, add a rule to `DEFAULT_RULES` in
   `security/event-center/risk-rules.ts`.
4. Call `writeSecurityLog({eventType, riskLevel, title, detail, actor, route, method, source})`
   from the relevant place.
5. Never log raw secrets/passwords — rely on `sanitize()`, and prefer not to pass them at all.
