/**
 * 防重放攻击中间件（全局）
 *
 * 执行顺序：
 *   errorHandler → helmet → cors → bodyParser → requestContext → tenant → 本中间件 → router
 */

import type { Context, Next } from 'koa';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ReplayProtectionService, SecurityError } from '../services/ReplayProtectionService';
import type { ReplayRule } from '../config/replay-protection';
import type { JwtPayload } from '../shared/types/current-user';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../core/security-audit';
import { logger } from '../core/logger';

let _service: ReplayProtectionService | null = null;

export function getReplayService(): ReplayProtectionService {
  if (!_service) _service = new ReplayProtectionService();
  return _service;
}

export function setReplayRules(rules: ReplayRule[]): void {
  _service = new ReplayProtectionService(rules);
}

function extractJwtPayload(authHeader?: string): { userId: string; tenantId: string } | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const raw = authHeader.slice(7);
    const payload = jwt.decode(raw) as Partial<JwtPayload> | null;
    if (payload?.userId && payload?.tenantId) return { userId: payload.userId, tenantId: payload.tenantId };
    return null;
  } catch { return null; }
}

export function replayProtectionMiddleware() {
  return async (ctx: Context, next: Next): Promise<void> => {
    if (!env.replay.enabled) { await next(); return; }

    const svc = getReplayService();
    const rule = svc.findRule(ctx.path, ctx.method);
    if (!rule || rule.mode === 'off') { await next(); return; }

    const jwtPayload = extractJwtPayload(ctx.headers.authorization);
    const tenantId = jwtPayload?.tenantId;
    const userId = jwtPayload?.userId;
    const signSecret = env.replay?.signSecret ?? process.env.API_SIGN_SECRET;

    let result: Awaited<ReturnType<typeof svc.check>> = {};
    let fingerprint = '';

    try {
      result = await svc.check({
        path: ctx.path, method: ctx.method,
        timestamp: ctx.headers['x-timestamp'] as string | undefined,
        nonce: ctx.headers['x-nonce'] as string | undefined,
        signature: ctx.headers['x-signature'] as string | undefined,
        idempotencyKey: ctx.headers['idempotency-key'] as string | undefined,
        tenantId, userId,
        clientIp: (ctx.request.ip as string) || (ctx.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim(),
        body: (ctx.request as any).body,
        signSecret,
      });

      // 幂等返回缓存结果
      if (result.idempotentResult?.status === 'completed' && result.idempotentResult.cachedRecord) {
        const record = result.idempotentResult.cachedRecord;
        ctx.status = record.status ?? 200;
        ctx.body = record.body ?? {};
        return;
      }

      const isIdempotent = result.idempotentResult?.status === 'new';
      const lockToken = result.idempotentResult?.lockToken;
      if (isIdempotent) fingerprint = svc.buildFingerprint({ path: ctx.path, method: ctx.method, body: (ctx.request as any).body });

      await next();

      // 幂等结果处理
      if (isIdempotent && rule.idempotent) {
        const idemKey = ctx.headers['idempotency-key'] as string;
        if (!idemKey) return;

        if (ctx.status >= 200 && ctx.status < 300) {
          // 2xx → 保存 completed
          await svc.saveIdempotentResult(idemKey, tenantId, userId, fingerprint, ctx.status, ctx.body ?? {}, rule.idempotentTtlSeconds ?? 3600);
        } else {
          // 4xx / 5xx → 释放锁，允许重试
          await svc.releaseIdempotentLock(idemKey, tenantId, userId, lockToken ?? '');
        }
      }
    } catch (err) {
      // 非 SecurityError → 业务异常，释放幂等锁
      if (!(err instanceof SecurityError) && result?.idempotentResult?.status === 'new' && rule?.idempotent) {
        const idemKey = ctx.headers['idempotency-key'] as string;
        if (idemKey) await svc.releaseIdempotentLock(idemKey, tenantId, userId, result.idempotentResult?.lockToken ?? '');
      }

      if (err instanceof SecurityError) {
        const eventMap: Record<number, string> = {
          40101: SecurityEventType.TIMESTAMP_MISSING, 40102: SecurityEventType.TIMESTAMP_INVALID,
          40103: SecurityEventType.TIMESTAMP_EXPIRED, 40104: SecurityEventType.NONCE_MISSING,
          40901: SecurityEventType.NONCE_REPLAY, 40105: SecurityEventType.SIGNATURE_MISSING,
          40106: SecurityEventType.SIGNATURE_INVALID,
          40902: SecurityEventType.IDEMPOTENCY_KEY_MISSING,
          40903: SecurityEventType.IDEMPOTENCY_PROCESSING,
          40904: SecurityEventType.IDEMPOTENCY_CONFLICT,
        };
        const eventType = (eventMap[err.securityCode] as any) ?? SecurityEventType.SECURITY_VALIDATION_FAILED;
        const level = eventType === SecurityEventType.SIGNATURE_INVALID ? RiskLevel.CRITICAL : RiskLevel.HIGH;
        await writeSecurityLog({
          eventType: eventType as any, riskLevel: level,
          title: err.message,
          detail: { errorCode: err.securityCode, path: ctx.path, method: ctx.method },
          actor: actorFromCtx(ctx),
          route: ctx.path, method: ctx.method, source: 'replay',
        }).catch((e) => logger.error('安全日志写入失败', { error: String(e) }));

        ctx.status = err.status;
        ctx.body = { code: err.securityCode, message: err.message, data: null };
        return;
      }
      throw err;
    }
  };
}
