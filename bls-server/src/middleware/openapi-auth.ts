/**
 * openApiAuth — 外部/合作方 API 鉴权（阶段六重写）
 *
 * 流程：
 *   1. 必填头：`X-Api-Key` / `X-Timestamp` / `X-Nonce` / `X-Signature`
 *   2. Timestamp 5 分钟窗口
 *   3. Nonce 去重（Redis SET NX）—— **Redis 不可用时 fail-closed（503），绝不降级放行**
 *   4. API Key 解析：状态 / 撤销 / 有效期 / key_hash
 *   5. 租户可用性（阶段一：停用 / 过期租户拒绝）
 *   6. HMAC-SHA256 签名，`timingSafeEqual` 常量时间比对
 *   7. scope 校验（GET/HEAD → read，其余 → write）
 *   8. 把 **可信 tenantId** 注入 request context，供下游业务与审计使用
 */
import type { Context, Next } from 'koa';
import { createHmac } from 'crypto';
import { getRedisClient } from '../shared/utils/redis';
import { logger } from '../core/logger';
import { apiKeyService, parseScopes, scopesAllow, timingSafeEqualString, type ApiKeyScope } from '../services/api-key-service';
import { assertTenantActive } from '../services/tenant-lifecycle';
import { setRequestContext } from '../core/request-context';
import { writeSecurityLog, SecurityEventType, RiskLevel, actorFromCtx } from '../core/security-audit';

const NONCE_WINDOW_SECONDS = 300;

function deny(ctx: Context, status: number, message: string): void {
  ctx.status = status;
  ctx.body = { code: status, message };
}

export function openApiAuth() {
  return async (ctx: Context, next: Next): Promise<void> => {
    const apiKey = ctx.get('X-Api-Key');
    const timestamp = ctx.get('X-Timestamp');
    const nonce = ctx.get('X-Nonce');
    const signature = ctx.get('X-Signature');

    if (!apiKey || !timestamp || !nonce || !signature) {
      deny(ctx, 401, 'Missing openapi auth headers');
      return;
    }

    // 1. Timestamp 防重放
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(ts) || Math.abs(now - ts) > NONCE_WINDOW_SECONDS) {
      deny(ctx, 401, 'Timestamp expired or invalid');
      return;
    }

    // 2. Nonce 去重 —— fail-closed
    const redis = getRedisClient();
    if (!redis) {
      logger.error('[openapi-auth] redis unavailable, refusing request (fail-closed)', { path: ctx.path });
      deny(ctx, 503, 'Nonce store unavailable');
      return;
    }
    try {
      const accepted = await redis.set(`openapi:nonce:${nonce}`, '1', 'EX', NONCE_WINDOW_SECONDS, 'NX');
      if (accepted !== 'OK') {
        await writeSecurityLog({
          eventType: SecurityEventType.NONCE_REPLAY,
          riskLevel: RiskLevel.HIGH,
          title: `开放 API Nonce 重放：${nonce}`,
          detail: { nonce, path: ctx.path },
          actor: actorFromCtx(ctx),
          route: ctx.path, method: ctx.method, source: 'openapi-auth',
        }).catch(() => {});
        deny(ctx, 401, 'Nonce already used');
        return;
      }
    } catch (error) {
      logger.error('[openapi-auth] nonce check failed, refusing request (fail-closed)', { error: String(error) });
      deny(ctx, 503, 'Nonce store unavailable');
      return;
    }

    // 3. API Key 解析（状态 / 撤销 / 有效期 / key_hash / 解密 secret）
    const resolved = await apiKeyService.resolve(apiKey);
    if (!resolved) {
      await writeSecurityLog({
        eventType: SecurityEventType.SIGNATURE_INVALID,
        riskLevel: RiskLevel.MEDIUM,
        title: '开放 API 凭据无效',
        detail: { keyPrefix: String(apiKey).slice(0, 12) },
        actor: actorFromCtx(ctx),
        route: ctx.path, method: ctx.method, source: 'openapi-auth',
      }).catch(() => {});
      deny(ctx, 403, 'Invalid API Key');
      return;
    }
    const { record, secret } = resolved;

    // 4. 租户必须可用（阶段一）
    try {
      await assertTenantActive(record.tenantId);
    } catch {
      deny(ctx, 403, 'Tenant is not active');
      return;
    }

    // 5. HMAC 签名（常量时间比对）
    const method = ctx.method.toUpperCase();
    const path = (ctx as any).state?.originalPath ?? ctx.path;
    const body = (ctx.request as any).rawBody ?? JSON.stringify(ctx.request.body ?? '');
    const signStr = `${method}:${path}:${timestamp}:${nonce}:${body}`;
    const expected = createHmac('sha256', secret).update(signStr).digest('hex');
    if (!timingSafeEqualString(signature, expected)) {
      await writeSecurityLog({
        eventType: SecurityEventType.SIGNATURE_INVALID,
        riskLevel: RiskLevel.HIGH,
        title: `开放 API 签名无效：${record.name}`,
        detail: { apiKeyId: record.apiKeyId, tenantId: record.tenantId, path },
        actor: { ...actorFromCtx(ctx), tenantId: record.tenantId },
        route: ctx.path, method: ctx.method, source: 'openapi-auth',
      }).catch(() => {});
      deny(ctx, 403, 'Invalid signature');
      return;
    }

    // 6. scope 校验
    const scopes = parseScopes(record.scopes);
    const required: ApiKeyScope = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'write';
    if (!scopesAllow(scopes, required)) {
      await writeSecurityLog({
        eventType: SecurityEventType.PERMISSION_DENIED,
        riskLevel: RiskLevel.MEDIUM,
        title: `开放 API scope 不足：需要 ${required}`,
        detail: { apiKeyId: record.apiKeyId, tenantId: record.tenantId, scopes, required, path },
        actor: { ...actorFromCtx(ctx), tenantId: record.tenantId },
        route: ctx.path, method: ctx.method, source: 'openapi-auth',
      }).catch(() => {});
      deny(ctx, 403, `API Key 缺少 ${required} scope`);
      return;
    }

    // 7. 注入可信上下文（租户来自数据库记录，绝不来自请求）
    (ctx.state as any).openApi = {
      apiKeyId: record.apiKeyId,
      keyId: record.keyId,
      tenantId: record.tenantId,
      scopes,
    };
    setRequestContext({
      tenantId: record.tenantId,
      userId: null,
      username: `apikey:${record.name}`,
    });
    apiKeyService.touchLastUsed(record.apiKeyId).catch(() => {});

    await next();
  };
}
