/**
 * 防重放攻击中间件（全局）
 */

import type { Context, Next } from 'koa';
import { env } from '../config/env';
import { ReplayProtectionService, SecurityError } from '../services/ReplayProtectionService';
import { SecurityErrorCode } from '../shared/constants/security-error-code';
import type { ReplayRule } from '../config/replay-protection';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../core/security-audit';
import { replayRejectedTotal, idempotencyConflictTotal } from '../observability/metrics';
import { getRequestContext } from '../core/request-context';
import { logger } from '../core/logger';

let _service: ReplayProtectionService | null = null;

export function getReplayService(): ReplayProtectionService { if (!_service) _service = new ReplayProtectionService(); return _service; }
export function setReplayRules(rules: ReplayRule[]): void { _service = new ReplayProtectionService(rules); }

export function replayProtectionMiddleware() {
  return async (ctx: Context, next: Next): Promise<void> => {
    if (!env.replay.enabled) { await next(); return; }

    const svc = getReplayService();
    const rule = svc.findRule(ctx.path, ctx.method);
    if (!rule || rule.mode === 'off') { await next(); return; }

    // 从统一 Request Context 获取身份信息（不重复解析 JWT）
    const reqCtx = getRequestContext();
    const tenantId = reqCtx?.tenantId ?? undefined;
    const userId = reqCtx?.userId ?? undefined;

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
        clientIp: reqCtx?.clientIp,
        body: (ctx.request as any).body,
        signSecret: env.replay.signSecret,
      });

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

      if (isIdempotent && rule.idempotent) {
        const idemKey = ctx.headers['idempotency-key'] as string;
        if (!idemKey) return;
        if (ctx.status >= 200 && ctx.status < 300) {
          await svc.saveIdempotentResult(idemKey, tenantId, userId, fingerprint, ctx.status, ctx.body ?? {}, rule.idempotentTtlSeconds ?? 3600);
        } else {
          await svc.releaseIdempotentLock(idemKey, tenantId, userId, lockToken ?? '');
        }
      }
    } catch (err) {
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
        const eventType = (eventMap[err.securityCode] ?? SecurityEventType.SECURITY_VALIDATION_FAILED) as any;
        const level = eventType === SecurityEventType.SIGNATURE_INVALID ? RiskLevel.CRITICAL : RiskLevel.HIGH;
        await writeSecurityLog({
          eventType, riskLevel: level,
          title: err.message,
          detail: { errorCode: err.securityCode, path: ctx.path, method: ctx.method },
          actor: actorFromCtx(ctx),
          route: ctx.path, method: ctx.method, source: 'replay',
        }).catch((e) => logger.error('安全日志写入失败', { error: String(e) }));

        // 指标采集
        if (err.securityCode === SecurityErrorCode.REPLAY_DETECTED) {
          replayRejectedTotal.inc({ reason: 'nonce' });
        } else if (err.securityCode === SecurityErrorCode.SIGNATURE_INVALID) {
          replayRejectedTotal.inc({ reason: 'signature' });
        } else {
          replayRejectedTotal.inc({ reason: 'timestamp' });
        }
        if (err.securityCode >= 40902 && err.securityCode <= 40904) {
          idempotencyConflictTotal.inc({ type: err.securityCode === 40903 ? 'processing' : err.securityCode === 40904 ? 'conflict' : 'missing_key' });
        }

        ctx.state.metricsRoute = rule.path; // 标准化 route label
        ctx.status = err.status;
        ctx.body = { code: err.securityCode, message: err.message, data: null };
        return;
      }
      throw err;
    }
  };
}
