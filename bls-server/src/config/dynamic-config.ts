/**
 * P14: Dynamic Configuration Center
 *
 * Strict schema enforced on both Redis cache and DB reads.
 * Numbers/booleans: strict parsing, no loose coercion.
 */
import { getDb } from '../core/database';
import { getRedisClient } from '../shared/utils/redis';
import { logger } from '../core/logger';

const CACHE_PREFIX = 'config:';
const CACHE_TTL = 60;

export interface DynamicConfig {
  multiLogin: boolean;
  uploadLimitMB: number;
  demoEnabled: boolean;
  appName: string;
}

// P14: strict schema shared by Redis + DB
const SCHEMA: Record<string, { type: 'bool'|'number'|'string'; default: any; min?: number; max?: number }> = {
  'sys.login.multiDevice': { type: 'bool',   default: true },
  'sys.upload.maxSize':    { type: 'number', default: 20,  min: 1, max: 500 },
  'sys.demo.enabled':      { type: 'bool',   default: false },
  'sys.app.name':          { type: 'string', default: 'BLS-KOX' },
};

const KEY_MAP: Record<string, keyof DynamicConfig> = {
  'sys.login.multiDevice': 'multiLogin',
  'sys.upload.maxSize':    'uploadLimitMB',
  'sys.demo.enabled':      'demoEnabled',
  'sys.app.name':          'appName',
};

// P14: strict parser — no loose coercion, redis+DB共用
function parseConfigValue(raw: Record<string, any>): DynamicConfig {
  const out: DynamicConfig = { multiLogin: true, uploadLimitMB: 20, demoEnabled: false, appName: 'BLS-KOX' };
  for (const [key, schema] of Object.entries(SCHEMA)) {
    const prop = KEY_MAP[key];
    if (!prop) continue;
    const val = raw[key];
    try {
      if (val === undefined || val === null) {
        (out as any)[prop] = schema.default;
      } else if (schema.type === 'bool') {
        // strict: only '0'/'false' → false, '1'/'true' → true, everything else → ignore
        const s = String(val).trim().toLowerCase();
        if (s === '1' || s === 'true') (out as any)[prop] = true;
        else if (s === '0' || s === 'false') (out as any)[prop] = false;
        else logger.warn('[dynamic-config] invalid bool, using default', { key, val });
      } else if (schema.type === 'number') {
        const n = Number(val);
        if (!Number.isFinite(n)) { logger.warn('[dynamic-config] invalid number, using default', { key, val }); continue; }
        if (schema.min !== undefined && n < schema.min) { logger.warn('[dynamic-config] out of range', { key, val, min: schema.min }); continue; }
        if (schema.max !== undefined && n > schema.max) { logger.warn('[dynamic-config] out of range', { key, val, max: schema.max }); continue; }
        (out as any)[prop] = n;
      } else {
        (out as any)[prop] = String(val);
      }
    } catch (err) {
      logger.warn('[dynamic-config] parse error', { key, error: String(err) });
    }
  }
  return out;
}

// P14: Redis + DB 共用同一套解析
function parseRedisCache(cached: string): DynamicConfig | null {
  try {
    const parsed = JSON.parse(cached);
    if (typeof parsed !== 'object' || !parsed) return null;
    return parseConfigValue(parsed);
  } catch {
    logger.warn('[dynamic-config] redis cache parse failed');
    return null;
  }
}

export async function getDynamicConfig(tenantId: string): Promise<DynamicConfig> {
  // Redis cache
  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(`${CACHE_PREFIX}${tenantId}`);
      if (cached) {
        const config = parseRedisCache(cached);
        if (config) return config;
      }
    }
  } catch (err) {
    logger.warn('[dynamic-config] redis read failed', { error: String(err) });
  }

  // DB read
  try {
    const db = await getDb();
    const rows = await db.selectFrom('sys_config')
      .select(['config_key', 'config_value'])
      .where('tenant_id', '=', tenantId)
      .where('status', '=', '0')
      .execute();

    const raw: Record<string, any> = {};
    for (const r of rows as any[]) {
      raw[String(r.config_key ?? '')] = String(r.config_value ?? '');
    }

    const config = parseConfigValue(raw);

    // cache to Redis
    try {
      const redis = getRedisClient();
      if (redis) await redis.set(`${CACHE_PREFIX}${tenantId}`, JSON.stringify(raw), 'EX', CACHE_TTL);
    } catch (err) {
      logger.warn('[dynamic-config] redis write failed', { error: String(err) });
    }

    return config;
  } catch (err) {
    logger.error('[dynamic-config] db read failed', { error: String(err) });
    return parseConfigValue({});
  }
}

export async function invalidateConfigCache(tenantId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    if (redis) await redis.del(`${CACHE_PREFIX}${tenantId}`);
  } catch (err) {
    logger.warn('[dynamic-config] cache invalidation failed', { error: String(err) });
  }
}
