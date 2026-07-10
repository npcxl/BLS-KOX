import type Koa from 'koa';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../../../shared/utils/jwt';
import { env } from '../../../config/env';
import os from 'os';
async function getSystemRealtimeInfo() { return { cpu: os.loadavg(), mem: process.memoryUsage(), uptime: process.uptime() }; }

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
    //console.info('[realtime-ws] broadcast', { clients: clients.size, cpuUsagePercent: info.cpuUsagePercent, usedMemoryPercent: info.usedMemoryPercent });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  };

  const heartbeat = () => {
    console.info('[realtime-ws] heartbeat', { clients: clients.size });
    for (const socket of clients) {
      const client = socket as WebSocket & { isAlive?: boolean };
      if (client.isAlive === false) {
        clients.delete(socket);
        socket.terminate();
        continue;
      }
      client.isAlive = false;
      socket.ping();
    }
  };

  const broadcastTimer = setInterval(broadcast, BROADCAST_INTERVAL);
  const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);

  wss.on('connection', (socket, request) => {
    console.info('[realtime-ws] client connected', { url: request.url, remoteAddress: request.socket.remoteAddress });
    clients.add(socket);
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
        socket.close(1008, 'auth failed');
      }
    });

    socket.on('pong', () => {
      client.isAlive = true;
    });

    socket.on('close', (code, reason) => {
      console.info('[realtime-ws] client disconnected', { code, reason: reason.toString('utf8') });
      clients.delete(socket);
    });

    socket.on('error', (error) => {
      console.error('[realtime-ws] socket error', error);
      clients.delete(socket);
    });
  });

  app.on('close', () => {
    clearInterval(broadcastTimer);
    clearInterval(heartbeatTimer);
    wss.close();
  });

  return wss;
}
