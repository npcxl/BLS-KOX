/**
 * 统一域名解析
 *
 * 优先级：X-Forwarded-Host > Host > Origin
 * - X-Forwarded-Host: 仅在 TRUST_PROXY=true 时信任（Nginx 反代传入）
 * - Host: 直接访问时的 Host 头（非 localhost/127.0.0.1）
 * - Origin: 跨域请求时的来源域名
 *
 * 返回纯域名（去除端口），如 "admin.example.com"
 */
import type { Context } from 'koa';

export function resolveTenantDomain(ctx: Context): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';

  // 1. X-Forwarded-Host（仅在信任代理时使用）
  if (trustProxy) {
    const forwardedHost = ctx.get('X-Forwarded-Host');
    if (forwardedHost) {
      const domain = forwardedHost.split(',')[0].trim();
      const stripped = stripPort(domain);
      if (!isLocalhost(stripped)) return stripped;
    }
  }

  // 2. Host header（先 strip port，再判断是否为 localhost）
  const host = ctx.get('Host') || ctx.host || '';
  if (host) {
    const stripped = stripPort(host);
    if (!isLocalhost(stripped)) return stripped;
  }

  // 3. Origin header（localhost 场景的最终 fallback）
  const origin = ctx.get('Origin');
  if (origin) {
    const stripped = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
    if (!isLocalhost(stripped)) return stripped;
  }

  // 4. 本地开发回退
  return 'localhost';
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '');
}

function isLocalhost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
