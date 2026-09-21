/**
 * Internal Auth — Service Token + IP Allowlist
 *
 * 校验流程:
 *   1. IP 白名单检查（支持 CIDR 简化匹配）
 *   2. X-Internal-Token / Authorization: Bearer <token>
 *   3. Token = INTERNAL_SECRET env
 *
 * 安全约束：
 *   - INTERNAL_SECRET 不允许默认弱值，生产环境缺失时启动失败
 *   - 开发环境允许通过，但必须显式设置 INTERNAL_SECRET
 */
import type { Context, Next } from 'koa';
import { createHash, timingSafeEqual } from 'crypto';
import { logger } from '../core/logger';
import { isIpAllowed, parseAllowlist, isValidCidrOrIp, normalizeIp } from '../shared/utils/ip-cidr';

/**
 * 允许的内网 CIDR（Kubernetes / Docker / 本地回环）。
 * 阶段七：由字符串前缀匹配改为真正的 CIDR 语义，
 * 避免 `10.` 匹配到任意以 `10.` 开头的字符串。
 */
const DEFAULT_ALLOWLIST = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::1/128',
];
const ALLOWLIST: string[] = parseAllowlist(process.env.INTERNAL_IP_ALLOWLIST, DEFAULT_ALLOWLIST);
for (const entry of ALLOWLIST) {
  if (!isValidCidrOrIp(entry)) {
    throw new Error(`[internal-auth] INTERNAL_IP_ALLOWLIST contains an invalid CIDR/IP entry: ${entry}`);
  }
}

/** 常量时间字符串比较 */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const DEMO_WEAK_PREFIX = 'DEMO_ONLY_CHANGE_ME_';
const CHANGE_TO_PREFIX = 'CHANGE_TO_';
const WEAK_DEFAULTS = new Set(['change_me_internal', 'please_change_me']);

function isWeakSecret(value: string): boolean {
  if (WEAK_DEFAULTS.has(value.toLowerCase())) return true;
  if (value.toUpperCase().startsWith(DEMO_WEAK_PREFIX)) return true;
  if (value.toUpperCase().startsWith(CHANGE_TO_PREFIX)) return true;
  return false;
}

function getInternalSecret(): string {
  const raw = process.env.INTERNAL_SECRET?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[internal-auth] INTERNAL_SECRET is required in production');
    }
    // 开发环境也不允许无值，但允许 DEMO 占位符
    logger.warn('[internal-auth] INTERNAL_SECRET not set, internal endpoints will reject all requests');
    return '';
  }
  if (process.env.NODE_ENV === 'production' && isWeakSecret(raw)) {
    throw new Error('[internal-auth] INTERNAL_SECRET must not be a DEMO_ONLY_CHANGE_ME_* or CHANGE_TO_* placeholder in production');
  }
  return raw;
}

const INTERNAL_SECRET = getInternalSecret();

function isAllowedIp(ip: string): boolean {
  return isIpAllowed(ip, ALLOWLIST);
}

export function internalAuth() {
  return async (ctx: Context, next: Next) => {
    // 1. IP 白名单（CIDR）
    const ip = normalizeIp(ctx.ip ?? ctx.request.ip ?? '');
    if (!isAllowedIp(ip)) {
      // 生产环境严格拒绝，开发环境放行
      if (process.env.NODE_ENV === 'production') {
        ctx.status = 403;
        ctx.body = { code: 403, message: 'Internal access denied: IP not allowed' };
        return;
      }
      logger.debug('[internal-auth] dev mode: IP not in allowlist, but allowed in dev', { ip });
    }

    // 2. INTERNAL_SECRET 未配置 → 拒绝所有内部请求
    if (!INTERNAL_SECRET) {
      ctx.status = 500;
      ctx.body = { code: 500, message: 'INTERNAL_SECRET is not configured' };
      return;
    }

    // 3. Service Token 校验
    const header = ctx.get('X-Internal-Token');
    const auth = ctx.get('Authorization');
    const token = header || (auth?.startsWith('Bearer ') ? auth.slice(7) : null);

    if (!token) {
      ctx.status = 401;
      ctx.body = { code: 401, message: 'Missing internal token' };
      return;
    }

    // 4. Token 比较（sha256 + timingSafeEqual，恒定时间防时序攻击）
    const expected = createHash('sha256').update(INTERNAL_SECRET).digest('hex');
    const provided = createHash('sha256').update(token).digest('hex');
    if (!timingSafeEqualString(expected, provided)) {
      ctx.status = 403;
      ctx.body = { code: 403, message: 'Invalid internal token' };
      return;
    }

    ctx.state.internal = true;
    await next();
  };
}
