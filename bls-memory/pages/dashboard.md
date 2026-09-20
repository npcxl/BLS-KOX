# Page — Dashboard (`/dashboard`)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

## 1. Summary

| Item | Value |
|---|---|
| Route | `/dashboard` (default landing; `/` redirects here) |
| Component | `bls-admin/src/pages/dashboard/index.tsx` |
| Purpose | Landing page: 4 metric cards, runtime status card, recent operation logs, quick-action shortcuts |
| Backend module | `bls-server/src/api/system/dashboard/index.ts` |
| Menu permission | none required (menu is synthesized in `app.tsx` `mapBackendMenus` with the title from `sys.dashboard.name`) |
| Shared docs | `00-common/00-architecture.md`, `03-rate-limiting.md` |

---

## 2. Frontend → API map

Service file: `bls-admin/src/services/ant-design-pro/api.ts`.

| User action | Service function | Method | Endpoint |
|---|---|---|---|
| Load metric cards (on mount) | `getDashboardStats()` | GET | `/api/system/dashboard/stats` |
| Load recent operations (on mount) | `getRecentLogs()` | GET | `/api/system/dashboard/recent-logs` |
| Runtime status (CPU / heap / uptime) | **not an HTTP call** — `useRealtime()` from `@/components/GlobalRealtimeProvider` (WebSocket `/ws/realtime`) | WS | `/ws/realtime` |
| Quick actions | `history.push(...)` to `/system/user`, `/system/dept`, `/system/role`, `/system/menu`, `/system/page-config`, `/system/log` | — | — |

`getSystemStatus()` (`/api/system/dashboard/system-status`) exists in the service file but is
**not used** by the page.

Metric cards: 用户总数 / 角色总数 / 菜单总数 / 操作日志, from
`stats.userCount / roleCount / menuCount / logCount`.
Runtime card: `rtInfo.cpu`, `rtInfo.mem.heapUsed / heapTotal`, `rtInfo.uptime`.

---

## 3. Backend endpoints

Module: `bls-server/src/api/system/dashboard/index.ts`, custom router, prefix `/system/dashboard`
(→ `/api/system/dashboard`). All endpoints use `jwtAuth()` only — **no `hasPerm`**, no Zod,
no CRUD factory.

### `GET /api/system/dashboard/stats`

- `tid = ctx.state.user.tenantId`.
- Parallel counts (`queryOne`):

| Metric | Query |
|---|---|
| `userCount` | `sys_user WHERE deleted=0 AND tenant_id=:tid` |
| `roleCount` | `sys_role WHERE deleted=0 AND tenant_id=:tid` |
| `menuCount` | `sys_menu WHERE status='0'` — **global, not tenant filtered** |
| `logCount` | `sys_operation_log` count — **global, not tenant filtered** |

### `GET /api/system/dashboard/system-status`

- Node process runtime only: `os.totalmem/freemem`, `process.cpuUsage()` delta → `cpuLoad`,
  `memUsage`, `uptime`, `nodeUptime`. Not called by the page (see §6).

### `GET /api/system/dashboard/recent-logs`

- Raw SQL: `SELECT title, username, business_type AS businessType, operator_time AS createTime
  FROM sys_operation_log ORDER BY operator_time DESC LIMIT 5`.
- **Not tenant filtered.**

Tables touched: `sys_user`, `sys_role`, `sys_menu`, `sys_operation_log`.

---

## 4. Security rules for this page

| Endpoint | Replay | Rate limit |
|---|---|---|
| `GET /stats`, `GET /recent-logs`, `GET /system-status` | `off` (all GET) | default read bucket `user` 600 / 60 s |
| WebSocket `/ws/realtime` | n/a | n/a |

No permission code is required. Tenant isolation applies only to `userCount` / `roleCount`.

---

## 5. Frontend-only validation

None — the page is read-only.

---

## 6. Known gaps / discrepancies

1. `menuCount` and `logCount` are **global** (no `tenant_id` filter). In a multi-tenant
   deployment a tenant sees platform-wide numbers. If tenant-scoped numbers are required:
   filter `sys_menu` is intentionally global, but `sys_operation_log` should be filtered by
   `tenant_id`; `recent-logs` likewise.
2. `getSystemStatus()` / `GET /system-status` are dead code — the page uses the realtime
   WebSocket context instead. Either wire the page to the HTTP endpoint or delete the endpoint.
3. The dashboard route has no `access` gating beyond authentication.

---

## 7. How to extend

- **Add a metric card**: extend `GET /stats` with a new count (remember the tenant filter for
  tenant tables, and think twice before exposing a global table count), then add a card in
  `dashboard/index.tsx`.
- **Make recent logs tenant aware**: add `.where('tenant_id','=',tid)` to the raw SQL.
- **Add a chart**: prefer a new dedicated endpoint (e.g. `/api/system/dashboard/trend`) rather
  than overloading `/stats`.
- Update this document.
