/**
 * 人机验证统一入口（公共，无需认证）
 *
 * Koa 是**整个系统唯一的业务 API 入口**，也是访问验证码服务的唯一出口：
 *
 *   GET  /api/captcha/config    公开配置（端点、提供方、是否启用 TIANAI）
 *   POST /api/captcha/generate  统一生成：ALTCHA 本地生成 / TIANAI 由 Koa 代理 Java 服务
 *   POST /api/captcha/verify    统一校验：通过后由 Koa 签发一次性 captchaTicket
 *
 * 浏览器**永不直连** TIANAI Java 服务（`http://tianai-captcha:8083` 只在内网可达）。
 *
 * 前端允许提交的字段：`scene` / `provider` / `username` / `payload`（ALTCHA）/ `sessionId` + `data`（TIANAI）。
 * 服务端决定、客户端提交无效的字段：阶段、ticket 内容、上游 challenge id、验证结论。
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { buildRequestMeta } from '../../shared/utils/request-meta';
import { resolveTenantDomain } from '../../shared/utils/domain';
import { extractRequestIp } from '../../shared/utils/ip';
import { getRequestContext } from '../../core/request-context';
import { ValidationError } from '../../core/errors';
import { captchaService, type CaptchaRequestMeta } from '../../security/captcha/service';
import type { CaptchaProviderName, CaptchaScene } from '../../security/captcha/providers/types';

const router = new Router({ prefix: '/captcha' });

/** 验证码接口禁止缓存 */
function noStore(ctx: Context): void {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  ctx.set('Pragma', 'no-cache');
  ctx.set('Expires', '0');
}

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

/** scene 只接受 LOGIN（预留扩展）；非法值按 LOGIN 处理而不是报错 */
function sceneOf(b: Record<string, unknown>): CaptchaScene {
  return str(b.scene, 32) === 'LOGIN' ? 'LOGIN' : 'LOGIN';
}

/** provider 只接受 ALTCHA / TIANAI；其它值忽略（由服务端按配置决定） */
function providerOf(b: Record<string, unknown>): CaptchaProviderName | undefined {
  const v = str(b.provider, 16)?.toUpperCase();
  if (v === 'ALTCHA' || v === 'TIANAI') return v;
  return undefined;
}

/** 与登录接口使用同一套 IP / 域名解析 */
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

// ==================== GET /config ====================
/**
 * 公开配置：只依赖**域名**（决定租户）与 username（仅用于策略相关日志）。
 *
 * ⚠ 刻意**不走 `buildRequestMeta()`**：它会解析客户端 IP，本机回环访问时还会去访问公网
 * 出口 IP 接口（每个 1s 超时）+ 读写 Redis。对登录页首屏这个接口是不必要的开销，
 * 冷启动时会把它从几毫秒拖到 2~3 秒，也会放大 dev proxy 超时（表现为 504）。
 * 下面用到的两个工具函数都是纯计算（不产生 I/O）。
 */
router.get('/config', async (ctx: Context) => {
  noStore(ctx);
  const meta: CaptchaRequestMeta = {
    domainName: resolveTenantDomain(ctx),
    username: str((ctx.query?.username ?? body(ctx).username) as unknown, 64) ?? '',
    ip: extractRequestIp(ctx) ?? 'unknown',
    userAgent: (ctx.headers['user-agent'] as string) ?? null,
    requestId: (ctx.get('X-Request-Id') as string) || null,
    route: ctx.path,
    method: ctx.method,
  };
  const data = await captchaService.getPublicConfig(meta);
  ctx.body = { code: 200, data, message: '操作成功' };
});

// ==================== POST /generate ====================
router.post('/generate', async (ctx: Context) => {
  noStore(ctx);
  const b = body(ctx);
  const meta = await requestMeta(ctx, str(b.username, 64));
  const result = await captchaService.generate({
    ...meta,
    scene: sceneOf(b),
    provider: providerOf(b),
  });
  ctx.body = { code: 200, data: result, message: '操作成功' };
});

// ==================== POST /verify ====================
router.post('/verify', async (ctx: Context) => {
  noStore(ctx);
  const b = body(ctx);
  const data = b.data;
  if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
    throw new ValidationError('验证数据格式不正确');
  }

  const meta = await requestMeta(ctx, str(b.username, 64));
  const result = await captchaService.verify({
    ...meta,
    scene: sceneOf(b),
    provider: providerOf(b),
    payload: b.payload ?? b.altcha ?? b.altchaPayload,
    sessionId: str(b.sessionId, 128),
    data: (data as Record<string, unknown>) ?? {},
  });
  ctx.body = { code: 200, data: result, message: '操作成功' };
});

export default router;
