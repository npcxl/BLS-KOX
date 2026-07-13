/**
 * P12: Webhook URL 安全校验 — SSRF 防护
 *
 * 两阶段校验:
 *   1. URL 静态检查（协议/hostname/内网IP）
 *   2. DNS resolve → 校验所有解析 IP 是否为内网/保留地址
 */
import { promises as dns } from 'dns';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const BLOCKED_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '169.254.', 'fd', 'fc'];
const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'gopher:', 'data:', 'javascript:']);
const METADATA_IPS = new Set(['169.254.169.254']);

/** 检查单个 IP 是否被禁止 */
function isBlockedIp(ip: string): boolean {
  if (BLOCKED_HOSTS.has(ip) || METADATA_IPS.has(ip)) return true;
  for (const prefix of BLOCKED_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  return false;
}

/** 静态 URL 检查（协议/hostname/内网前缀） */
function staticCheck(parsed: URL): { valid: boolean; error?: string } {
  const protocol = parsed.protocol;
  const hostname = parsed.hostname.toLowerCase();

  if (protocol !== 'http:' && protocol !== 'https:') {
    return { valid: false, error: `不允许的协议: ${protocol || '无'}` };
  }
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    return { valid: false, error: `禁止的协议: ${protocol}` };
  }
  if (!hostname) return { valid: false, error: 'URL 缺少 hostname' };
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, error: `禁止的 hostname: ${hostname}` };
  }
  if (isBlockedIp(hostname)) {
    return { valid: false, error: `禁止访问内网/metadata 地址: ${hostname}` };
  }
  return { valid: true };
}

/** DNS lookup + 全部 IP 校验 */
async function dnsCheck(hostname: string): Promise<{ valid: boolean; error?: string }> {
  // 如果 hostname 本身就是 IP，跳过 DNS
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    return { valid: true };
  }

  try {
    const addresses = await dns.resolve(hostname);
    for (const addr of addresses) {
      if (isBlockedIp(addr)) {
        return { valid: false, error: `DNS 解析到内网地址: ${hostname} → ${addr}` };
      }
    }
  } catch {
    // DNS 解析失败不阻止（可能是网络问题，或域名不存在）—— 静态检查已通过即可
  }

  return { valid: true };
}

export async function validateWebhookUrl(raw: string): Promise<{ valid: boolean; error?: string }> {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'URL 不能为空' };

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { valid: false, error: 'URL 解析失败' };
  }

  // 阶段1: 静态检查
  const staticResult = staticCheck(parsed);
  if (!staticResult.valid) return staticResult;

  // 阶段2: DNS 解析校验
  const dnsResult = await dnsCheck(parsed.hostname.toLowerCase());
  if (!dnsResult.valid) return dnsResult;

  return { valid: true };
}
