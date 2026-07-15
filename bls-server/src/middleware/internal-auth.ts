/**
 * Internal Auth — Service Token + IP Allowlist
 *
 * 校验流程:
 *   1. IP 白名单检查（支持 CIDR 简化匹配）
 *   2. X-Internal-Token / Authorization: Bearer <token>
 *   3. Token = INTERNAL_SECRET env
 */
import type { Context, Next } from 'koa';
import { createHash } from 'crypto';
import { logger } from '../core/logger';

// 允许的内网 IP 前缀（Kubernetes / Docker / 本地回环）
const ALLOWLIST_PREFIXES: string[] = (process.env.INTERNAL_IP_ALLOWLIST ?? '127.,10.,172.16.,172.17.,172.18.,172.19.,172.20.,172.21.,172.22.,172.23.,172.24.,172.25.,172.26.,172.27.,172.28.,172.29.,172.30.,172.31.,192.168.').split(',');

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'change_me_internal';

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

    // 2. Service Token 校验
    const header = ctx.get('X-Internal-Token');
    const auth = ctx.get('Authorization');
    const token = header || (auth?.startsWith('Bearer ') ? auth.slice(7) : null);

    if (!token) {
      ctx.status = 401;
      ctx.body = { code: 401, message: 'Missing internal token' };
      return;
    }

    // 3. Token 比较（恒定时间比较防时序攻击）
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
