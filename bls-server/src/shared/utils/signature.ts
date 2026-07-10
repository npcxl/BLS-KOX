import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { stableStringify } from './stableStringify';

/** 构建签名原文 */
export function buildCanonicalPayload(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  tenantId: string;
  userId: string;
  body?: unknown;
}): string {
  const bodyHash = bodyHashHex(params.body);
  return [
    params.method.toUpperCase(),
    params.path,
    params.timestamp,
    params.nonce,
    params.tenantId || '000000',
    params.userId || 'anonymous',
    bodyHash,
  ].join('\n');
}

/** 对 Body 做稳定 SHA256，返回小写 hex */
export function bodyHashHex(body: unknown): string {
  const str = body != null ? stableStringify(body) : '';
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/** HMAC-SHA256 签名，返回小写 hex */
export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/** 安全比较两个签名 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
