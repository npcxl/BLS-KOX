import { env } from '../../config/env';
import { getRedisClient } from '../cache/redis';

type IpifyResponse = {
  ip?: string;
};

type IpApiResponse = {
  ip?: string;
};

const CACHE_TTL_SECONDS = 24 * 60 * 60;
/** 解析失败的负缓存时间：失败往往是被墙 / 无外网，短时间重试没有意义 */
const NEGATIVE_CACHE_TTL_SECONDS = 60;
/** 单个公网解析接口的超时：无超时 fetch 会把每个请求拖到 2s+（两个接口叠加约 2.4s） */
const PUBLIC_IP_LOOKUP_TIMEOUT_MS = 1000;
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', 'localhost']);
/** 负缓存哨兵值 */
const NEGATIVE = '0';

function normalizeIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && !LOOPBACK_IPS.has(trimmed) ? trimmed : null;
}

function normalizeForwardedFor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const first = value.split(',')[0]?.trim();
  return first ? normalizeIp(first) : null;
}

function cacheKey(): string {
  return `${env.redis.keyPrefix}ip:lookup:public`;
}

/**
 * 公网出口 IP 解析（仅在**拿不到客户端 IP** 时才会用到，例如本地回环直连）。
 * 注意：必须带超时 —— 国内访问 ipify / ipapi 常常长时间无响应，会把每个业务请求拖慢数秒。
 */
async function fetchPublicIpWithFallbacks(): Promise<string | null> {
  const endpoints = [
    async () => {
      const response = await fetch('https://api.ipify.org?format=json', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(PUBLIC_IP_LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as IpifyResponse;
      return normalizeIp(data.ip);
    },
    async () => {
      const response = await fetch('https://ipapi.co/json/', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(PUBLIC_IP_LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as IpApiResponse;
      return normalizeIp(data.ip);
    },
  ] as const;

  for (const resolver of endpoints) {
    try {
      const ip = await resolver();
      if (ip) return ip;
    } catch {}
  }
  return null;
}

export function extractRequestIp(ctx: {
  ip?: string | null;
  headers?: Record<string, unknown>;
}): string | null {
  const forwardedFor = normalizeForwardedFor(ctx.headers?.['x-forwarded-for']);
  const realIp = normalizeIp(ctx.headers?.['x-real-ip']);
  const directIp = normalizeIp(ctx.ip);
  return forwardedFor ?? realIp ?? directIp;
}

export async function resolveClientIp(sourceIp?: string | null): Promise<string | null> {
  const normalizedSourceIp = normalizeIp(sourceIp);

  // 已经拿到真实客户端 IP → 直接返回。
  // （旧实现在这里仍会去请求公网接口并用「服务端出口 IP」覆盖客户端 IP，既慢又会把登录 IP 记错。）
  if (normalizedSourceIp) return normalizedSourceIp;

  // 允许显式指定（本地开发 / 内网部署无外网时强烈建议配置，可彻底避免公网请求）
  const override = normalizeIp(process.env.PUBLIC_IP);
  if (override) return override;

  // 无客户端 IP（本地回环直连）→ 回退到本机公网出口 IP，带超时 + 正负缓存
  const redis = getRedisClient();
  const key = cacheKey();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached === NEGATIVE) return null;
      const hit = normalizeIp(cached);
      if (hit) return hit;
    } catch { /* 缓存不可用时继续走网络解析 */ }
  }

  const resolved = await fetchPublicIpWithFallbacks();
  if (redis) {
    try {
      await redis.set(
        key,
        resolved ?? NEGATIVE,
        'EX',
        resolved ? CACHE_TTL_SECONDS : NEGATIVE_CACHE_TTL_SECONDS,
      );
    } catch { /* 缓存写入失败不影响主流程 */ }
  }
  return resolved;
}
