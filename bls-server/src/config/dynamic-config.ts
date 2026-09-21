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

/**
 * 人机验证提供方（统一大写，与配置项 captcha_primary_provider / captcha_fallback_provider 一致）：
 *   - ALTCHA：自托管 ALTCHA 开源库（第一层，静默 Proof-of-Work）
 *   - TIANAI：独立部署的 Java 图形验证码服务（第二层，行为轨迹匹配）
 * 两者都不在 Koa 内自行实现验证码算法。
 */
export type CaptchaProviderName = 'ALTCHA' | 'TIANAI';
export const CAPTCHA_PROVIDER_NAMES: readonly CaptchaProviderName[] = ['ALTCHA', 'TIANAI'];

/** 第二层（Tianai）验证类型 */
export type CaptchaSecondaryType = 'blockPuzzle' | 'clickWord';
export const CAPTCHA_SECONDARY_TYPES: readonly CaptchaSecondaryType[] = ['blockPuzzle', 'clickWord'];

/**
 * 第二层兼容类型：`none` 等价于「本部署没有图形验证码服务」，
 * 新配置用 `captcha_tianai_enabled=false` 表达同一件事（保留类型以兼容旧引用）。
 */
export type CaptchaSecondaryProvider = CaptchaProviderName | 'none';

export interface DynamicConfig {
  multiLogin: boolean;
  uploadLimitMB: number;
  demoEnabled: boolean;
  appName: string;
  // ===== 登录人机验证 =====
  /** 总开关：login_captcha_enabled */
  loginCaptchaEnabled: boolean;
  /** 第一层提供方：captcha_primary_provider（ALTCHA） */
  captchaPrimaryProvider: CaptchaProviderName;
  /** 第二层提供方：captcha_fallback_provider（TIANAI） */
  captchaFallbackProvider: CaptchaProviderName;
  /** captchaTicket 有效期（秒）：captcha_ticket_ttl，默认 120 */
  captchaTicketTtl: number;
  /** 本部署是否启用 TIANAI：captcha_tianai_enabled（未部署 Java 服务时置 false） */
  captchaTianaiEnabled: boolean;
  /** challenge / 二级会话有效期（秒）：captcha_challenge_ttl */
  captchaChallengeTtlSeconds: number;
  /** 同一账号近期连续登录失败达到该值 → 要求第二层 */
  captchaForceAfterFailures: number;
  /** 第二层图形验证类型：captcha_secondary_type */
  captchaSecondaryType: CaptchaSecondaryType;
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
  'login_captcha_enabled': { type: 'bool', default: true },
  'captcha_primary_provider': { type: 'enum', default: 'ALTCHA', values: CAPTCHA_PROVIDER_NAMES },
  'captcha_fallback_provider': { type: 'enum', default: 'TIANAI', values: CAPTCHA_PROVIDER_NAMES },
  'captcha_ticket_ttl': { type: 'number', default: 120, min: 30, max: 600 },
  // 未部署 Tianai Java 服务时置 false：风控命中也不再要求图形验证（第一层仍强制）
  'captcha_tianai_enabled': { type: 'bool', default: true },
  'captcha_challenge_ttl': { type: 'number', default: 180, min: 30, max: 900 },
  'captcha_force_after_failures': { type: 'number', default: 3, min: 1, max: 100 },
  'captcha_secondary_type': { type: 'enum', default: 'blockPuzzle', values: CAPTCHA_SECONDARY_TYPES },
};

const KEY_MAP: Record<string, keyof DynamicConfig> = {
  'sys.login.multiDevice': 'multiLogin',
  'sys.upload.maxSize': 'uploadLimitMB',
  'sys.demo.enabled': 'demoEnabled',
  'sys.app.name': 'appName',
  login_captcha_enabled: 'loginCaptchaEnabled',
  captcha_primary_provider: 'captchaPrimaryProvider',
  captcha_fallback_provider: 'captchaFallbackProvider',
  captcha_ticket_ttl: 'captchaTicketTtl',
  captcha_tianai_enabled: 'captchaTianaiEnabled',
  captcha_challenge_ttl: 'captchaChallengeTtlSeconds',
  captcha_force_after_failures: 'captchaForceAfterFailures',
  captcha_secondary_type: 'captchaSecondaryType',
};

/** 全部受管的 sys_config 键（供文档 / 系统参数页使用） */
export const MANAGED_CONFIG_KEYS: readonly string[] = Object.keys(SCHEMA);

/**
 * 人机验证相关配置键。
 * ⚠ 参数键已从 `sys.login.captcha.*` 改名为扁平的 `captcha_*`（+ `login_captcha_enabled`），
 * 这里必须按新命名推导 —— 用旧前缀过滤会得到**空数组**（静默失效）。
 */
export const CAPTCHA_CONFIG_KEYS: readonly string[] = Object.keys(SCHEMA).filter((k) => k.includes('captcha'));

const DEFAULT_CONFIG: DynamicConfig = {
  multiLogin: true,
  uploadLimitMB: 20,
  demoEnabled: false,
  appName: 'BLS-KOX',
  loginCaptchaEnabled: true,
  captchaPrimaryProvider: 'ALTCHA',
  captchaFallbackProvider: 'TIANAI',
  captchaTicketTtl: 120,
  captchaTianaiEnabled: true,
  captchaChallengeTtlSeconds: 180,
  captchaForceAfterFailures: 3,
  captchaSecondaryType: 'blockPuzzle',
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

/**
 * 从 DynamicConfig 中提取公共（可下发前端）的人机验证配置。
 * 只包含前端驱动组件所必需的信息：开关、模式、两级 provider、二级类型。
 * **不下发**阈值、失败次数、风险原因等内部规则（这些只写安全审计）。
 */
export function toPublicCaptchaConfig(cfg: DynamicConfig): {
  enabled: boolean;
  primaryProvider: CaptchaProviderName;
  fallbackProvider: CaptchaProviderName;
  tianaiEnabled: boolean;
} {
  return {
    enabled: cfg.loginCaptchaEnabled,
    primaryProvider: cfg.captchaPrimaryProvider,
    fallbackProvider: cfg.captchaFallbackProvider,
    tianaiEnabled: cfg.captchaTianaiEnabled,
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
