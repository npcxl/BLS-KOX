/**
 * 统一 Logger
 *
 * 开发环境：输出到 console
 * 生产环境：结构化 JSON 输出，默认关闭 debug
 *
 * 严禁记录：password、token、authorization、secret 等敏感字段
 */

import { env } from '../config/env';
import { getRequestContext } from './request-context';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'secret', 'accessKey',
  'secretKey', 'apiKey', 'signSecret', 'refreshToken'];

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = sanitize(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (level === 'debug' && env.isProduction) return;

  const ctx = getRequestContext();
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    requestId: ctx?.requestId,
    tenantId: ctx?.tenantId,
    userId: ctx?.userId,
    message,
    ...(meta ? sanitize(meta) : {}),
  };

  if (env.isProduction) {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method](`[${level.toUpperCase()}]`, message, meta ? sanitize(meta) : '');
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
