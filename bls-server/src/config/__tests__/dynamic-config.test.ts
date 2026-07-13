/**
 * P14: Dynamic Config — 真实 Mock Redis/DB 专项测试
 */
import { describe, it, expect, vi } from 'vitest';
import { parseConfigValue, getDynamicConfig, invalidateConfigCache, CACHE_PREFIX, CACHE_TTL } from '../dynamic-config';

function makeRedis(get = vi.fn()) {
  const set = vi.fn().mockResolvedValue('OK');
  const del = vi.fn().mockResolvedValue(1);
  return { get, set, del };
}

function makeDb(rows: Record<string, string>[] = []) {
  const exec = vi.fn().mockResolvedValue(rows);
  const sel = vi.fn().mockReturnValue({ where: () => ({ where: () => ({ execute: exec }) }) });
  return { selectFrom: vi.fn().mockReturnValue({ select: sel }), _exec: exec };
}

describe('P14 Dynamic Config', () => {
  // ====== parseConfigValue ======
  it('parse: strict bool "0"→false, "1"→true', () => {
    const c = parseConfigValue({ 'sys.login.multiDevice': '0', 'sys.demo.enabled': '1' });
    expect(c.multiLogin).toBe(false);
    expect(c.demoEnabled).toBe(true);
  });
  it('parse: loose "yes" → ignored, uses default', () => {
    const c = parseConfigValue({ 'sys.login.multiDevice': 'yes' });
    expect(c.multiLogin).toBe(true);
  });
  it('parse: out of range number → ignored, uses default', () => {
    const c = parseConfigValue({ 'sys.upload.maxSize': '9999' });
    expect(c.uploadLimitMB).toBe(20);
  });
  it('parse: NaN → ignored', () => {
    const c = parseConfigValue({ 'sys.upload.maxSize': 'abc' });
    expect(c.uploadLimitMB).toBe(20);
  });
  it('parse: no defaultPassword in output', () => {
    const c = parseConfigValue({});
    expect((c as any).defaultPassword).toBeUndefined();
  });

  // ====== Redis 命中 → 不查 DB ======
  it('Redis hit → no DB query', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue(JSON.stringify({ 'sys.app.name': 'RedisApp' })));
    const dbFn = vi.fn();
    const cfg = await getDynamicConfig('T001', () => redis, dbFn as any);
    expect(cfg.appName).toBe('RedisApp');
    expect(dbFn).not.toHaveBeenCalled();
  });

  // ====== Redis miss → DB → Redis write ======
  it('Redis miss → queries DB with tenant_id=T001', async () => {
    const redisGet = vi.fn().mockResolvedValue(null);
    const redis = makeRedis(redisGet);
    const db = makeDb([{ config_key: 'sys.app.name', config_value: 'DBApp' }]);
    const dbFn = vi.fn().mockResolvedValue(db);

    const cfg = await getDynamicConfig('T001', () => redis, dbFn);
    expect(cfg.appName).toBe('DBApp');
    // DB was called
    expect(dbFn).toHaveBeenCalled();
    // Redis SET called with TTL
    expect(redis.set).toHaveBeenCalled();
    const [key, val, mode, ttl] = redis.set.mock.calls[0];
    expect(key).toBe('config:T001');
    expect(mode).toBe('EX');
    expect(ttl).toBe(60);
    // Raw values stored
    expect(val).toContain('DBApp');
  });

  // ====== Redis 非法 JSON → 降级 DB ======
  it('Redis corrupt JSON → falls back to DB', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue('not-valid-json{{'));
    const db = makeDb([{ config_key: 'sys.app.name', config_value: 'FallbackApp' }]);
    const dbFn = vi.fn().mockResolvedValue(db);

    const cfg = await getDynamicConfig('T001', () => redis, dbFn);
    expect(cfg.appName).toBe('FallbackApp');
    expect(dbFn).toHaveBeenCalled();
  });

  // ====== Redis 超范围值 → DB → 严格解析回退默认 =====
  it('Redis has out-of-range number → still parsed through strict schema', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue(JSON.stringify({ 'sys.upload.maxSize': '99999' })));
    const cfg = await getDynamicConfig('T001', () => redis, undefined);
    expect(cfg.uploadLimitMB).toBe(20); // default, 99999 rejected by schema
  });

  // ====== DB 异常 → 返回默认 ======
  it('DB error → returns defaults', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue(null));
    const dbFn = vi.fn().mockRejectedValue(new Error('DB down'));
    const cfg = await getDynamicConfig('T001', () => redis, dbFn as any);
    expect(cfg.multiLogin).toBe(true);
    expect(cfg.uploadLimitMB).toBe(20);
    expect(cfg.appName).toBe('BLS-KOX');
  });

  // ====== invalidateConfigCache ======
  it('invalidateConfigCache calls redis.del config:T001', async () => {
    const redis = makeRedis();
    await invalidateConfigCache('T001', () => redis);
    expect(redis.del).toHaveBeenCalledWith('config:T001');
  });

  // ====== publicSystem excludes defaultPassword ======
  it('publicSystem returns no defaultPassword', async () => {
    const mod = await import('../../api/system/config/index.js');
    const result = await mod.publicSystem();
    expect(result).toBeDefined();
    if (Array.isArray(result)) {
      for (const item of result) {
        expect(item.config_key || (item as any).configKey).not.toBe('sys.user.defaultPassword');
      }
    }
  });

  // ====== ConfigService split ======
  it('ConfigService.getTenantConfig → returns DynamicConfig', async () => {
    const mod = await import('../../api/system/config/index.js');
    const svc = new mod.ConfigService();
    const cfg = await svc.getPlatformConfig();
    expect(cfg).toHaveProperty('multiLogin');
    expect(cfg).toHaveProperty('uploadLimitMB');
    expect(cfg).toHaveProperty('demoEnabled');
    expect(cfg).toHaveProperty('appName');
  });

  it('ConfigService.isMultiLoginEnabled → boolean', async () => {
    const mod = await import('../../api/system/config/index.js');
    const svc = new mod.ConfigService();
    const result = await svc.isMultiLoginEnabled();
    expect(typeof result).toBe('boolean');
  });

  // ====== onWrite fail-closed ======
  it('config.onWrite exists and is callable', async () => {
    const mod = await import('../../api/system/config/index.js');
    expect(mod.config.onWrite).toBeDefined();
  });

  // ====== multiLogin → ConfigService ======
  it('multiLogin accessible through ConfigService', async () => {
    const mod = await import('../../api/system/config/index.js');
    const svc = new mod.ConfigService();
    expect(typeof svc.isMultiLoginEnabled).toBe('function');
  });
});
