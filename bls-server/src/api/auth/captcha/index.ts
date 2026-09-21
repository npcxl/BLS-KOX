/**
 * 登录人机验证接口（公共，无需认证）—— 基于自托管 ALTCHA
 *
 *   GET  /api/auth/captcha/config     公开配置 + 本轮 ALTCHA 组件形态（invisible / visible）
 *   GET  /api/auth/captcha/challenge  ALTCHA challenge（**原样返回官方结构**，供 widget 直接消费）
 *   POST /api/auth/captcha/verify     服务端校验 ALTCHA payload → 签发一次性 captchaToken
 *
 * 说明：
 *   - `challenge` 必须不带 `{code,message,data}` 外层封装 —— 官方 widget 的 `challenge` 属性
 *     直接读取该 JSON（字段为 `parameters` / `signature`）。这是唯一一个不加封装的业务接口，
 *     与 `/api/openapi.json` 同类。
 *   - 其余接口统一响应 `Cache-Control: no-store`，不下发阈值、HMAC 密钥等内部信息。
 *   - 无论账号是否存在，响应结构完全一致，避免账号枚举。
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { buildRequestMeta } from '../../../shared/utils/request-meta';
import { getRequestContext } from '../../../core/request-context';
import { captchaService, type CaptchaRequestMeta } from '../../../security/captcha/service';
import type { CaptchaStage } from '../../../security/captcha/types';

const router = new Router({ prefix: '/auth/captcha' });

/** 验证码接口禁止缓存 */
function noStore(ctx: Context): void {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  ctx.set('Pragma', 'no-cache');
  ctx.set('Expires', '0');
}

/** 安全取值：只接受字符串，超长直接截断 */
function str(value: unknown, maxLength = 256): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  return v.length > maxLength ? v.slice(0, maxLength) : v;
}

function body(ctx: Context): Record<string, unknown> {
  const b = ctx.request.body;
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

/** 公共请求元信息（与登录接口使用同一套 IP / 域名解析，保证 hash 绑定一致） */
async function requestMeta(ctx: Context, username?: string): Promise<CaptchaRequestMeta> {
  const meta = await buildRequestMeta(ctx);
  const reqCtx = getRequestContext();
  return {
    domainName: meta.domainName ?? 'localhost',
    username: username ?? '',
    ip: meta.loginIp ?? reqCtx?.clientIp ?? 'unknown',
    userAgent: meta.userAgent,
    requestId: reqCtx?.requestId ?? meta.requestId ?? null,
    route: ctx.path,
    method: ctx.method,
  };
}

/** username 可从 query 或 body 提供 */
function usernameOf(ctx: Context): string | undefined {
  return str((ctx.query?.username ?? body(ctx).username) as unknown, 64);
}

// ==================== GET /config ====================
router.get('/config', async (ctx: Context) => {
  noStore(ctx);
  const meta = await requestMeta(ctx, usernameOf(ctx));
  const data = await captchaService.getPublicConfig(meta);
  ctx.body = { code: 200, data, message: '操作成功' };
});

// ==================== GET /challenge ====================
// 注意：返回官方 ALTCHA challenge 结构本体（无外层封装），widget `challenge` 属性直接消费。
router.get('/challenge', async (ctx: Context) => {
  noStore(ctx);
  const meta = await requestMeta(ctx, usernameOf(ctx));
  const challenge = await captchaService.createChallenge(meta);
  ctx.body = challenge;
});

// ==================== POST /verify ====================
router.post('/verify', async (ctx: Context) => {
  noStore(ctx);
  const b = body(ctx);
  const meta = await requestMeta(ctx, str(b.username, 64));
  const stage: CaptchaStage | undefined = str(b.stage) === 'visible' ? 'visible' : undefined;

  const result = await captchaService.verifyPayload({
    ...meta,
    payload: b.payload ?? b.altcha ?? b.altchaPayload,
    stage,
  });
  ctx.body = { code: 200, data: result, message: '操作成功' };
});

export default router;
