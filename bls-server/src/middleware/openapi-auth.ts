/**
 * P11: OpenAPI Auth — API Key + HMAC + Timestamp + Nonce
 *
 * 校验流程:
 *   1. X-Api-Key → 查找 api_key 对应 secret
 *   2. X-Timestamp → 5 分钟窗口内有效（防重放）
 *   3. X-Nonce → Redis 去重（防 Nonce 重放）
 *   4. X-Signature → HMAC-SHA256(method:path:timestamp:nonce:body) 校验
 */
import type { Context, Next } from 'koa';
import { createHmac } from 'crypto';
import { getDb } from '../core/database';
import { getRedisClient } from '../shared/utils/redis';
import { logger } from '../core/logger';

const NONCE_WINDOW_SECONDS = 300;

export function openApiAuth() {
  return async (ctx: Context, next: Next) => {
    const apiKey = ctx.get('X-Api-Key');
    const timestamp = ctx.get('X-Timestamp');
    const nonce = ctx.get('X-Nonce');
    const signature = ctx.get('X-Signature');

    if (!apiKey || !timestamp || !nonce || !signature) {
      ctx.status = 401;
      ctx.body = { code: 401, message: 'Missing openapi auth headers' };
      return;
    }

    // 1. Timestamp 防重放
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(ts) || Math.abs(now - ts) > NONCE_WINDOW_SECONDS) {
      ctx.status = 401;
      ctx.body = { code: 401, message: 'Timestamp expired or invalid' };
      return;
    }

    // 2. Nonce 去重
    const redis = getRedisClient();
    if (redis) {
      try {
        const exists = await redis.exists(`openapi:nonce:${nonce}`);
        if (exists) {
          ctx.status = 401;
          ctx.body = { code: 401, message: 'Nonce already used' };
          return;
        }
        await redis.set(`openapi:nonce:${nonce}`, '1', 'EX', NONCE_WINDOW_SECONDS);
      } catch { /* Redis 不可用时降级放行 */ }
    }

    // 3. API Key → Secret
    let secret: string | null = null;
    try {
      const db = await getDb();
      const row = await (db as any)
        .selectFrom('sys_api_key')
        .select('api_secret')
        .where('api_key', '=', apiKey)
        .where('status', '=', '0')
        .executeTakeFirst();
      if (row) secret = String(row.api_secret);
    } catch (err) {
      logger.error('[openapi-auth] db query failed', { error: String(err) });
    }

    if (!secret) {
      ctx.status = 403;
      ctx.body = { code: 403, message: 'Invalid API Key' };
      return;
    }

    // 4. HMAC 签名校验
    const method = ctx.method.toUpperCase();
    const path = (ctx as any).state?.originalPath ?? ctx.path;
    const body = ctx.request.rawBody ?? JSON.stringify(ctx.request.body ?? '');
    const signStr = `${method}:${path}:${timestamp}:${nonce}:${body}`;
    const expected = createHmac('sha256', secret).update(signStr).digest('hex');

    if (signature !== expected) {
      ctx.status = 403;
      ctx.body = { code: 403, message: 'Invalid signature' };
      return;
    }

    // 鉴权通过，注入 api key 信息
    ctx.state.openApi = { apiKey };
    await next();
  };
}
