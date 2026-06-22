import os from "node:os";

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

function getCpuUsagePercent(): number {
  const cpus = os.cpus();
  const total = cpus.reduce(
    (acc, cpu) => {
      const times = cpu.times;
      return acc + times.user + times.nice + times.sys + times.idle + times.irq;
    },
    0,
  );
  const idle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  return total > 0 ? Number(((1 - idle / total) * 100).toFixed(2)) : 0;
}

export function getSystemRealtimeInfo(): SystemRealtimeInfo {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage: os.loadavg().map((item) => Number(item.toFixed(2))),
    totalMemory,
    freeMemory,
    usedMemory,
    usedMemoryPercent: Number(((usedMemory / totalMemory) * 100).toFixed(2)),
    cpuUsagePercent: getCpuUsagePercent(),
    networkInterfaces: Object.values(os.networkInterfaces()).flat().filter(Boolean).length,
  };
}
