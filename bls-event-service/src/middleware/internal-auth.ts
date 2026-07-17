import { createHash } from 'crypto';
import type { Context, Next } from 'koa';
import { env } from '../config/env';

const ALLOWLIST_PREFIXES: string[] = (process.env.INTERNAL_IP_ALLOWLIST ?? '127.,10.,172.16.,172.17.,172.18.,172.19.,172.20.,172.21.,172.22.,172.23.,172.24.,172.25.,172.26.,172.27.,172.28.,172.29.,172.30.,172.31.,192.168.').split(',');

function isAllowedIp(ip: string): boolean {
  for (const prefix of ALLOWLIST_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  return false;
}

export function internalAuth() {
  return async (ctx: Context, next: Next) => {
    const ip = (ctx.ip ?? ctx.request.ip ?? '').replace(/^::ffff:/, '');
    if (!isAllowedIp(ip)) {
      if (process.env.NODE_ENV === 'production') {
        ctx.status = 403;
        ctx.body = { code: 403, message: 'Internal access denied: IP not allowed' };
        return;
      }
    }

    const header = ctx.get('X-Internal-Token');
    const auth = ctx.get('Authorization');
    const token = header || (auth?.startsWith('Bearer ') ? auth.slice(7) : null);

    if (!token) {
      ctx.status = 401;
      ctx.body = { code: 401, message: 'Missing internal token' };
      return;
    }

    const expected = createHash('sha256').update(env.internalSecret).digest('hex');
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
