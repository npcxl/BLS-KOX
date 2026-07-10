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
const CACHE_TTL = 60; // 60 秒缓存

export interface DynamicConfig {
  multiLogin: boolean;
  uploadLimitMB: number;
  demoEnabled: boolean;
  defaultPassword: string;
  appName: string;
}

/** 默认配置 */
const DEFAULTS: DynamicConfig = {
  multiLogin: true,
  uploadLimitMB: 20,
  demoEnabled: false,
  defaultPassword: '123456',
  appName: 'BLS-KOX',
};

/**
 * 获取租户的动态配置（优先 Redis 缓存）
 */
export async function getDynamicConfig(tenantId: string): Promise<DynamicConfig> {
  // 从 Redis 缓存读取
  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(`${CACHE_PREFIX}${tenantId}`);
      if (cached) return { ...DEFAULTS, ...JSON.parse(cached) };
    }
  } catch {}

  // 从数据库读取
  try {
    const db = await getDb();
    const rows = await db
      .selectFrom('sys_config')
      .select(['config_key', 'config_value'])
      .where('tenant_id', '=', tenantId)
      .where('status', '=', '0')
      .execute();

    const config = { ...DEFAULTS };
    for (const r of rows as any[]) {
      const key = String(r.config_key ?? '');
      const val = String(r.config_value ?? '');
      if (key === 'sys.login.multiDevice') config.multiLogin = val !== '0';
      else if (key === 'sys.upload.maxSize') config.uploadLimitMB = parseInt(val) || 20;
      else if (key === 'sys.demo.enabled') config.demoEnabled = val === 'true';
      else if (key === 'sys.user.defaultPassword') config.defaultPassword = val;
      else if (key === 'sys.app.name') config.appName = val;
    }

    // 写入 Redis 缓存
    try {
      const redis = getRedisClient();
      if (redis) await redis.set(`${CACHE_PREFIX}${tenantId}`, JSON.stringify(config), 'EX', CACHE_TTL);
    } catch {}

    return config;
  } catch (err) {
    logger.error('[dynamic-config] db read failed', { error: String(err) });
    return { ...DEFAULTS };
  }
}

/** 清除配置缓存（修改配置后调用） */
export async function invalidateConfigCache(tenantId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    if (redis) await redis.del(`${CACHE_PREFIX}${tenantId}`);
  } catch {}
}
