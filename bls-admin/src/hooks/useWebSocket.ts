import { useEffect, useRef, useState, useCallback } from 'react';
import { tokenStore } from '@/auth/token-store';
import { authEvents } from '@/auth/auth-events';

export interface WebSocketState<TMessage> {
  connected: boolean;
  connecting: boolean;
  errorText: string | null;
  lastMessage: TMessage | null;
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

/**
 * 构造 WebSocket URL
 *   - 开发环境：使用 dev proxy 目标
 *   - 生产环境：使用同源 wss://
 */
function buildWsUrl(path: string): string {
  if (typeof window === 'undefined') return '';

  const { protocol, hostname } = window.location;

  // 开发环境：Umi 代理到 localhost:6001
  if (process.env.NODE_ENV === 'development') {
    return `ws://localhost:6001${path}`;
  }

  // 生产环境：同源
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
  const manualCloseRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null);

  const wsUrl = buildWsUrl(url);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
    retryTimerRef.current = null;
    heartbeatTimerRef.current = null;
  }, []);

  const closeSocket = useCallback(() => {
    manualCloseRef.current = true;
    clearTimers();
    const sock = socketRef.current;
    socketRef.current = null;
    if (sock && sock.readyState !== WebSocket.CLOSED) {
      sock.close();
    }
  }, [clearTimers]);

  const sendAuth = useCallback((socket: WebSocket) => {
    const token = tokenStore.getAccessToken();
    if (token && socket.readyState === WebSocket.OPEN) {
      const bareToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      socket.send(JSON.stringify({ type: 'auth', token: bareToken }));
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current) {
      closeSocket();
      setConnected(false);
      return;
    }

    clearTimers();

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    manualCloseRef.current = false;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnected(true);
      sendAuth(socket);
      onOpen?.(socket);

      heartbeatTimerRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, heartbeatIntervalMs);

      console.info('[ws] connected', { url: wsUrl, heartbeatIntervalMs });
    };

    socket.onerror = (event) => {
      setConnected(false);
      console.debug('[ws] error', { url: wsUrl, event });
    };

    socket.onclose = (event) => {
      setConnected(false);
      clearTimers();
      console.debug('[ws] closed', { url: wsUrl, code: event.code, reason: event.reason, wasClean: event.wasClean });
      if (manualCloseRef.current || !enabledRef.current) return;
      const nextAttempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = nextAttempt;
      if (nextAttempt > maxReconnectAttempts) {
        return;
      }
      retryTimerRef.current = window.setTimeout(connect, reconnectDelayMs);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as TMessage;
        setLastMessage(message);
        onMessage?.(message);
      } catch (error) {
        setErrorText('WebSocket 消息解析失败');
        console.error('[ws] message parse failed', { url: wsUrl, data: event.data, error });
      }
    };
  }, [url, wsUrl, heartbeatIntervalMs, reconnectDelayMs, maxReconnectAttempts, sendAuth, closeSocket, clearTimers, onOpen, onMessage]);

  // Token 刷新后自动重新认证（不发重连，只发 auth 消息）
  useEffect(() => {
    if (!autoReauth) return;
    const handleTokenRefreshed = () => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        sendAuth(socket);
      }
    };
    authEvents.on('token-refreshed', handleTokenRefreshed);
    return () => {
      authEvents.off('token-refreshed', handleTokenRefreshed);
    };
  }, [autoReauth, sendAuth]);

  // 登出时关闭 WebSocket
  useEffect(() => {
    const handleLogout = () => {
      closeSocket();
    };
    authEvents.on('logout', handleLogout);
    return () => {
      authEvents.off('logout', handleLogout);
    };
  }, [closeSocket]);

  // enabled 变化时启动/停止连接（不依赖 connect 引用，避免无限重连）
  useEffect(() => {
    if (enabled) {
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      closeSocket();
    }
    return () => {
      closeSocket();
    };
    // connect / closeSocket 通过 ref 稳定引用，此处 intentional dependency on enabled only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { connected, connecting, errorText, lastMessage, reconnect: connect };
}
