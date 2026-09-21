/**
 * Dynamic Configuration Center
 *
 * Strict schema enforced on both Redis cache and DB reads.
 * Numbers/booleans/enums/CSV: strict parsing, no loose coercion — an invalid value falls back to
 * the declared default and logs a warning, it is never silently coerced.
 * Injectable deps for testability.
 */
import { getDb as defaultGetDb } from '../core/database';
import { getRedisClient as defaultGetRedis } from '../shared/utils/redis';
import { logger } from '../core/logger';

export const CACHE_PREFIX = 'config:';
export const CACHE_TTL = 60;

/** 登录人机验证模式 */
export type CaptchaMode = 'off' | 'adaptive' | 'always';
export const CAPTCHA_MODES: readonly CaptchaMode[] = ['off', 'adaptive', 'always'];

/**
 * 人机验证提供方：
 *   - altcha（默认）：自托管 ALTCHA 开源库，服务端校验 Proof-of-Work；
 *   - tianai（可选）：代理到独立部署的 Tianai CAPTCHA 服务（仅在产品确需滑块拼图时启用）。
 * 两者都不在 Koa 内自行实现验证码算法。
 */
export type CaptchaProvider = 'altcha' | 'tianai';
export const CAPTCHA_PROVIDERS: readonly CaptchaProvider[] = ['altcha', 'tianai'];

export interface DynamicConfig {
  multiLogin: boolean;
  uploadLimitMB: number;
  demoEnabled: boolean;
  appName: string;
  // ===== 登录人机验证（sys.login.captcha.*）=====
  /** 是否开启登录人机验证 */
  captchaEnabled: boolean;
  /** off | adaptive | always */
  captchaMode: CaptchaMode;
  /** altcha | tianai */
  captchaProvider: CaptchaProvider;
  /** challenge 有效期（秒） */
  captchaChallengeTtlSeconds: number;
  /** captchaToken 有效期（秒），默认 120 */
  captchaTokenTtlSeconds: number;
  /** 同一账号近期连续登录失败达到该值 → 不再完全静默（切换为可见 ALTCHA 组件） */
  captchaForceAfterFailures: number;
}

type RedisLike = { get(k: string): Promise<string | null>; set(k: string, v: string, mode: string, ttl: number): Promise<any>; del(k: string): Promise<number> };

type ConfigFieldType = 'bool' | 'number' | 'string' | 'enum' | 'csv';

interface ConfigSchemaEntry {
  type: ConfigFieldType;
  default: any;
  min?: number;
  max?: number;
  /** enum / csv 的允许值 */
  values?: readonly string[];
}

const SCHEMA: Record<string, ConfigSchemaEntry> = {
  'sys.login.multiDevice': { type: 'bool', default: true },
  'sys.upload.maxSize': { type: 'number', default: 20, min: 1, max: 500 },
  'sys.demo.enabled': { type: 'bool', default: false },
  'sys.app.name': { type: 'string', default: 'BLS-KOX' },
  // ===== 登录人机验证 =====
  'sys.login.captcha.enabled': { type: 'bool', default: true },
  'sys.login.captcha.mode': { type: 'enum', default: 'adaptive', values: CAPTCHA_MODES },
  'sys.login.captcha.provider': { type: 'enum', default: 'altcha', values: CAPTCHA_PROVIDERS },
  'sys.login.captcha.challengeTtlSeconds': { type: 'number', default: 180, min: 30, max: 900 },
  'sys.login.captcha.tokenTtlSeconds': { type: 'number', default: 120, min: 30, max: 600 },
  'sys.login.captcha.forceAfterFailures': { type: 'number', default: 3, min: 1, max: 100 },
};

const KEY_MAP: Record<string, keyof DynamicConfig> = {
  'sys.login.multiDevice': 'multiLogin',
  'sys.upload.maxSize': 'uploadLimitMB',
  'sys.demo.enabled': 'demoEnabled',
  'sys.app.name': 'appName',
  'sys.login.captcha.enabled': 'captchaEnabled',
  'sys.login.captcha.mode': 'captchaMode',
  'sys.login.captcha.provider': 'captchaProvider',
  'sys.login.captcha.challengeTtlSeconds': 'captchaChallengeTtlSeconds',
  'sys.login.captcha.tokenTtlSeconds': 'captchaTokenTtlSeconds',
  'sys.login.captcha.forceAfterFailures': 'captchaForceAfterFailures',
};

/** 全部受管的 sys_config 键（供文档 / 系统参数页使用） */
export const MANAGED_CONFIG_KEYS: readonly string[] = Object.keys(SCHEMA);

/** 人机验证相关配置键 */
export const CAPTCHA_CONFIG_KEYS: readonly string[] = Object.keys(SCHEMA).filter((k) => k.startsWith('sys.login.captcha.'));

const DEFAULT_CONFIG: DynamicConfig = {
  multiLogin: true,
  uploadLimitMB: 20,
  demoEnabled: false,
  appName: 'BLS-KOX',
  captchaEnabled: true,
  captchaMode: 'adaptive',
  captchaProvider: 'altcha',
  captchaChallengeTtlSeconds: 180,
  captchaTokenTtlSeconds: 120,
  captchaForceAfterFailures: 3,
};

/** 解析单个字段（严格校验：类型 → 范围 → 枚举） */
function parseField(key: string, schema: ConfigSchemaEntry, val: unknown): { ok: boolean; value: any } {
  if (val === undefined || val === null) return { ok: true, value: schema.default };

  if (schema.type === 'bool') {
    const s = String(val).trim().toLowerCase();
    if (s === '1' || s === 'true') return { ok: true, value: true };
    if (s === '0' || s === 'false') return { ok: true, value: false };
    logger.warn('[dynamic-config] invalid bool, using default', { key, val });
    return { ok: false, value: schema.default };
  }

  if (schema.type === 'number') {
    const s = String(val).trim();
    // 严格数字：拒绝 "12abc" / "0x10" / "" 这类宽松转换
    if (!/^-?\d+(\.\d+)?$/.test(s)) {
      logger.warn('[dynamic-config] invalid number, using default', { key, val });
      return { ok: false, value: schema.default };
    }
    const n = Number(s);
    if (!Number.isFinite(n)) { logger.warn('[dynamic-config] invalid number', { key, val }); return { ok: false, value: schema.default }; }
    if (schema.min !== undefined && n < schema.min) { logger.warn('[dynamic-config] out of range', { key, val, min: schema.min }); return { ok: false, value: schema.default }; }
    if (schema.max !== undefined && n > schema.max) { logger.warn('[dynamic-config] out of range', { key, val, max: schema.max }); return { ok: false, value: schema.default }; }
    return { ok: true, value: n };
  }

  if (schema.type === 'enum') {
    const s = String(val).trim();
    if (!schema.values || schema.values.includes(s)) return { ok: true, value: s };
    logger.warn('[dynamic-config] invalid enum, using default', { key, val, allowed: schema.values });
    return { ok: false, value: schema.default };
  }

  if (schema.type === 'csv') {
    const raw = String(val).split(',');
    const allowed = new Set((schema.values ?? []) as readonly string[]);
    const picked: string[] = [];
    for (const item of raw) {
      const v = item.trim();
      if (!v) continue;
      if (allowed.size > 0 && !allowed.has(v)) {
        logger.warn('[dynamic-config] invalid csv item dropped', { key, item: v, allowed: schema.values });
        continue;
      }
      if (!picked.includes(v)) picked.push(v);
    }
    if (picked.length === 0) {
      logger.warn('[dynamic-config] csv empty after validation, using default', { key, val });
      return { ok: false, value: schema.default };
    }
    return { ok: true, value: picked };
  }

  return { ok: true, value: String(val) };
}

export function parseConfigValue(raw: Record<string, any>): DynamicConfig {
  const out: DynamicConfig = { ...DEFAULT_CONFIG };
  for (const [key, schema] of Object.entries(SCHEMA)) {
    const prop = KEY_MAP[key];
    if (!prop) continue;
    try {
      const parsed = parseField(key, schema, raw[key]);
      (out as any)[prop] = parsed.value;
    } catch (err) {
      logger.warn('[dynamic-config] parse error', { key, error: String(err) });
    }
  }
  return out;
}

/** 从 DynamicConfig 中提取公共（可下发前端）的人机验证配置 */
export function toPublicCaptchaConfig(cfg: DynamicConfig): { enabled: boolean; mode: CaptchaMode; provider: CaptchaProvider } {
  return {
    enabled: cfg.captchaEnabled && cfg.captchaMode !== 'off',
    mode: cfg.captchaMode,
    provider: cfg.captchaProvider,
  };
}

// injectable deps for testability
export async function getDynamicConfig(
  tenantId: string,
  _redisFn?: () => RedisLike | null,
  _dbFn?: () => any,
): Promise<DynamicConfig> {
  const redisFn = _redisFn ?? defaultGetRedis;
  const dbFn = _dbFn ?? defaultGetDb;

  // Redis cache
  try {
    const redis = redisFn();
    if (redis) {
      const cached = await redis.get(`${CACHE_PREFIX}${tenantId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (typeof parsed === 'object' && parsed) {
            return parseConfigValue(parsed);
          }
        } catch { logger.warn('[dynamic-config] redis cache parse failed'); }
      }
    }
  } catch (err) {
    logger.warn('[dynamic-config] redis read failed', { error: String(err) });
  }

  // DB read
  try {
    const db = await dbFn();
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
      const redis = redisFn();
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

export async function invalidateConfigCache(
  tenantId: string,
  _redisFn?: () => RedisLike | null,
): Promise<void> {
  const redisFn = _redisFn ?? defaultGetRedis;
  try {
    const redis = redisFn();
    if (redis) await redis.del(`${CACHE_PREFIX}${tenantId}`);
  } catch (err) {
    logger.warn('[dynamic-config] cache invalidation failed', { error: String(err) });
  }
}
