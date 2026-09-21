/**
 * 操作审计中间件（阶段五）
 *
 * 对所有写操作（POST/PUT/PATCH/DELETE）自动写入 `sys_operation_log`，
 * 使 `writeOperationLog()` 真正被使用，覆盖：
 *   增删改、权限变更（角色/菜单/密码）、套餐变更、租户状态变更 …
 *
 * 设计要点：
 *   - 仅记录写了 body 的业务写接口；`/api/auth/*`（已有 sys_login_log）、
 *     日志查询接口、内部上报接口被排除，避免噪音与递归。
 *   - 请求参数递归脱敏（password/token/secret…），并截断长度。
 *   - 审计失败不阻塞业务（writeOperationLog 内部已兜底 + 指标 + 结构化日志）。
 */
import type { Context, Next } from 'koa';
import { writeOperationLog, type AuditActor } from '../core/audit';
import { getRequestContext } from '../core/request-context';

const TRACKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 不记录操作日志的路径前缀 */
const SKIP_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/metrics',
  '/api/health',
  '/api/ready',
  '/api/docs',
  '/api/system/log/',
  '/api/system/ai-usage/report',
];

const SENSITIVE_KEYS = new Set([
  'password', 'oldpassword', 'newpassword', 'confirmpassword',
  'token', 'refreshtoken', 'accesstoken', 'authorization',
  'secret', 'apikey', 'apisecret', 'clientsecret', 'privatekey', 'accesskey', 'secretkey',
  'signature', 'sign',
]);

const MAX_PARAM_LENGTH = 2000;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[DEPTH_LIMIT]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...[TRUNCATED]` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

function businessTypeOf(method: string): string {
  switch (method) {
    case 'POST': return 'CREATE';
    case 'PUT':
    case 'PATCH': return 'UPDATE';
    case 'DELETE': return 'DELETE';
    default: return method;
  }
}

function moduleNameOf(path: string): string {
  const segments = path.split('/').filter(Boolean).slice(0, 3); // api / system / user
  return segments.slice(1).join(':') || 'api';
}

function shouldSkip(path: string): boolean {
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function operationLogMiddleware() {
  return async (ctx: Context, next: Next): Promise<void> => {
    const path = String((ctx.state as any).originalPath ?? ctx.path ?? '');
    const method = ctx.method.toUpperCase();

    if (!TRACKED_METHODS.has(method) || shouldSkip(path)) {
      await next();
      return;
    }

    const start = Date.now();
    let failure: unknown = null;

    try {
      await next();
    } catch (error) {
      failure = error;
      await recordOperation(ctx, path, method, start, error);
      throw error;
    }

    await recordOperation(ctx, path, method, start, null);
  };
}

async function recordOperation(
  ctx: Context,
  path: string,
  method: string,
  start: number,
  error: unknown,
): Promise<void> {
  try {
    const reqCtx = getRequestContext();
    const user = (ctx.state as any).user ?? {};
    const actor: AuditActor = {
      tenantId: String(reqCtx?.tenantId ?? user.tenantId ?? '000000'),
      userId: reqCtx?.userId ?? user.userId ?? null,
      username: reqCtx?.username ?? user.username ?? null,
      clientIp: reqCtx?.clientIp ?? (ctx as any).ip ?? null,
      userAgent: reqCtx?.userAgent ?? ((ctx.headers['user-agent'] as string) ?? null),
      requestId: reqCtx?.requestId ?? null,
    };

    const status = (ctx as any).status ?? 200;
    const success: '0' | '1' = !error && status < 400 ? '1' : '0';

    let params: string | null = null;
    if (ctx.request?.body && typeof ctx.request.body === 'object') {
      const sanitized = sanitize(ctx.request.body);
      params = JSON.stringify(sanitized).slice(0, MAX_PARAM_LENGTH);
    }

    await writeOperationLog({
      actor,
      moduleName: moduleNameOf(path),
      businessType: businessTypeOf(method),
      title: `${method} ${path}`.slice(0, 200),
      requestMethod: method,
      requestUrl: path.slice(0, 500),
      requestParams: params,
      responseStatus: error ? (error as any)?.status ?? 500 : status,
      success,
      errorMessage: error ? String((error as any)?.message ?? error).slice(0, 1000) : null,
      costTimeMs: Date.now() - start,
    });
  } catch {
    // 审计失败绝不影响业务（writeOperationLog 内部已有指标 + 结构化日志）
  }
}
