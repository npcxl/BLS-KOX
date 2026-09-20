# Page — Security Center (`/system/security`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/system/security` (icon `SafetyCertificateOutlined`) |
| Component | `bls-admin/src/pages/system/security/index.tsx` |
| Purpose | Security dashboard: stats cards, risk-rule table, recent security events, IP blacklist (add / unblock) |
| Backend module | `bls-server/src/api/system/security/index.ts` |
| Tables | `sys_security_log` (read), `sys_ip_blacklist` (read/write) |
| Redis | `security:blocked_ip:{ip}` |
| Shared docs | `00-common/01-redis.md`, `03-rate-limiting.md`, `05-security-log-and-event-center.md` |

This page is the **operator UI** for the event-center mechanisms described in
`00-common/05-security-log-and-event-center.md`.

---

## 2. Frontend → API map

All calls use `request` from `@umijs/max` directly (no service file).

| User action | Method | Endpoint |
|---|---|---|
| Load stats cards | GET | `/api/system/security/stats` |
| Load risk rules | GET | `/api/system/security/rules` |
| Recent security events table (`pageNum`, `pageSize`, filters) | GET | `/api/system/security/events` |
| IP blacklist table (`pageNum`, `pageSize`, `ip`) | GET | `/api/system/security/blacklist` |
| "添加IP" modal OK | POST | `/api/system/security/blacklist` body `{ipAddress, reason, expireAt?}` |
| 解封 (Popconfirm) | DELETE | `/api/system/security/blacklist/{record.id}` |

UI details:

- Stats cards: `24h 安全事件` = `stats.recentEvents`; `临时封禁 IP` = `stats.tempBlockedIps`;
  `黑名单 IP` = `stats.permBlockedIps`; `风险分布` = `stats.byRisk` entries rendered as Tags.
- `riskColorMap = { LOW:'green', MEDIUM:'orange', HIGH:'red', CRITICAL:'magenta' }`.
- Rules table columns: `name`, `eventTypes` (Tags), `threshold` (`${threshold} 次 /
  ${windowSeconds}s`), `riskLevel`, `actions.join(', ')`; `search={false}`, `pagination={false}`,
  `options={false}`.
- Events table: `createTime`, `eventType`, `title`, `riskLevel`, `username`, `clientIp`;
  `pagination={{defaultPageSize:15}}`.
- Blacklist table: `ipAddress`, `reason`, `source` (`auto` → `自动` Tag, else `手动` blue Tag),
  `expireAt`, `createBy`, 解封; search on `ip`.
- Add-IP modal: `ipAddress` (required), `reason` (TextArea), `expireAt` (DatePicker `showTime`,
  "留空=永久").
- **No UI** for unlock account, revoke session, edit/delete a rule, or export.

---

## 3. Backend endpoints

Module: custom router `prefix: '/system/security'`, table constant `T = 'sys_ip_blacklist'`.
No CRUD factory, no Zod — bodies are parsed manually.

| Method | Path | Permission | Behaviour |
|---|---|---|---|
| GET | `/api/system/security/stats` | `system:security:stats` | `tempBlockedIps` = `redis.keys('security:blocked_ip:*').length` (try/catch); `recentEvents` = `count(*) FROM sys_security_log WHERE create_time >= now-24h`; `permBlockedIps` = `count(*) FROM sys_ip_blacklist WHERE status='0'`; `byRisk` = group by `risk_level` over the last 24 h |
| GET | `/api/system/security/rules` | `system:security:stats` | Maps `DEFAULT_RULES` from `security/event-center/risk-rules.ts` to `{id, name, eventTypes, threshold, windowSeconds, riskLevel, actions, weight}` |
| GET | `/api/system/security/events` | `system:security:stats` | `sys_security_log`; filters `eventType =`, `riskLevel =`, `username LIKE`, `clientIp =` (exact), `keyword` → OR(`title LIKE`, `detail LIKE`); `ORDER BY create_time DESC`; `pageSize` max 100, default 20 |
| GET | `/api/system/security/blacklist` | `system:security:stats` | `sys_ip_blacklist WHERE status='0'`; optional `ip LIKE ip_address`, `source =`; `ORDER BY create_time DESC`; `pageSize` max 100, default 20 |
| POST | `/api/system/security/blacklist` | `system:security:blacklist:add` | `ip = (body.ipAddress ?? body.ip ?? '').trim()`; empty → `{code:400, message:'IP 地址不能为空'}`. Inserts `{id: snowflake, ip_address, reason, source:'manual', status:'0', expire_at, tenant_id: requireTenantId(), create_by: username}`. Mirrors to Redis `security:blocked_ip:{ip}` with `ttl = expireAt ? max(1, floor((expireAt-now)/1000)) : 3600`. Returns `{code:200, message:'IP 已加入黑名单'}` |
| DELETE | `/api/system/security/blacklist/:id` | `system:security:blacklist:remove` | Looks up the row by `id`; 404 → `{code:404, message:'记录不存在'}`; else `UPDATE sys_ip_blacklist SET status='1' WHERE id=?` **and** `redis.del('security:blocked_ip:'+row.ip_address)`; returns `{code:200, message:'IP 已解封'}` |

Menu seed: `bls-server/migrations/20260713_006_security_center_menu.sql`
(menu `000200` `/system/security`, buttons `000201` / `000202` / `000203`).

### Enforcement

`blockedIpMiddleware()` (global, `bls-server/src/security/event-center/ip-block-middleware.ts`)
reads the Redis key first, then `sys_ip_blacklist`, and returns
`403 {code:403, message:'IP 已被临时封禁' | 'IP 已被加入黑名单'}`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit | Permission |
|---|---|---|---|
| 4 GETs | off | read 600/60 | `system:security:stats` |
| `POST /blacklist` | default write nonce (120 s / 300 s) | write 300/60 | `system:security:blacklist:add` |
| `DELETE /blacklist/:id` | default write nonce | write 300/60 | `system:security:blacklist:remove` |

Tenant isolation:

- Only the **POST** enforces `requireTenantId()` (fail-closed).
- The GETs, the DELETE-by-id and both stats queries are **not tenant scoped** — the Security
  Center is effectively a platform-level console.
- `DELETE /blacklist/:id` does **not** verify that the row belongs to the caller's tenant.
- `hasPerm` cross-tenant detection is still active if the request carries a `tenantId`.

---

## 5. Frontend-only validation

- `ipAddress` required (placeholder `192.168.1.1`).
- `expireAt` optional ("留空=永久").

## 6. Backend-only rules

- IP must be a non-empty string — there is **no IP format validation** (an arbitrary string is
  accepted and would simply never match a real client IP).
- Blacklisting overwrites nothing: duplicate rows for the same IP are allowed.

---

## 7. Known gaps / discrepancies

1. **No IP format validation** on add. Add a validator (IPv4/IPv6/CIDR) before insert.
2. Dozens of `redis.keys('security:blocked_ip:*')` calls in `/stats` — acceptable on a small key
   space but prefer `SCAN` or a counter if the list grows.
3. `DELETE /blacklist/:id` lacks a tenant check and a permission-aware re-check of the row.
4. When the manual blacklist entry is created with no `expireAt`, the Redis TTL is only 3600 s
   while the DB row has `expire_at = NULL` (permanent). After the Redis key expires the DB check
   still blocks the IP, so behaviour is correct — but `stats.tempBlockedIps` then under-reports.
   Keep this in mind when reasoning about the counters.
5. No UI for unlocking accounts or revoking sessions even though the event center performs those
   actions. The user-module endpoints `GET /api/system/user/sessions/:userId` and
   `POST /api/system/user/kick` exist for session revocation.
6. `REVOKE_SESSION` / `REQUIRE_REAUTH` risk actions are declared but only log.

---

## 8. How to extend

- **Add IP validation**: validate in `POST /blacklist` (reject invalid IP/CIDR with a 400) and
  mirror it on the frontend.
- **Add session revocation UI**: reuse `GET /api/system/user/sessions/:userId` and
  `POST /api/system/user/kick` (permission `system:user:kick`).
- **Add rule editing**: persist rules in a table (e.g. `sys_risk_rule`) and load them in
  `collectEvent` instead of `DEFAULT_RULES`; add endpoints + permissions.
- **Make it tenant aware**: add a `tenant_id` filter to the event/blacklist/stats queries, or
  explicitly document it as a platform-only console and restrict the permission to `000000`.
- Update this document and `00-common/05-security-log-and-event-center.md` if the rules change.
