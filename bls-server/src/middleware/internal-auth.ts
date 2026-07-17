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
import { createHash } from 'crypto';
import { logger } from '../core/logger';

// 允许的内网 IP 前缀（Kubernetes / Docker / 本地回环）
const ALLOWLIST_PREFIXES: string[] = (process.env.INTERNAL_IP_ALLOWLIST ?? '127.,10.,172.16.,172.17.,172.18.,172.19.,172.20.,172.21.,172.22.,172.23.,172.24.,172.25.,172.26.,172.27.,172.28.,172.29.,172.30.,172.31.,192.168.').split(',');

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
  for (const prefix of ALLOWLIST_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  return false;
}

export function internalAuth() {
  return async (ctx: Context, next: Next) => {
    // 1. IP 白名单
    const ip = (ctx.ip ?? ctx.request.ip ?? '').replace(/^::ffff:/, '');
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

    // 4. Token 比较（恒定时间比较防时序攻击）
    const expected = createHash('sha256').update(INTERNAL_SECRET).digest('hex');
    const provided = createHash('sha256').update(token).digest('hex');
    if (expected !== provided) {
      ctx.status = 403;
      ctx.body = { code: 403, message: 'Invalid internal token' };
      return;
    }

    ctx.state.internal = true;
    await next();
  };
}
