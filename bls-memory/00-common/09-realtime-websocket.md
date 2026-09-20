# 09 — Realtime WebSocket (shared)

> **Document version:** 1.0.0 · **Code version:** 1.0.0 · **Verified commit:** 0fc7c43 · **Last verified:** 2026-09-20

One WebSocket server, endpoint `/ws/realtime`, used today to push live system metrics to the
dashboard. It is **not** a generic pub/sub bus: there is no subscribe protocol, and the
ops-release channel push is currently broken.

Files: `bls-server/src/api/system/realtime/realtime.ws.ts`,
`bls-server/src/api/system/ops-release/release.ws.ts`,
`bls-admin/src/hooks/useWebSocket.ts`,
`bls-admin/src/components/GlobalRealtimeProvider.tsx`,
`bls-admin/config/proxy.ts`, `nginx.conf`.

---

## 1. Server

`attachRealtimeWs(server, app)` (called in `bls-server/src/app.ts` right after
`http.createServer`) attaches a `ws.WebSocketServer` to the existing HTTP server.

| Setting | Value |
|---|---|
| Path | `env.ws.path`, default `/ws/realtime` (`WS_PATH`) |
| Enable gate | `env.ws.enabled` (`WS_ENABLED`, default `true`) — when `false` it logs `[realtime-ws] disabled by env.WS_ENABLED=false` and returns `null` |
| Advertised endpoint | `env.ws.url` if set, else `${wss|ws}://${host}:${port}${path}` (`WS_URL`, `WS_HOST`, `WS_PORT`; protocol is `wss` in production) |
| `BROADCAST_INTERVAL` | `3000` ms |
| `HEARTBEAT_INTERVAL` | `15000` ms |
| Graceful shutdown | `app.ts` closes every client with code **`1001`** and reason `Server shutting down` |

`bls-server/src/api/system/realtime/index.ts` is an intentional stub
(`// WebSocket，路由由 app.ts 中 attachRealtimeWs 处理` + `export {}`), so the module does not
produce HTTP routes.

---

## 2. Wire protocol

### Client → server (only one message is understood)

```json
{ "type": "auth", "token": "<jwt-without-Bearer-prefix>" }
```

- On success the server sets `client.isAuthed = true` and immediately replies with one
  `realtime-info` frame.
- Any parse error or invalid token → the connection is finalised and closed with
  **`1008` / `auth failed`**.

⚠ The frontend also sends `{type:'ping', timestamp}` every `heartbeatIntervalMs`
(`useWebSocket.ts`), but the server has **no handler for `type:'ping'`** — it is silently
ignored. Keep-alive actually relies on the WS-level ping/pong below.

### Server → client

```json
{ "type": "realtime-info", "data": { "cpu": 12, "mem": { "rss": 0, "heapUsed": 0, "heapTotal": 0 }, "uptime": 1234 } }
```

- Pushed to every `OPEN` socket every **3 s**.
- Also sent once immediately after a successful `auth`.
- `getSystemRealtimeInfo()` returns exactly `cpu` (integer percent, clamped to 100),
  `mem.{rss,heapUsed,heapTotal}` (bytes) and `uptime` (seconds). It does **not** include
  hostname / platform / arch / load average / total memory.

### Transport-level

- The server pings each socket every 15 s; `pong` sets `isAlive = true`; a socket that missed a
  pong is `terminate()`d.
- Close codes in use: `1008` (auth failed), `1001` (server shutdown), `1000` (frontend manual
  close), `1011` (frontend treats as server error and does not retry).

### Authentication is not enforced on the broadcast

`client.isAuthed` is written but **never read**, so an unauthenticated client that completes the
WS handshake still receives `realtime-info` frames. Do not add secrets to this payload.

---

## 3. Ops-release channel (currently broken)

`bls-server/src/api/system/ops-release/release.ws.ts` intends to push release progress:

| Symbol | Intent |
|---|---|
| channel name | `` `ops:release:${taskId}` `` |
| wildcard | `ops:release:*` |
| `sendToChannel(taskId, data)` | send `JSON.stringify({channel, ...data})` to clients whose `channels` set contains the channel or the wildcard |
| `broadcastReleaseProgress(msg)` | send the raw message to all open clients |
| `subscribeChannel` / `unsubscribeChannel` | mutate a `Set<string>` on the client |
| message shape | `ReleaseProgressMessage` = `{type:'release_progress', taskId, status, stage, progress, message, timestamp}` |

**It is a no-op today:**

1. `getWsServer()` does `require('../../../system/realtime/realtime.ws')` — from
   `src/api/system/ops-release/` that resolves to `src/system/realtime/realtime.ws`, which does
   **not** exist. The `MODULE_NOT_FOUND` is swallowed by `catch { return null }`.
2. Even at the right path, `realtime.ws.ts` exports only `attachRealtimeWs`;
   **`getWsServer` is not exported anywhere**.
3. `subscribeChannel` is never called (no subscribe message exists), so `client.channels` is
   always empty.
4. Consequence: `sendToChannel(...)` calls in `release.service.ts` (progress updates, step
   changes, completion) are **silently dropped**. The Release Center still works because the page
   polls every 3–10 s.

Fixing it requires: export a `getWsServer()` (or a `sendToChannel` registry) from
`realtime.ws.ts`, correct the require path, add a `{type:'subscribe', channel}` message, and
grant/validate that the subscriber may see the channel.

---

## 4. Frontend

### `useWebSocket` (`bls-admin/src/hooks/useWebSocket.ts`)

| Option | Default | Notes |
|---|---|---|
| `url` | — | path, e.g. `/ws/realtime` |
| `heartbeatIntervalMs` | `15000` | sends `{type:'ping'}` (ignored by the server) |
| `reconnectDelayMs` | `3000` | |
| `maxReconnectAttempts` | `2` | |
| `autoReauth` | `true` | re-sends the `auth` frame |
| `enabled` | `true` | when false the socket is not opened |

- URL building (`buildWsUrl`): dev → `ws://localhost:${WS_PORT ?? 6001}${path}`;
  production → `${wss|ws}://${location.host}${path}` (same origin, nginx proxies).
- Auth frame: reads `tokenStore.getAccessToken()`, strips the `Bearer ` prefix.
- Reconnect: skipped on close codes `1000` (manual), `1008` (auth failed), `1011` (server error);
  otherwise retries up to `maxReconnectAttempts`.
- Reacts to global auth events: on `token-refreshed` it re-sends `auth` on the live socket; on
  `logout` it closes the socket.
- Returns `{connected, lastMessage, reconnect}`.

### `GlobalRealtimeProvider` / `useRealtime`

- Mounted in `rootContainer` (`bls-admin/src/app.tsx`) **inside** `TokenRefreshGuard`.
- Polls `tokenStore.getAccessToken()` every 3 s to derive `enabled: hasToken`.
- Subscribes with `url: '/ws/realtime'`, `autoReauth: true`.
- Context value: `{connected, info: lastMessage.type === 'realtime-info' ? lastMessage.data : null, reconnect}`.
- Consumers: `pages/dashboard/index.tsx` (`const {info: rtInfo} = useRealtime()`) renders
  `rtInfo.cpu`, `rtInfo.mem.heapUsed/heapTotal`, `rtInfo.uptime` — these **match** the backend
  payload.

### Proxying

| Layer | Rule |
|---|---|
| Dev (`bls-admin/config/proxy.ts`) | `'/ws/'` → `ws://localhost:6001`, `ws: true`, `changeOrigin: true` |
| Prod (`nginx.conf`) | `location /ws/ai` → `bls-ai-service:7201` (declared first, `proxy_read_timeout 360s`); `location /ws/` → `bls-server:7001` with `Upgrade`/`Connection "upgrade"`, `proxy_read_timeout 86400s` |
| CSP | `connect-src 'self' https: ws: wss:` |

---

## 5. Known gaps

1. **Broadcast is not auth-gated** (`isAuthed` written, never read).
2. **Ops-release WS push is dead** (wrong require path + missing `getWsServer` export + no
   subscribe protocol). The Release Center falls back to polling.
3. **No subscribe/channel protocol** for general use — only the (broken) ops helper.
4. Frontend `{type:'ping'}` is ignored by the server.
5. `GlobalRealtimeProvider`'s `RealtimeInfo` interface lists fields
   (`hostname`, `cpuUsagePercent`, `totalMemory`, …) that the backend never sends — type-only,
   no runtime effect, but misleading.
6. `components/DashboardRealtimeCard.tsx` consumes those non-existent fields and is
   **imported nowhere** (dead code).
7. `hooks/useAiStream.ts` opens a separate socket to `/ws/ai` and reads the token from
   `localStorage` directly, bypassing `tokenStore`; it has **no importer** (dead code). The AI
   workbench uses HTTP SSE instead.
8. `attachRealtimeWs(server, app)` ignores its `app` parameter.
9. No per-client rate limiting or message-size limit on inbound frames.

---

## 6. How to extend

- **Add a field to the broadcast payload**: extend `getSystemRealtimeInfo()` in
  `realtime.ws.ts` and the `RealtimeInfo` interface in `GlobalRealtimeProvider.tsx` **together**,
  then update `pages/dashboard.md`.
- **Add a channel/subscribe protocol**: handle `{type:'subscribe', channel}` in `realtime.ws.ts`,
  keep a `Map<channel, Set<client>>`, authorise the subscription from the JWT payload before
  adding the client, and expose `sendToChannel(channel, data)` for producers. Then fix
  `release.ws.ts` to use it.
- **Gate the broadcast on auth**: skip clients whose `isAuthed` is not `true`.
- **Handle `type:'ping'`**: reply with `{type:'pong'}` so the frontend heartbeat becomes
  meaningful (or drop the frontend heartbeat and rely on WS ping/pong only).
- **Delete dead code**: `DashboardRealtimeCard.tsx`, `hooks/useAiStream.ts`,
  `services/system/realtime.ts` (`fetchRealtimeInfo` — no importer; the HTTP realtime info
  endpoint does not exist on the server).
- Update this document and `CHANGELOG.md`.
