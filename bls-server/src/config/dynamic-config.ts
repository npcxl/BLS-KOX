/**
 * P14: Dynamic Configuration Center
 *
 * 从 sys_config 表读取动态配置，带 Redis 缓存。
 * 静态配置（JWT/DB）仍从 ENV 读取，动态配置从 DB 读取。
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

// P14: no hardcoded defaultPassword — must be explicitly set in DB
const CONFIG_SCHEMA: Record<string, { type: string; min?: number; max?: number }> = {
  'sys.login.multiDevice': { type: 'bool' },
  'sys.upload.maxSize':    { type: 'number', min: 1, max: 500 },
  'sys.demo.enabled':      { type: 'bool' },
  'sys.app.name':          { type: 'string' },
};

// P14: safe type converter
function applySchema(config: any, key: string, val: string): void {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) return;
  try {
    if (schema.type === 'bool') {
      config[key] = val !== '0' && val !== 'false';
    } else if (schema.type === 'number') {
      const n = parseInt(val, 10);
      if (isNaN(n)) { logger.warn('[dynamic-config] invalid number', { key, val }); return; }
      if (schema.min !== undefined && n < schema.min) { logger.warn('[dynamic-config] out of range', { key, val, min: schema.min }); return; }
      if (schema.max !== undefined && n > schema.max) { logger.warn('[dynamic-config] out of range', { key, val, max: schema.max }); return; }
      config[key] = n;
    } else {
      config[key] = val;
    }
  } catch (err) {
    logger.warn('[dynamic-config] schema apply failed', { key, error: String(err) });
  }
}

export async function getDynamicConfig(tenantId: string): Promise<DynamicConfig> {
  // Redis cache
  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(`${CACHE_PREFIX}${tenantId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          multiLogin: parsed['sys.login.multiDevice'] !== false,
          uploadLimitMB: parseInt(parsed['sys.upload.maxSize']) || 20,
          demoEnabled: parsed['sys.demo.enabled'] === true,
          appName: parsed['sys.app.name'] || 'BLS-KOX',
        };
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
      const k = String(r.config_key ?? '');
      const v = String(r.config_value ?? '');
      if (CONFIG_SCHEMA[k]) applySchema(raw, k, v);
    }

    const config: DynamicConfig = {
      multiLogin: raw['sys.login.multiDevice'] ?? true,
      uploadLimitMB: raw['sys.upload.maxSize'] ?? 20,
      demoEnabled: raw['sys.demo.enabled'] ?? false,
      appName: raw['sys.app.name'] || 'BLS-KOX',
    };

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
    return { multiLogin: true, uploadLimitMB: 20, demoEnabled: false, appName: 'BLS-KOX' };
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
