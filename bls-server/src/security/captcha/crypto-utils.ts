/**
 * 人机验证密码学工具
 *
 * 硬性约束：
 *   - challengeId / nonce 使用 crypto.randomBytes，禁止 Math.random
 *   - 所有随机数（切片位置 / 旋转角）使用 crypto.randomInt
 *   - Token 比较使用 timingSafeEqual
 */
import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CaptchaTokenPayload } from './types';

/** 随机不透明 ID（base64url） */
export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** 随机整数 [min, max] */
export function randInt(min: number, max: number): number {
  if (max <= min) return min;
  return randomInt(min, max + 1);
}

/** 从数组中随机取一个元素 */
export function pickOne<T>(list: readonly T[]): T {
  return list[randInt(0, list.length - 1)];
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 拼接多个片段后取 sha256（用于绑定 hash，本身即可作为 Redis key 片段） */
export function hashParts(...parts: Array<string | null | undefined>): string {
  return sha256Hex(parts.map((p) => p ?? '').join('\u0000'));
}

/** 定长比较（timingSafeEqual），长度不同时也走固定时间路径后返回 false */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ab.length !== bb.length) {
    // 仍然执行一次同长度比较，避免通过响应时间推断长度
    const dummy = Buffer.alloc(ab.length);
    try { timingSafeEqual(ab, dummy); } catch { /* ignore */ }
    return false;
  }
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

/**
 * 签发 captchaToken：
 *   `<payloadB64url>.<hmacSigB64url>`
 * 服务端只保存 `sha256(token)`，Token 只可消费一次并绑定 challenge / 租户域名 / username / IP / UA。
 */
export function signCaptchaToken(payload: CaptchaTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export type ParsedToken =
  | { ok: true; payload: CaptchaTokenPayload }
  | { ok: false; error: 'malformed' | 'signature' };

/** 校验 captchaToken 签名（不查 Redis，仅验签与结构） */
export function parseCaptchaToken(token: string, secret: string): ParsedToken {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return { ok: false, error: 'malformed' };
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) return { ok: false, error: 'malformed' };
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = b64url(createHmac('sha256', secret).update(body).digest());
  if (!safeEqual(sig, expected)) return { ok: false, error: 'signature' };
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed || parsed.v !== 1 || typeof parsed.c !== 'string' || typeof parsed.t !== 'string' || typeof parsed.e !== 'number') {
      return { ok: false, error: 'malformed' };
    }
    return { ok: true, payload: parsed as CaptchaTokenPayload };
  } catch {
    return { ok: false, error: 'malformed' };
  }
}

/** Token hash（Redis 中唯一保存的形态） */
export function captchaTokenHash(token: string): string {
  return sha256Hex(token);
}

/** 数值裁剪 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 角度归一化到 (-180, 180] */
export function normalizeAngle(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** 角度差（绝对值，0-180） */
export function angleDelta(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}
