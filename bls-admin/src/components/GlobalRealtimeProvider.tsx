import { useWebSocket } from '@/hooks/useWebSocket';
import React, { createContext, useContext, useMemo } from 'react';

export interface RealtimeInfo {
  timestamp: string;
  hostname: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  loadAverage: number[];
  totalMemory: number;
  freeMemory: number;
  usedMemory: number;
  usedMemoryPercent: number;
  cpuUsagePercent: number;
  networkInterfaces: number;
}

interface RealtimeMessage {
  type: string;
  data: RealtimeInfo;
}

interface RealtimeContextValue {
  connected: boolean;
  connecting: boolean;
  errorText: string | null;
  info: RealtimeInfo | null;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function GlobalRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { connected, connecting, errorText, lastMessage, reconnect } = useWebSocket<RealtimeMessage>({
    url: '/ws/realtime',
    autoReauth: true,
    onMessage: () => {},
  });

  const value = useMemo<RealtimeContextValue>(() => ({
    connected,
    connecting,
    errorText,
    info: lastMessage?.type === 'realtime-info' ? lastMessage.data : null,
    reconnect,
  }), [connected, connecting, errorText, lastMessage, reconnect]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within GlobalRealtimeProvider');
  }
  return context;
}
