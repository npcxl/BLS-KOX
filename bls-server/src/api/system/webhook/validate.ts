/**
 * P12: Webhook URL 安全校验 — SSRF 防护
 */

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const BLOCKED_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '169.254.', 'fd', 'fc'];
const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'gopher:', 'data:', 'javascript:']);
const METADATA_IPS = new Set(['169.254.169.254']); // cloud metadata

export function validateWebhookUrl(raw: string): { valid: boolean; error?: string } {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'URL 不能为空' };

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { valid: false, error: 'URL 解析失败' };
  }

  const protocol = parsed.protocol;
  const hostname = parsed.hostname.toLowerCase();

  // 协议检查
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { valid: false, error: `不允许的协议: ${protocol || '无'}` };
  }
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    return { valid: false, error: `禁止的协议: ${protocol}` };
  }

  if (!hostname) return { valid: false, error: 'URL 缺少 hostname' };

  // Hostname 检查
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, error: `禁止的 hostname: ${hostname}` };
  }

  // IP 黑名单
  if (METADATA_IPS.has(hostname)) {
    return { valid: false, error: `禁止访问 metadata 地址: ${hostname}` };
  }

  // 前缀匹配（内网/保留 IP 段）
  for (const prefix of BLOCKED_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      return { valid: false, error: `禁止访问内网地址: ${hostname}` };
    }
  }

  return { valid: true };
}
