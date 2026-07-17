/**
 * 安全审计日志
 *
 * 记录所有安全相关事件，不做业务增删改的审计（操作日志已有 sys_operation_log）。
 * 严禁记录：密码、完整 Token、HMAC Secret、身份证、银行卡。
 */

import { execute } from './database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import type { AuditActor } from './audit';
import { logger } from './logger';
import { getRequestContext } from './request-context';
import { securityEventsTotal, crossTenantAccessTotal, loginFailedTotal, refreshReuseDetectedTotal } from '../observability/metrics';
import { publishEvent } from '../services/event-client';

// ========== 事件类型 ==========

export const SecurityEventType = {
  LOGIN_FAILED:          'LOGIN_FAILED',
  LOGIN_BRUTE_FORCE:     'LOGIN_BRUTE_FORCE',
  TOKEN_EXPIRED:         'TOKEN_EXPIRED',
  TOKEN_INVALID:         'TOKEN_INVALID',
  PERMISSION_DENIED:     'PERMISSION_DENIED',
  CROSS_TENANT_ACCESS:   'CROSS_TENANT_ACCESS',
  TIMESTAMP_MISSING:     'TIMESTAMP_MISSING',
  TIMESTAMP_INVALID:     'TIMESTAMP_INVALID',
  TIMESTAMP_EXPIRED:     'TIMESTAMP_EXPIRED',
  NONCE_MISSING:         'NONCE_MISSING',
  NONCE_REPLAY:          'NONCE_REPLAY',
  SIGNATURE_MISSING:     'SIGNATURE_MISSING',
  SIGNATURE_INVALID:     'SIGNATURE_INVALID',
  IDEMPOTENCY_KEY_MISSING: 'IDEMPOTENCY_KEY_MISSING',
  IDEMPOTENCY_PROCESSING: 'IDEMPOTENCY_PROCESSING',
  IDEMPOTENCY_CONFLICT:   'IDEMPOTENCY_CONFLICT',
  RATE_LIMIT_EXCEEDED:    'RATE_LIMIT_EXCEEDED',
  FREQUENCY_LIMIT:       'FREQUENCY_LIMIT',
  BATCH_EXPORT:          'BATCH_EXPORT',
  ROLE_CHANGE:           'ROLE_CHANGE',
  PERM_CHANGE:           'PERM_CHANGE',
  REFRESH_TOKEN_REUSE:   'REFRESH_TOKEN_REUSE',
  API_KEY_CREATED:       'API_KEY_CREATED',
  API_KEY_REVOKED:       'API_KEY_REVOKED',
  SENSITIVE_DATA_ACCESS: 'SENSITIVE_DATA_ACCESS',
  SECURITY_VALIDATION_FAILED: 'SECURITY_VALIDATION_FAILED',
} as const;

export type SecurityEventType = (typeof SecurityEventType)[keyof typeof SecurityEventType];

// ========== 风险等级 ==========

export const RiskLevel = {
  LOW:      'LOW',
  MEDIUM:   'MEDIUM',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/** 事件类型 → 默认风险等级 */
const EVENT_RISK: Record<string, RiskLevel> = {
  LOGIN_FAILED:          RiskLevel.LOW,
  LOGIN_BRUTE_FORCE:     RiskLevel.HIGH,
  TOKEN_EXPIRED:         RiskLevel.LOW,
  TOKEN_INVALID:         RiskLevel.MEDIUM,
  PERMISSION_DENIED:     RiskLevel.MEDIUM,
  CROSS_TENANT_ACCESS:   RiskLevel.HIGH,
  TIMESTAMP_MISSING:     RiskLevel.LOW,
  TIMESTAMP_INVALID:     RiskLevel.LOW,
  TIMESTAMP_EXPIRED:     RiskLevel.LOW,
  NONCE_MISSING:         RiskLevel.MEDIUM,
  NONCE_REPLAY:          RiskLevel.HIGH,
  SIGNATURE_MISSING:     RiskLevel.HIGH,
  SIGNATURE_INVALID:     RiskLevel.CRITICAL,
  IDEMPOTENCY_KEY_MISSING: RiskLevel.MEDIUM,
  IDEMPOTENCY_PROCESSING:  RiskLevel.LOW,
  IDEMPOTENCY_CONFLICT:    RiskLevel.MEDIUM,
  RATE_LIMIT_EXCEEDED:     RiskLevel.HIGH,
  FREQUENCY_LIMIT:       RiskLevel.HIGH,
  BATCH_EXPORT:          RiskLevel.MEDIUM,
  ROLE_CHANGE:           RiskLevel.HIGH,
  PERM_CHANGE:           RiskLevel.HIGH,
  API_KEY_CREATED:       RiskLevel.MEDIUM,
  API_KEY_REVOKED:       RiskLevel.MEDIUM,
  SENSITIVE_DATA_ACCESS: RiskLevel.CRITICAL,
  SECURITY_VALIDATION_FAILED: RiskLevel.MEDIUM,
};

// ========== 输入类型 ==========

export interface SecurityLogInput {
  eventType: SecurityEventType;
  riskLevel?: RiskLevel;
  title: string;
  detail?: Record<string, unknown> | null;
  actor?: Partial<AuditActor>;
  route?: string | null;
  method?: string | null;
  source?: string;
}

// ========== 脱敏工具 ==========

const SENSITIVE_KEYS = new Set([
  'password', 'oldPassword', 'newPassword', 'token', 'accessToken', 'refreshToken',
  'authorization', 'secret', 'apiKey', 'apiSecret', 'signSecret',
  'idCard', 'idNumber', 'bankCard', 'bankAccount', 'creditCard',
]);

/** 递归脱敏对象中的敏感字段 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[NESTED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 500 ? value.slice(0, 500) + '...[TRUNCATED]' : value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

// ========== 写入函数 ==========

export async function writeSecurityLog(input: SecurityLogInput): Promise<void> {
  try {
    const actor = input.actor ?? {};
    const detail = input.detail ? sanitize(input.detail) : null;

    await execute(
      `INSERT INTO sys_security_log (
        log_id, tenant_id, user_id, username, event_type, risk_level, title, detail,
        route, method, client_ip, user_agent, request_id, source, create_time
      ) VALUES (
        :logId, :tenantId, :userId, :username, :eventType, :riskLevel, :title, :detail,
        :route, :method, :clientIp, :userAgent, :requestId, :source, CURRENT_TIMESTAMP
      )`,
      {
        logId: generateSnowflakeId(),
        tenantId: actor.tenantId ?? '000000',
        userId: actor.userId ?? null,
        username: actor.username ?? null,
        eventType: input.eventType,
        riskLevel: input.riskLevel ?? EVENT_RISK[input.eventType] ?? RiskLevel.LOW,
        title: input.title,
        detail: detail ? JSON.stringify(detail) : null,
        route: input.route ?? null,
        method: input.method ?? null,
        clientIp: actor.clientIp ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: actor.requestId ?? null,
        source: input.source ?? 'system',
      },
    );

    // 发射 Prometheus 指标
    const riskLevel = input.riskLevel ?? EVENT_RISK[input.eventType] ?? RiskLevel.LOW;
    securityEventsTotal.inc({ event_type: input.eventType, risk_level: riskLevel });
    if (input.eventType === SecurityEventType.CROSS_TENANT_ACCESS) crossTenantAccessTotal.inc();
    if (input.eventType === SecurityEventType.LOGIN_FAILED) loginFailedTotal.inc();
    if (input.eventType === SecurityEventType.REFRESH_TOKEN_REUSE) refreshReuseDetectedTotal.inc();

    // 发送事件到 event-service（fire-and-forget）
    publishEvent({
      tenantId: String(actor.tenantId ?? '000000'),
      userId: actor.userId ?? undefined,
      username: actor.username ?? undefined,
      eventType: input.eventType,
      riskLevel: riskLevel.toLowerCase() as any,
      sourceModule: input.source ?? 'system',
      resourceType: 'security',
      requestId: actor.requestId ?? undefined,
      clientIp: actor.clientIp ?? undefined,
      userAgent: actor.userAgent ?? undefined,
      detailJson: input.detail ?? { title: input.title },
    }).catch(() => { /* fire-and-forget */ });

    // 接入 Event Center — 采集 → 聚合 → 评分 → 自动处置（运行时 require 打破循环依赖）
    // FIX-02: source === 'event-center' 不二次 collectEvent，防处置循环
    const source = input.source ?? 'system';
    if (source !== 'event-center') {
      const clientIp = actor.clientIp ?? 'unknown';
      if (clientIp !== 'unknown') {
        try {
          const { collectEvent } = require('../security/event-center/event-center');
          collectEvent({
            eventType: input.eventType,
            ip: clientIp,
            tenantId: String(actor.tenantId ?? '000000'),
            userId: actor.userId ?? undefined,
          }).catch(() => { /* fire-and-forget */ });
        } catch { /* event-center 未就绪时静默 */ }
      }
    }
  } catch (error) {
    logger.error('安全审计日志写入失败', {
      event: 'security_audit_write_failed',
      eventType: input.eventType,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
  }
}

/** 从 Koa Context 快速构造 actor */
export function actorFromCtx(ctx: any): Partial<AuditActor> {
  // 使用统一 Request Context（verified JWT），不信任客户端传入的 x-tenant-id
  const reqCtx = getRequestContext();
  return {
    tenantId: reqCtx?.tenantId ?? '000000',
    userId: reqCtx?.userId ?? null,
    username: reqCtx?.username ?? null,
    clientIp: reqCtx?.clientIp ?? ctx?.ip ?? null,
    userAgent: reqCtx?.userAgent ?? null,
    requestId: reqCtx?.requestId ?? null,
  };
}

/** 快捷方法 */
export async function logSecurity(
  ctx: any,
  eventType: SecurityEventType,
  title: string,
  detail?: Record<string, unknown>,
  riskLevel?: RiskLevel,
) {
  await writeSecurityLog({
    eventType,
    riskLevel,
    title,
    detail,
    actor: actorFromCtx(ctx),
    route: ctx?.path ?? ctx?.url,
    method: ctx?.method,
    source: 'system',
  });
}
