/**
 * IP / CIDR 匹配工具（阶段七）
 *
 * `INTERNAL_IP_ALLOWLIST` 之前使用 `ip.startsWith(prefix)` 的字符串前缀匹配，
 * `10.` 会错误地匹配 `10.1.2.3` 之外的任意以 `10.` 开头的字符串。这里改为真正的
 * CIDR 语义（同时兼容单个 IP 条目）。
 *
 * 说明：IPv6 仅做规范化后的前缀匹配（容器网络足够）；如需完整 IPv6 CIDR
 * 语义请引入专用库。
 */

/** 去除 IPv4-mapped IPv6 前缀与首尾空白 */
export function normalizeIp(raw?: string | null): string {
  if (!raw) return '';
  let ip = String(raw).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (part === '' || !/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/**
 * 判断 IP 是否落在某个 CIDR / 单个 IP 条目内。
 * 支持：`10.0.0.0/8`、`192.168.1.5`、`2001:db8::/32`（前缀匹配）。
 */
export function isIpInCidr(rawIp: string, cidr: string): boolean {
  const ip = normalizeIp(rawIp);
  const entry = String(cidr ?? '').trim();
  if (!ip || !entry) return false;

  if (ip.includes(':') || entry.includes(':')) {
    const prefix = entry.split('/')[0].toLowerCase();
    return !!prefix && ip.toLowerCase().startsWith(prefix);
  }

  const [network, bitsRaw] = entry.split('/');
  const networkInt = ipv4ToInt(network);
  const ipInt = ipv4ToInt(ip);
  if (networkInt === null || ipInt === null) return false;

  if (bitsRaw === undefined) return networkInt === ipInt;

  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (networkInt & mask);
}

/** allowlist 为空时不放行（fail-closed） */
export function isIpAllowed(rawIp: string, allowlist: string[]): boolean {
  if (!allowlist || allowlist.length === 0) return false;
  return allowlist.some((entry) => isIpInCidr(rawIp, entry));
}

/** 解析逗号分隔的 allowlist（空值使用 fallback） */
export function parseAllowlist(raw: string | undefined | null, fallback: string[] = []): string[] {
  const list = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
}

/** 校验配置项本身是否是合法 CIDR / IP（启动时校验用） */
export function isValidCidrOrIp(entry: string): boolean {
  const value = String(entry ?? '').trim();
  if (!value) return false;
  if (value.includes(':')) {
    const [prefix, bits] = value.split('/');
    if (!/^[0-9a-fA-F:]+$/.test(prefix)) return false;
    if (bits === undefined) return true;
    const n = Number(bits);
    return Number.isInteger(n) && n >= 0 && n <= 128;
  }
  const [network, bits] = value.split('/');
  if (ipv4ToInt(network) === null) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return Number.isInteger(n) && n >= 0 && n <= 32;
}
