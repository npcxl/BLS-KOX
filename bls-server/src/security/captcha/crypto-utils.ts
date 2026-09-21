/**
 * 人机验证密码学工具
 *
 * 方案切换到 ALTCHA 后，challenge 生成 / PoW 校验 / challenge 签名全部由官方 `altcha/lib`
 * 负责（见 `altcha.ts`），本文件只保留项目自身需要的少量工具：
 *   - captchaToken 的 sha256（Redis 只保存 hash）
 *   - 定长比较（timingSafeEqual）
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 定长比较（timingSafeEqual），长度不同时也走固定时间路径后返回 false */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ab.length !== bb.length) {
    const dummy = Buffer.alloc(ab.length);
    try { timingSafeEqual(ab, dummy); } catch { /* ignore */ }
    return false;
  }
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

/** captchaToken hash —— Redis 中唯一保存的形态（明文 Token 永不落库、永不写日志） */
export function captchaTokenHash(token: string): string {
  return sha256Hex(token);
}
