import type Koa from 'koa';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../../../shared/utils/jwt';
import { env } from '../../../config/env';
import { websocketConnections } from '../../../observability/metrics';

let lastWsCpu = process.cpuUsage();
let lastWsTime = Date.now();

function getSystemRealtimeInfo() {
  const now = Date.now();
  const elapsed = now - lastWsTime || 1;
  const cpu = process.cpuUsage(lastWsCpu);
  lastWsCpu = process.cpuUsage();
  lastWsTime = now;
  const cpuPercent = Math.round(((cpu.user + cpu.system) / (elapsed * 1000)) * 100);
  const mem = process.memoryUsage();
  const info = {
    cpu: Math.min(cpuPercent, 100),
    mem: { rss: Number(mem.rss), heapUsed: Number(mem.heapUsed), heapTotal: Number(mem.heapTotal) },
    uptime: Math.floor(process.uptime()),
  };
  // 验证可序列化
  try { JSON.stringify(info); } catch (e) { console.error('[realtime-ws] serialize failed', e); return {}; }
  return info;
}

const HEARTBEAT_INTERVAL = 15000;
const BROADCAST_INTERVAL = 3000;

type AuthMessage = { type: 'auth'; token: string };

function getWsEndpoint() {
  if (env.ws.url) return env.ws.url;
  const protocol = env.nodeEnv === 'production' ? 'wss' : 'ws';
  const host = env.ws.host || env.host;
  const port = env.ws.port || env.port;
  return `${protocol}://${host}:${port}${env.ws.path}`;
}

export function attachRealtimeWs(server: HttpServer, app: Koa): WebSocketServer | null {
  if (!env.ws.enabled) {
    console.warn('[realtime-ws] disabled by env.WS_ENABLED=false');
    return null;
  }

  const path = env.ws.path || '/ws/realtime';
  const wss = new WebSocketServer({ server, path });
  const clients = new Set<WebSocket>();

  console.info('[realtime-ws] starting', { endpoint: getWsEndpoint(), path, broadcastInterval: BROADCAST_INTERVAL, heartbeatInterval: HEARTBEAT_INTERVAL });

  const broadcast = () => {
    const info = getSystemRealtimeInfo();
    const payload = JSON.stringify({ type: 'realtime-info', data: info });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  };

  const heartbeat = () => {
    console.info('[realtime-ws] heartbeat', { clients: clients.size });
    for (const socket of clients) {
      const client = socket as WebSocket & { isAlive?: boolean };
      if (client.isAlive === false) {
        finalizeConnection(socket);
        socket.terminate();
        continue;
      }
      client.isAlive = false;
      socket.ping();
    }
  };

  const broadcastTimer = setInterval(broadcast, BROADCAST_INTERVAL);
  const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);

  /** 安全 dec Gauge（防止重复计数） */
  function finalizeConnection(socket: WebSocket) {
    const s = socket as WebSocket & { _metricsFinalized?: boolean };
    if (s._metricsFinalized) return;
    s._metricsFinalized = true;
    clients.delete(socket);
    websocketConnections.dec();
  }

  wss.on('connection', (socket, request) => {
    console.info('[realtime-ws] client connected', { url: request.url, remoteAddress: request.socket.remoteAddress });
    clients.add(socket);
    websocketConnections.inc();
    const client = socket as WebSocket & { isAlive?: boolean; isAuthed?: boolean };
    client.isAlive = true;
    client.isAuthed = false;

    socket.on('message', (raw) => {
      try {
        const text = raw.toString();
        const message = JSON.parse(text) as Partial<AuthMessage>;
        if (message.type === 'auth' && typeof message.token === 'string') {
          verifyToken(message.token);
          client.isAuthed = true;
          console.info('[realtime-ws] auth success', { remoteAddress: request.socket.remoteAddress });
          socket.send(JSON.stringify({ type: 'realtime-info', data: getSystemRealtimeInfo() }));
          return;
        }
      } catch (error) {
        console.warn('[realtime-ws] auth/message error', { error });
        finalizeConnection(socket);
        socket.close(1008, 'auth failed');
      }
    });

    socket.on('pong', () => { client.isAlive = true; });

    socket.on('close', () => finalizeConnection(socket));
    socket.on('error', () => finalizeConnection(socket));
  });

  wss.on('close', () => {
    clearInterval(broadcastTimer);
    clearInterval(heartbeatTimer);
    // 清理所有连接
    for (const s of clients) {
      (s as any)._metricsFinalized = true;
      websocketConnections.dec();
    }
    clients.clear();
  });

  return wss;
}
