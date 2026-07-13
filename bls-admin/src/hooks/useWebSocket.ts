import { useEffect, useRef, useState, useCallback } from 'react';
import { tokenStore } from '@/auth/token-store';
import { authEvents } from '@/auth/auth-events';

export interface WebSocketState<TMessage> {
  connected: boolean;
  lastMessage: TMessage | null;
  /** 手动重连（重置重试计数器，立即尝试） */
  reconnect: () => void;
}

export interface UseWebSocketOptions<TMessage> {
  /** WebSocket 相对路径，如 '/ws/realtime'，自动拼接 ws:// 或 wss:// */
  url: string;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  /** 是否在 Token 刷新后自动重新认证 */
  autoReauth?: boolean;
  enabled?: boolean;
  onOpen?: (socket: WebSocket) => void;
  onMessage?: (message: TMessage) => void;
}

/** 构造 WebSocket URL */
function buildWsUrl(path: string): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname } = window.location;
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.WS_PORT ?? '6001';
    return `ws://localhost:${port}${path}`;
  }
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${hostname}${path}`;
}

export function useWebSocket<TMessage = unknown>({
  url,
  heartbeatIntervalMs = 15000,
  reconnectDelayMs = 3000,
  maxReconnectAttempts = 2,
  autoReauth = true,
  enabled = true,
  onOpen,
  onMessage,
}: UseWebSocketOptions<TMessage>): WebSocketState<TMessage> {
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null);

  // ====== stable refs for callbacks & options (avoid dep-array churn) ======
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const maxRetryRef = useRef(maxReconnectAttempts);
  maxRetryRef.current = maxReconnectAttempts;
  const retryDelayRef = useRef(reconnectDelayMs);
  retryDelayRef.current = reconnectDelayMs;
  const heartbeatRef = useRef(heartbeatIntervalMs);
  heartbeatRef.current = heartbeatIntervalMs;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // stable wsUrl (computed once, re-computed when url changes)
  const wsUrl = useRef(buildWsUrl(url));
  useEffect(() => { wsUrl.current = buildWsUrl(url); }, [url]);

  // ====== helpers ======
  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
  }, []);

  const closeSocket = useCallback(() => {
    clearTimers();
    const sock = socketRef.current;
    socketRef.current = null;
    if (sock) {
      // 1000 = normal closure; prevent onclose from scheduling retry
      try { sock.close(1000); } catch { /* already closed */ }
    }
    setConnected(false);
  }, [clearTimers]);

  const sendAuth = useCallback((socket: WebSocket) => {
    const token = tokenStore.getAccessToken();
    if (token && socket.readyState === WebSocket.OPEN) {
      const bareToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      socket.send(JSON.stringify({ type: 'auth', token: bareToken }));
    }
  }, []);

  // ====== connect (stable ref — only url changes rebuild it) ======
  const connect = useCallback(() => {
    if (!enabledRef.current) { closeSocket(); return; }

    clearTimers();
    // 防止旧 socket 残留
    if (socketRef.current) {
      try { socketRef.current.close(1000); } catch { /* ignore */ }
    }

    const socket = new WebSocket(wsUrl.current);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnected(true);
      sendAuth(socket);
      onOpenRef.current?.(socket);

      heartbeatTimerRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, heartbeatRef.current);

      console.info('[ws] connected', { url: wsUrl.current });
    };

    socket.onerror = () => {
      // 静默：失败由 onclose 统一处理，不触发 React 更新
      console.debug('[ws] error', { url: wsUrl.current });
    };

    socket.onclose = (event) => {
      setConnected(false);
      clearTimers(); // 包括心跳

      // 鉴权失败 (1008) / 服务异常 (1011) — 不重连，等 token 刷新后手动 reconnect
      if (event.code === 1008 || event.code === 1011) {
        console.debug('[ws] auth-fail or server error, stop', { url: wsUrl.current, code: event.code });
        return;
      }

      // 手动关闭 → 不重连
      if (event.code === 1000) return;

      // disabled → 不重连
      if (!enabledRef.current) return;

      const next = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = next;
      if (next > maxRetryRef.current) {
        console.debug('[ws] retry exhausted', { url: wsUrl.current, max: maxRetryRef.current });
        return;
      }
      retryTimerRef.current = setTimeout(connect, retryDelayRef.current);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as TMessage;
        setLastMessage(message);
        onMessageRef.current?.(message);
      } catch (error) {
        console.error('[ws] message parse failed', { url: wsUrl.current, data: event.data, error });
      }
    };
  }, [url, closeSocket, clearTimers, sendAuth]); // 不依赖 enabled/maxRetry/etc，仅 url 变化重建

  // ====== effects ======

  // enabled 变化 → 启动 或 停止
  useEffect(() => {
    if (enabled) {
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      closeSocket();
    }
    return () => { closeSocket(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Token 刷新后自动重新认证（不发重连，只发 auth 消息）
  useEffect(() => {
    if (!autoReauth) return;
    const handler = () => {
      const sock = socketRef.current;
      if (sock?.readyState === WebSocket.OPEN) sendAuth(sock);
    };
    authEvents.on('token-refreshed', handler);
    return () => { authEvents.off('token-refreshed', handler); };
  }, [autoReauth, sendAuth]);

  // 登出 → 关闭
  useEffect(() => {
    const handler = () => closeSocket();
    authEvents.on('logout', handler);
    return () => { authEvents.off('logout', handler); };
  }, [closeSocket]);

  // ====== reconnect（重置计数器，立即尝试） ======
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  return { connected, lastMessage, reconnect };
}
