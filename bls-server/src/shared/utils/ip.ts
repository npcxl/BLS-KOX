import { createHash } from 'crypto';
import { env } from '../../config/env';
import { getRedisClient } from '../cache/redis';

type IpifyResponse = {
  ip?: string;
};

type IpApiResponse = {
  ip?: string;
};

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

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

function cacheKey(sourceIp: string): string {
  const hash = createHash('sha1').update(sourceIp).digest('hex');
  return `${env.redis.keyPrefix}ip:lookup:${hash}`;
}

async function fetchPublicIpWithFallbacks(): Promise<string | null> {
  const endpoints = [
    async () => {
      const response = await fetch('https://api.ipify.org?format=json', {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as IpifyResponse;
      return normalizeIp(data.ip);
    },
    async () => {
      const response = await fetch('https://ipapi.co/json/', {
        headers: { accept: 'application/json' },
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
  if (!normalizedSourceIp) {
    return (await fetchPublicIpWithFallbacks()) ?? null;
  }

  const redis = getRedisClient();
  const key = cacheKey(normalizedSourceIp);
  if (redis) {
    try {
      const cached = normalizeIp(await redis.get(key));
      if (cached) return cached;
    } catch {}
  }

  const resolved = (await fetchPublicIpWithFallbacks()) ?? normalizedSourceIp;
  if (redis) {
    try {
      await redis.set(key, resolved, 'EX', CACHE_TTL_SECONDS);
    } catch {}
  }
  return resolved;
}
