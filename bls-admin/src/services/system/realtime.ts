import { request } from '@umijs/max';

export interface SystemRealtimeInfo {
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

export async function fetchRealtimeInfo() {
  return request<{ code: number; data: SystemRealtimeInfo }>('/api/system/realtime/info');
}
