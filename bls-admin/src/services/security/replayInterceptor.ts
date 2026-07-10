/**
 * 防重放请求拦截器
 *
 * 自动为每个请求添加 X-Timestamp、X-Nonce。
 * 签名模式（X-Signature）仅用于 Server-to-Server 场景，
 * 普通浏览器前端不使用 HMAC。
 *
 * 使用方式（在 app.tsx 或 requestConfig.ts 中注册）：
 *
 *   import { buildReplayHeaders } from '@/services/security/replayInterceptor';
 *
 *   requestInterceptors: [
 *     (config) => {
 *       const headers = buildReplayHeaders({
 *         method: config.method ?? 'GET',
 *         url: config.url ?? '',
 *         body: config.data,
 *       });
 *       config.headers = { ...config.headers, ...headers };
 *       return config;
 *     },
 *   ],
 */

import { createHash, createHmac } from 'crypto';

function randomNonce(): string {
  // crypto.randomUUID() → 36 字节，足够
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // 降级
  return Math.random().toString(36).substring(2, 18) + Date.now().toString(36);
}

function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export interface ReplayHeadersOptions {
  method: string;
  url: string;
  body?: unknown;
  /** 仅 Server-to-Server 场景使用，浏览器前端不传 */
  secret?: string;
}

export function buildReplayHeaders(options: ReplayHeadersOptions): Record<string, string> {
  const method = options.method.toUpperCase();
  // 提取 path（去除 query string）
  const urlPath = options.url.split('?')[0] ?? '/';
  const timestamp = String(Date.now());
  const nonce = randomNonce();

  const headers: Record<string, string> = {
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
  };

  // 签名模式：仅服务端有 secret 时使用
  if (options.secret) {
    const bodyStr = options.body != null ? JSON.stringify(options.body, Object.keys(options.body ?? {}).sort()) : '';
    const bodyHash = sha256hex(bodyStr);
    const canonical = [
      method,
      urlPath,
      timestamp,
      nonce,
      '000000',        // tenantId（服务端调用时固定平台租户）
      'system',        // userId（服务端调用时用 system 标识）
      bodyHash,
    ].join('\n');
    const sig = createHmac('sha256', options.secret).update(canonical, 'utf8').digest('hex');
    headers['X-Signature'] = sig;
  }

  return headers;
}

/**
 * 生成幂等 Key（UUID），调用方自行管理重试逻辑
 */
export function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
}
