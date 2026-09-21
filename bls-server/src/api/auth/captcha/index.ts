/**
 * 登录人机验证公共接口（无需认证）
 *
 *   GET  /api/auth/captcha/config           公开配置（仅 enabled / mode / secondaryTypes）
 *   POST /api/auth/captcha/challenge        创建 challenge（silent 或 secondary）
 *   POST /api/auth/captcha/silent/verify    第一层静默验证
 *   POST /api/auth/captcha/secondary/verify 第二层可视化验证（slider / rotate）
 *   GET  /api/auth/captcha/image/:imageId   验证码图片（no-store）
 *
 * 说明：
 *   - 全部响应 Cache-Control: no-store，验证码图片同样不可缓存；
 *   - 不返回阈值 / 内部规则 / 答案；
 *   - 无论账号是否存在，响应结构完全一致，避免账号枚举。
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { buildRequestMeta } from '../../../shared/utils/request-meta';
import { getRequestContext } from '../../../core/request-context';
import { captchaService, type CaptchaRequestMeta } from '../../../security/captcha/service';
import type { CaptchaStage } from '../../../security/captcha/types';

const router = new Router({ prefix: '/auth/captcha' });

/** 所有验证码接口禁止缓存 */
function noStore(ctx: Context): void {
  ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  ctx.set('Pragma', 'no-cache');
  ctx.set('Expires', '0');
}

/** 安全取值：只接受字符串 / 数字，超长直接截断，杜绝对象注入 */
function str(value: unknown, maxLength = 256): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  return v.length > maxLength ? v.slice(0, maxLength) : v;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
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

// ==================== GET /config ====================
router.get('/config', async (ctx: Context) => {
  noStore(ctx);
  const meta = await buildRequestMeta(ctx);
  const data = await captchaService.getPublicConfig(meta.domainName ?? 'localhost');
  ctx.body = { code: 200, data, message: '操作成功' };
});

// ==================== POST /challenge ====================
router.post('/challenge', async (ctx: Context) => {
  noStore(ctx);
  const b = body(ctx);
  const meta = await requestMeta(ctx, str(b.username, 64));
  const preferredStage: CaptchaStage | undefined = str(b.stage) === 'secondary' ? 'secondary' : undefined;

  const result = await captchaService.createChallenge(meta, preferredStage);
  ctx.body = {
    code: 200,
    data: result.challenge ? { enabled: true, ...result.challenge } : { enabled: false },
    message: '操作成功',
  };
});

// ==================== POST /silent/verify ====================
router.post('/silent/verify', async (ctx: Context) => {
  noStore(ctx);
  const b = body(ctx);
  const challengeId = str(b.challengeId, 128);
  const nonce = str(b.nonce, 128) ?? '';
  const meta = await requestMeta(ctx, str(b.username, 64));

  if (!challengeId) {
    ctx.body = { code: 400, message: '缺少 challengeId' };
    return;
  }

  const result = await captchaService.verifySilent({
    ...meta,
    challengeId,
    nonce,
    interactionSummary: b.interactionSummary,
    proof: b.proof,
    startedAt: num(b.startedAt),
    finishedAt: num(b.finishedAt),
  });
  ctx.body = { code: 200, data: result, message: '操作成功' };
});

// ==================== POST /secondary/verify ====================
router.post('/secondary/verify', async (ctx: Context) => {
  noStore(ctx);
  const b = body(ctx);
  const challengeId = str(b.challengeId, 128);
  const meta = await requestMeta(ctx, str(b.username, 64));

  if (!challengeId) {
    ctx.body = { code: 400, message: '缺少 challengeId' };
    return;
  }

  const rawAnswer = (b.answer && typeof b.answer === 'object' ? b.answer : {}) as Record<string, unknown>;
  const result = await captchaService.verifySecondary({
    ...meta,
    challengeId,
    nonce: str(b.nonce, 128),
    answer: { x: num(rawAnswer.x), angle: num(rawAnswer.angle) },
  });
  ctx.body = { code: 200, data: result, message: '操作成功' };
});

// ==================== GET /image/:imageId ====================
router.get('/image/:imageId', async (ctx: Context) => {
  noStore(ctx);
  const imageId = str(ctx.params.imageId, 128) ?? '';
  const svg = await captchaService.getImage(imageId);
  if (!svg) {
    ctx.status = 404;
    ctx.body = { code: 404, message: '验证码图片不存在或已过期' };
    return;
  }
  ctx.type = 'image/svg+xml; charset=utf-8';
  ctx.body = svg;
});

export default router;
