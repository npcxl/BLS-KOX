import { getRequestContext } from './request-context';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const ctx = getRequestContext();
  const timestamp = new Date().toISOString();
  const base = {
    timestamp,
    level,
    service: 'bls-ai-service',
    requestId: ctx?.requestId ?? '-',
    traceId: ctx?.traceId ?? '-',
    tenantId: ctx?.tenantId ?? '-',
    userId: ctx?.userId ?? '-',
    clientIp: ctx?.clientIp ?? '-',
    message,
    ...meta,
  };
  return JSON.stringify(base);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(formatLog('error', message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', message, meta));
    }
  },
};
