/**
 * 防重放攻击中间件（全局）
 *
 * 注册位置：bodyParser 之后、router.routes() 之前
 * 执行顺序：
 *   errorHandler → helmet → cors → koaBody → bodyParser →
 *   tenantMiddleware → 本中间件 → router.routes（内含 jwtAuth → hasPerm → Controller）
 *
 * Controller 和 Service 不感知防重放逻辑。
 *
 * 对于签名接口，从 JWT token 中提取 userId/tenantId（不验证 session）。
 * 签名已包含 userId/tenantId，篡改会导致签名校验失败。
 */

import type { Context, Next } from 'koa';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ReplayProtectionService, SecurityError } from '../services/ReplayProtectionService';
import type { ReplayRule } from '../config/replay-protection';
import type { JwtPayload } from '../shared/types/current-user';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../core/security-audit';

let _service: ReplayProtectionService | null = null;

export function getReplayService(): ReplayProtectionService {
  if (!_service) _service = new ReplayProtectionService();
  return _service;
}

/** 设置自定义规则（启动时调用） */
export function setReplayRules(rules: ReplayRule[]): void {
  _service = new ReplayProtectionService(rules);
}

/** 从 Authorization header 提取 JWT payload（不解密 session，仅提取 userId/tenantId） */
function extractJwtPayload(authHeader?: string): { userId: string; tenantId: string } | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const raw = authHeader.slice(7);
    const payload = jwt.decode(raw) as Partial<JwtPayload> | null;
    if (payload?.userId && payload?.tenantId) {
      return { userId: payload.userId, tenantId: payload.tenantId };
    }
    return null;
  } catch {
    return null;
  }
}

export function replayProtectionMiddleware() {
  return async (ctx: Context, next: Next): Promise<void> => {
    // 全局开关
    if (!env.replay.enabled) {
      await next();
      return;
    }
    const svc = getReplayService();
    const rule = svc.findRule(ctx.path, ctx.method);
    if (!rule || rule.mode === 'off') {
      await next();
      return;
    }

    // 从 Authorization header 提取用户信息
    const jwtPayload = extractJwtPayload(ctx.headers.authorization);
    const tenantId = jwtPayload?.tenantId;
    const userId = jwtPayload?.userId;

    // 签名密钥：优先环境变量
    const signSecret = env.replay?.signSecret ?? process.env.API_SIGN_SECRET;

    let result: Awaited<ReturnType<typeof svc.check>> = {};

    try {
      result = await svc.check({
        path: ctx.path,
        method: ctx.method,
        timestamp: ctx.headers['x-timestamp'] as string | undefined,
        nonce: ctx.headers['x-nonce'] as string | undefined,
        signature: ctx.headers['x-signature'] as string | undefined,
        idempotencyKey: ctx.headers['idempotency-key'] as string | undefined,
        tenantId,
        userId,
        clientIp: (ctx.request.ip as string) || (ctx.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim(),
        body: (ctx.request as any).body,
        signSecret,
      });

      // 幂等返回缓存结果
      if (result.idempotentResult?.status === 'completed') {
        if (result.idempotentResult.cachedResponse) {
          try {
            ctx.body = JSON.parse(result.idempotentResult.cachedResponse);
          } catch {
            ctx.body = result.idempotentResult.cachedResponse;
          }
        }
        ctx.status = result.idempotentResult.cachedStatus ?? 200;
        return;
      }

      const isIdempotent = result.idempotentResult?.status === 'new';

      await next();

      // 成功后保存幂等结果
      if (isIdempotent && rule.idempotent) {
        const idemKey = ctx.headers['idempotency-key'] as string;
        if (idemKey && ctx.status >= 200 && ctx.status < 300) {
          await svc.saveIdempotentResult(
            idemKey, tenantId, userId,
            JSON.stringify(ctx.body ?? {}), ctx.status,
            rule.idempotentTtlSeconds ?? 3600,
          );
        }
      }
    } catch (err) {
      // 非安全错误 → 业务异常，释放幂等锁允许重试
      if (!(err instanceof SecurityError) && result?.idempotentResult?.status === 'new' && rule?.idempotent) {
        const idemKey = ctx.headers['idempotency-key'] as string;
        if (idemKey) await svc.releaseIdempotentLock(idemKey, tenantId, userId);
      }

      if (err instanceof SecurityError) {
        // 安全事件审计
        const eventMap: Record<number, SecurityEventType> = {
          40101: SecurityEventType.TIMESTAMP_EXPIRED,
          40102: SecurityEventType.TIMESTAMP_INVALID,
          40103: SecurityEventType.TIMESTAMP_EXPIRED,
          40104: SecurityEventType.NONCE_MISSING,
          40901: SecurityEventType.NONCE_REPLAY,
          40105: SecurityEventType.SIGNATURE_MISSING,
          40106: SecurityEventType.SIGNATURE_INVALID,
        };
        const eventType = eventMap[err.securityCode] ?? SecurityEventType.TIMESTAMP_EXPIRED;
        const riskLevel = eventType === SecurityEventType.SIGNATURE_INVALID ? RiskLevel.CRITICAL : RiskLevel.HIGH;
        await writeSecurityLog({
          eventType, riskLevel,
          title: err.message,
          detail: { errorCode: err.securityCode, path: ctx.path, method: ctx.method },
          actor: actorFromCtx(ctx),
          route: ctx.path, method: ctx.method, source: 'replay',
        });

        ctx.status = err.status;
        ctx.body = { code: err.securityCode, message: err.message, data: null };
        return;
      }
      throw err;
    }
  };
}
