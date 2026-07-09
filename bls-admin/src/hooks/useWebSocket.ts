import { useEffect, useRef, useState } from 'react';

export interface WebSocketState<TMessage> {
  connected: boolean;
  connecting: boolean;
  errorText: string | null;
  lastMessage: TMessage | null;
  reconnect: () => void;
}

export interface UseWebSocketOptions<TMessage> {
  url: string;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  tokenStorageKey?: string;
  enabled?: boolean;
  onOpen?: (socket: WebSocket) => void;
  onMessage?: (message: TMessage) => void;
}



export function useWebSocket<TMessage = unknown>({
  url,
  heartbeatIntervalMs = 15000,
  reconnectDelayMs = 3000,
  maxReconnectAttempts = 5,
  tokenStorageKey = 'token',
  enabled = true,
  onOpen,
  onMessage,
}: UseWebSocketOptions<TMessage>): WebSocketState<TMessage> {
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null);

  const clearTimers = () => {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
    retryTimerRef.current = null;
    heartbeatTimerRef.current = null;
  };

  const closeSocket = () => {
    manualCloseRef.current = true;
    clearTimers();
    socketRef.current?.close();
    socketRef.current = null;
  };

  const connect = () => {
    if (!enabled) {
      closeSocket();
      setConnected(false);
      setConnecting(false);
      setErrorText('WebSocket 已临时关闭');
      return;
    }

    clearTimers();
    setConnecting(true);
    setErrorText(null);
    const wsUrl = 'ws://localhost:6001/ws/realtime';

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    manualCloseRef.current = false;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnected(true);
      setConnecting(false);
      setErrorText(null);
      const rawToken = window.localStorage.getItem(tokenStorageKey);
      const token = rawToken?.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
      if (token) {
        socket.send(JSON.stringify({ type: 'auth', token }));
      }
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
      setConnecting(false);
      setErrorText('WebSocket 连接失败，正在重试...');
      console.error('[ws] error', { url: wsUrl, event });
    };

    socket.onclose = (event) => {
      setConnected(false);
      setConnecting(false);
      clearTimers();
      console.info('[ws] closed', { url: wsUrl, code: event.code, reason: event.reason, wasClean: event.wasClean });
      if (manualCloseRef.current || !enabled) return;
      const nextAttempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = nextAttempt;
      if (nextAttempt > maxReconnectAttempts) {
        setErrorText(`WebSocket 重连已达上限(${maxReconnectAttempts}次)`);
        console.warn('[ws] reconnect limit reached', { url: wsUrl, maxReconnectAttempts });
        return;
      }
      setErrorText(`WebSocket 已断开，${reconnectDelayMs}ms 后重试（${nextAttempt}/${maxReconnectAttempts}）`);
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
  };

  useEffect(() => {
    connect();
    return () => {
      closeSocket();
    };
  }, [url, enabled]);

  return { connected, connecting, errorText, lastMessage, reconnect: connect };
}
