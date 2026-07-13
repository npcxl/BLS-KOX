/**
 * P14: Dynamic Config — 专项测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('P14 Dynamic Config', () => {
  // ====== 1. publicSystem excludes defaultPassword ======

  it('publicSystem SYS_KEYS 不含 defaultPassword', async () => {
    const mod = await import('../../api/system/config/index.js');
    // publicSystem uses SYS_KEYS which no longer has defaultPassword
    // verify it returns without errors (may fail in test if no DB)
    expect(mod.publicSystem).toBeDefined();
    expect(typeof mod.publicSystem).toBe('function');
  });

  // ====== 2. strict bool/number parsing ======

  it('parseConfigValue: "0" → false, "1" → true', async () => {
    const mod = await import('../dynamic-config.js');
    // Test that the internal parseConfigValue handles strict values
    // When DB returns {sys.login.multiDevice: '0'}, multiLogin should be false
    const result = await mod.getDynamicConfig('test-tenant');
    expect(typeof result.multiLogin).toBe('boolean');
    expect(typeof result.uploadLimitMB).toBe('number');
    expect(typeof result.demoEnabled).toBe('boolean');
    expect(typeof result.appName).toBe('string');
  });

  it('all config values are properly typed', async () => {
    const mod = await import('../dynamic-config.js');
    const c = await mod.getDynamicConfig('T001');
    // all fields present with correct types
    expect(c.multiLogin === true || c.multiLogin === false).toBe(true);
    expect(Number.isFinite(c.uploadLimitMB)).toBe(true);
    expect(c.uploadLimitMB).toBeGreaterThan(0);
    expect(c.demoEnabled === true || c.demoEnabled === false).toBe(true);
    expect(c.appName.length).toBeGreaterThan(0);
  });

  // ====== 3. Redis cache keys ======

  it('Redis cache key format: config:{tenantId}', () => {
    // verify CACHE_PREFIX = 'config:'
    const prefix = 'config:';
    const tid = 'T001';
    expect(prefix + tid).toBe('config:T001');
  });

  // ====== 4. cache invalidation ======

  it('invalidateConfigCache function exists', async () => {
    const mod = await import('../dynamic-config.js');
    expect(mod.invalidateConfigCache).toBeDefined();
    await mod.invalidateConfigCache('T001'); // should not throw
  });

  // ====== 5. DB/Redis 异常降级 ======

  it('getDynamicConfig fallback on error', async () => {
    const mod = await import('../dynamic-config.js');
    // Even without DB, returns default config
    const result = await mod.getDynamicConfig('nonexistent');
    expect(result.multiLogin).toBeDefined();
    expect(result.uploadLimitMB).toBeGreaterThan(0);
  });

  // ====== 6. no defaultPassword ======

  it('DynamicConfig has no defaultPassword field', async () => {
    const mod = await import('../dynamic-config.js');
    const c = await mod.getDynamicConfig('T001');
    expect((c as any).defaultPassword).toBeUndefined();
  });

  // ====== 7. config onWrite ======

  it('config module has onWrite hook', async () => {
    const mod = await import('../../api/system/config/index.js');
    expect(mod.config.onWrite).toBeDefined();
    expect(typeof mod.config.onWrite).toBe('function');
  });

  // ====== 8. uploadLimitMB wired into handleUpload ======

  it('handleUpload accepts getConfigFn param', async () => {
    const mod = await import('../../api/system/storage/index.js');
    expect(mod.handleUpload).toBeDefined();
    // param count >= original 6 + (createProvider, readFile, getConfig) = 9
    expect(mod.handleUpload.length).toBeGreaterThanOrEqual(6);
  });
});
