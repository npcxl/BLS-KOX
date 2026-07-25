import { createHash } from 'node:crypto';
import { getRedisClient } from '../../../shared/utils/redis';
import { logger } from '../../../core/logger';
import { CALLBACK_TIME_WINDOW_MS, RELEASE_NONCE_PREFIX } from './release.constants';

const CALLBACK_SECRET = process.env.RELEASE_CALLBACK_SECRET || '';

/**
 * 验证回调请求签名
 *
 * 使用 HMAC-SHA256 签名：
 *   signature = HMAC-SHA256(RELEASE_CALLBACK_SECRET, timestamp + "\n" + nonce + "\n" + body)
 */
export function verifyCallbackSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): { valid: boolean; error?: string } {
  if (!CALLBACK_SECRET) {
    return { valid: false, error: 'RELEASE_CALLBACK_SECRET 未配置' };
  }

  // 1. 验证时间窗口
  const now = Date.now();
  const reqTime = Number(timestamp);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > CALLBACK_TIME_WINDOW_MS) {
    return { valid: false, error: `时间戳超出允许窗口 (${CALLBACK_TIME_WINDOW_MS / 1000}s)` };
  }

  // 2. 计算期望签名
  const payload = `${timestamp}\n${nonce}\n${body}`;
  const expected = createHash('sha256')
    .update(CALLBACK_SECRET)
    .update(payload)
    .digest('hex');

  // 3. 恒定时间比较
  if (expected !== signature) {
    return { valid: false, error: '签名验证失败' };
  }

  return { valid: true };
}

/**
 * 检查并记录 Nonce（防重放）
 */
export async function checkAndSaveNonce(nonce: string): Promise<{ ok: boolean; error?: string }> {
  const redis = await getRedisClient();
  if (!redis) {
    // Redis 不可用时跳过 Nonce 检查
    logger.warn('[ReleaseCallback] Redis 不可用，跳过 Nonce 检查');
    return { ok: true };
  }

  const key = `${RELEASE_NONCE_PREFIX}${nonce}`;
  const exists = await redis.get(key);
  if (exists) {
    return { ok: false, error: 'Nonce 已使用（重放攻击）' };
  }

  // 保存 Nonce，过期时间 = 时间窗口 + 1 分钟缓冲
  await redis.set(key, '1', 'PX', CALLBACK_TIME_WINDOW_MS + 60_000);
  return { ok: true };
}

/**
 * 验证回调请求完整流程
 */
export async function validateCallback(
  headers: Record<string, string>,
  body: string,
): Promise<{ valid: boolean; error?: string }> {
  const timestamp = headers['x-release-timestamp'] || '';
  const nonce = headers['x-release-nonce'] || '';
  const signature = headers['x-release-signature'] || '';

  if (!timestamp || !nonce || !signature) {
    return { valid: false, error: '缺少 X-Release-Timestamp / X-Release-Nonce / X-Release-Signature 头' };
  }

  // 1. 验证签名
  const sigResult = verifyCallbackSignature(timestamp, nonce, body, signature);
  if (!sigResult.valid) {
    logger.warn('[ReleaseCallback] 签名验证失败', { error: sigResult.error });
    return sigResult;
  }

  // 2. 防重放
  const nonceResult = await checkAndSaveNonce(nonce);
  if (!nonceResult.ok) {
    logger.warn('[ReleaseCallback] Nonce 重放', { nonce });
    return { valid: false, error: nonceResult.error || 'Nonce 已使用' };
  }

  return { valid: true };
}
