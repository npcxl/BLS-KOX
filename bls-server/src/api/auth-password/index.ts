/**
 * 认证闭环 —— 忘记密码 / 重置密码（阶段四）
 *
 * 路径：POST /api/auth/forgot-password、POST /api/auth/reset-password
 * 走纯自定义 Router 模式（default export），挂载在 /api/auth 前缀下。
 *
 * 安全要点：
 *   - 令牌只存 hash，单次使用，有有效期
 *   - 响应不区分“账号存在 / 不存在”，防止用户名、邮箱枚举
 *   - 重置成功后吊销该用户全部 Session 并使其他未消费令牌失效
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { z } from 'zod';
import { execute, queryOne } from '../../core/database';
import { ValidationError } from '../../core/errors';
import { passwordResetService } from '../../services/password-reset-service';
import { emailSender } from '../../services/email-sender';
import { hashPasswordCanonical } from '../../shared/utils/password';
import { sessionCenter } from '../../security/session/session-center';
import { buildRequestMeta } from '../../shared/utils/request-meta';
import { logger } from '../../core/logger';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../../core/security-audit';
import { findTenantByDomain, findTenantById, assertTenantUsable } from '../../services/tenant-lifecycle';
import { PLATFORM_TENANT_ID } from '../../shared/constants/tenant';

const router = new Router({ prefix: '/auth' });

/** 开发/测试环境可打开，用于在没有邮件通道时拿到令牌 */
const EXPOSE_TOKEN = (process.env.AUTH_EXPOSE_RESET_TOKEN ?? 'false') === 'true';

const forgotSchema = z.object({
  username: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().max(100).optional(),
}).refine((v) => !!(v.username || v.email), '需要提供 username 或 email');

const resetSchema = z.object({
  token: z.string().trim().min(10).max(500),
  newPassword: z.string().min(6, '新密码长度不能少于6位').max(100),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  return parsed.data;
}

/** 从请求 Host 解析租户（与登录一致，不信任客户端传入的 tenantId） */
async function resolveTenantId(domainName: string): Promise<string | null> {
  let tenant = await findTenantByDomain(domainName);
  if (!tenant && (domainName === 'localhost' || domainName === '127.0.0.1' || domainName === '::1')) {
    tenant = await findTenantById(PLATFORM_TENANT_ID);
  }
  if (!tenant) return null;
  try {
    assertTenantUsable(tenant);
  } catch {
    return null;
  }
  return tenant.tenantId;
}

/**
 * POST /auth/forgot-password
 *
 * 无论账号是否存在，都返回同样的成功响应（防枚举）。
 */
router.post('/forgot-password', async (ctx: Context) => {
  const body = parseOrThrow(forgotSchema, ctx.request.body ?? {});
  const meta = await buildRequestMeta(ctx);

  const data: Record<string, unknown> = { delivered: false, channel: 'none' };
  const respond = () => {
    ctx.body = { code: 200, data, message: '如果该账号存在，我们已发送重置邮件' };
  };

  try {
    const tenantId = await resolveTenantId(meta.domainName);
    if (!tenantId) { respond(); return; }

    let user: any = null;
    if (body.username) {
      user = await queryOne<any>(
        `SELECT user_id AS userId, username, email, status FROM sys_user
         WHERE tenant_id = :tid AND username = :un AND deleted = 0 LIMIT 1`,
        { tid: tenantId, un: body.username },
      );
    }
    if (!user && body.email) {
      user = await queryOne<any>(
        `SELECT user_id AS userId, username, email, status FROM sys_user
         WHERE tenant_id = :tid AND email = :em AND deleted = 0 LIMIT 1`,
        { tid: tenantId, em: body.email },
      );
    }

    // 账号不存在 / 已停用：静默返回一致响应
    if (!user || String(user.status) !== '0') { respond(); return; }

    const token = await passwordResetService.issue({
      tenantId,
      userId: String(user.userId),
      purpose: 'reset_password',
      clientIp: meta.loginIp,
      userAgent: meta.userAgent,
    });

    if (user.email) {
      const delivery = await emailSender.send({
        to: String(user.email),
        subject: 'BLS-KOX 密码重置',
        text: `请使用以下令牌重置密码（30 分钟内有效，仅可使用一次）：${token}`,
      });
      data.delivered = delivery.delivered;
      data.channel = delivery.channel;
      if (!delivery.delivered) data.reason = delivery.reason;
    } else {
      data.reason = 'NO_EMAIL_ON_FILE';
    }

    if (EXPOSE_TOKEN) {
      data.debugToken = token;
      data.delivered = true;
      data.channel = 'debug';
    }

    logger.info('[auth] password reset requested', {
      tenantId, userId: user.userId, delivered: data.delivered,
    });
  } catch (error) {
    // 不向客户端暴露内部错误细节，保持统一响应
    logger.error('[auth] forgot-password failed', { error: String(error) });
  }

  respond();
});

/**
 * POST /auth/reset-password
 *
 * 令牌一次性使用；成功后吊销该用户全部 Session。
 */
router.post('/reset-password', async (ctx: Context) => {
  const body = parseOrThrow(resetSchema, ctx.request.body ?? {});

  const consumed = await passwordResetService.consume(body.token, 'reset_password');
  if (!consumed) throw new ValidationError('重置链接无效或已过期');

  const hashed = await hashPasswordCanonical(body.newPassword);

  const result = await execute(
    `UPDATE sys_user
       SET password = :pwd, password_algorithm = 'argon2id', password_update_time = NOW()
     WHERE user_id = :uid AND tenant_id = :tid AND deleted = 0`,
    { pwd: hashed, uid: consumed.userId, tid: consumed.tenantId },
  );
  if (Number(result?.affectedRows ?? 0) === 0) {
    throw new ValidationError('重置链接无效或已过期');
  }

  // 改密后吊销全部会话 + 使其他未消费令牌失效
  await sessionCenter.revokeAll(consumed.tenantId, consumed.userId).catch(() => {});
  await passwordResetService.invalidateForUser(consumed.userId, 'reset_password').catch(() => {});

  await writeSecurityLog({
    eventType: SecurityEventType.PERM_CHANGE,
    riskLevel: RiskLevel.HIGH,
    title: `密码重置成功：${consumed.userId}`,
    detail: { tenantId: consumed.tenantId, userId: consumed.userId, channel: 'reset_password_token' },
    actor: { ...actorFromCtx(ctx), tenantId: consumed.tenantId, userId: consumed.userId },
    route: ctx.path, method: ctx.method, source: 'auth',
  }).catch(() => {});

  ctx.body = { code: 200, data: null, message: '密码重置成功，请重新登录' };
});

export default router;
