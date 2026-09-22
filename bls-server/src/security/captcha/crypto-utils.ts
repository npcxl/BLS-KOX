/**
 * 人机验证密码学工具
 *
 * 方案切换到 ALTCHA 后，challenge 生成 / PoW 校验 / challenge 签名全部由官方 `altcha/lib`
 * 负责（见 `altcha.ts`），本文件只保留项目自身需要的少量工具：
 *   - sha256（Redis 中的一次性凭证一律只保存 hash，明文永不落库 / 永不写日志）
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

/**
 * captchaTicket hash —— Redis key / used-marker / 审计记录中唯一出现的形态。
 * 明文 captchaTicket 只存在于「签发响应」与「登录请求体」中，绝不写入 Redis key 或日志。
 */
export function captchaTicketHash(ticket: string): string {
  return sha256Hex(ticket);
}
