/**
 * 统一域名解析
 *
 * 优先级：X-Forwarded-Host > Host > Origin
 * - X-Forwarded-Host: Nginx 反代时传入的真实域名
 * - Host: 直接访问时浏览器的 Host 头
 * - Origin: 跨域请求时的来源域名
 *
 * 返回纯域名（去除协议、端口、路径），如 "admin.example.com"
 */
import type { Context } from 'koa';

export function resolveTenantDomain(ctx: Context): string {
  // 1. X-Forwarded-Host（Nginx 反代优先）
  const forwardedHost = ctx.get('X-Forwarded-Host');
  if (forwardedHost) {
    const domain = forwardedHost.split(',')[0].trim();
    return stripPort(domain);
  }

  // 2. Host header
  const host = ctx.get('Host') || ctx.host || '';
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return stripPort(host);
  }

  // 3. Origin header
  const origin = ctx.get('Origin');
  if (origin) {
    return origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
  }

  // 4. 本地开发回退
  return 'localhost';
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '');
}
