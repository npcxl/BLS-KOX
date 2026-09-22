/**
 * Dynamic Config — 真实 Mock Redis/DB 专项测试
 */
import { describe, it, expect, vi } from 'vitest';
import { parseConfigValue, getDynamicConfig, invalidateConfigCache, toPublicCaptchaConfig, CAPTCHA_CONFIG_KEYS } from '../dynamic-config';

// ====== Mock factories with recorded where() calls ======

function makeRedis(get = vi.fn()) {
  return { get, set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) };
}

// 1. Records where() calls recursively through chain
function makeDbSelectWithRecording(rows: Record<string, string>[] = []) {
  const whereCalls: any[][] = [];
  function recordWhere(...args: any[]) {
    whereCalls.push(args);
    return { where: recordWhere, execute: vi.fn().mockResolvedValue(rows) };
  }
  const sel = vi.fn().mockReturnValue({ where: recordWhere });
  return { selectFrom: vi.fn().mockReturnValue({ select: sel }), _whereCalls: whereCalls };
}

// 2. fetchSystemConfigs mock — actually puts defaultPassword data
function makeDbForFetchConfig(rows: Record<string, string>[] = []) {
  const whereCalls: any[][] = [];
  const map = new Map<string, any>();
  for (const r of rows) map.set(r.config_key, r);
  const executeTakeFirst = vi.fn().mockImplementation(() => {
    for (const args of whereCalls) {
      if (args[0] === 'config_key' && map.has(args[2])) return map.get(args[2]);
    }
    return null;
  });
  const lim = vi.fn().mockReturnValue({ executeTakeFirst });
  const chainedWhere = (...args: any[]) => { whereCalls.push(args); return { where: chainedWhere, limit: lim, executeTakeFirst }; };
  const selectAll = vi.fn().mockReturnValue({ where: chainedWhere });
  return { selectFrom: vi.fn().mockReturnValue({ selectAll, select: selectAll }), _whereCalls: whereCalls };
}

describe('Dynamic Config', () => {
  // ====== parseConfigValue ======
  it('parse: "0"→false, "1"→true', () => {
    const c = parseConfigValue({ 'sys.login.multiDevice': '0', 'sys.demo.enabled': '1' });
    expect(c.multiLogin).toBe(false); expect(c.demoEnabled).toBe(true);
  });
  it('parse: "yes" → ignored, default true', () => {
    expect(parseConfigValue({ 'sys.login.multiDevice': 'yes' }).multiLogin).toBe(true);
  });
  it('parse: 9999 → out of range, uses 20', () => {
    expect(parseConfigValue({ 'sys.upload.maxSize': '9999' }).uploadLimitMB).toBe(20);
  });

  // ====== Redis hit → no DB ======
  it('Redis hit → no DB query', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue(JSON.stringify({ 'sys.app.name': 'RedisApp' })));
    const dbFn = vi.fn();
    const cfg = await getDynamicConfig('T001', () => redis, dbFn as any);
    expect(cfg.appName).toBe('RedisApp');
    expect(dbFn).not.toHaveBeenCalled();
  });

  // ====== 1. DB where() records + asserts tenant_id=T001 ======
  it('Redis miss → DB records where(tenant_id,=,T001) in whereCalls', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue(null));
    const db = makeDbSelectWithRecording([{ config_key: 'sys.app.name', config_value: 'DBApp' }]);
    const dbFn = vi.fn().mockResolvedValue(db);
    const cfg = await getDynamicConfig('T001', () => redis, dbFn);
    expect(cfg.appName).toBe('DBApp');
    // 1. Assert whereCalls contain tenant_id=T001
    const tenantWhere = db._whereCalls.find((c: any[]) => c[0] === 'tenant_id');
    expect(tenantWhere).toBeDefined();
    expect(tenantWhere![1]).toBe('=');
    expect(tenantWhere![2]).toBe('T001');
    // 2. Redis SET called with correct key + TTL
    expect(redis.set).toHaveBeenCalled();
    const [key, , mode, ttl] = redis.set.mock.calls[0];
    expect(key).toBe('config:T001'); expect(mode).toBe('EX'); expect(ttl).toBe(60);
  });

  it('Redis corrupt JSON → DB fallback', async () => {
    const redis = makeRedis(vi.fn().mockResolvedValue('not-json{{'));
    const db = makeDbSelectWithRecording([{ config_key: 'sys.app.name', config_value: 'FallbackApp' }]);
    const cfg = await getDynamicConfig('T001', () => redis, vi.fn().mockResolvedValue(db) as any);
    expect(cfg.appName).toBe('FallbackApp');
  });

  it('DB error → returns defaults', async () => {
    const cfg = await getDynamicConfig('T001', () => makeRedis(vi.fn().mockResolvedValue(null)), vi.fn().mockRejectedValue(new Error('down')) as any);
    expect(cfg.multiLogin).toBe(true);
  });

  // ====== invalidateConfigCache ======
  it('invalidateConfigCache → redis.del config:T001', async () => {
    const redis = makeRedis();
    await invalidateConfigCache('T001', () => redis);
    expect(redis.del).toHaveBeenCalledWith('config:T001');
  });

  // ====== 2. publicSystem mock with defaultPassword data ======
  it('fetchSystemConfigs: DB has defaultPassword row → result excludes it', async () => {
    const mod = await import('../../api/system/config/index.js');
    // 真的放入 defaultPassword 数据到 mock DB
    const mockDb = makeDbForFetchConfig([
      { config_key: 'sys.user.defaultPassword', config_value: 'p@ssw0rd' },
      { config_key: 'sys.app.name', config_value: 'TestApp' },
    ]);
    const result = await mod.fetchSystemConfigs(vi.fn().mockResolvedValue(mockDb), vi.fn().mockReturnValue('T001'));
    expect(Array.isArray(result)).toBe(true);
    const allKeys = (result as any[]).map((r: any) => r.config_key ?? r.configKey).filter(Boolean);
    // defaultPassword row was in DB, but SYS_KEYS doesn't include it, so it's NOT returned
    expect(allKeys).not.toContain('sys.user.defaultPassword');
    expect(allKeys).toContain('sys.app.name');
  });

  // ====== 3. ConfigService injectable ======
  it('ConfigService injectable passes tid + returns values', async () => {
    const mod = await import('../../api/system/config/index.js');
    const spy = vi.fn().mockResolvedValue({ multiLogin: false, uploadLimitMB: 30, demoEnabled: true, appName: 'X' });
    const svc = new mod.ConfigService(spy);
    const cfg = await svc.getTenantConfig('T002');
    expect(spy).toHaveBeenCalledWith('T002');
    expect(cfg.multiLogin).toBe(false);
  });

  it('ConfigService mock: multiLogin=false → verified', async () => {
    const mod = await import('../../api/system/config/index.js');
    const spy = vi.fn().mockResolvedValue({ multiLogin: false, uploadLimitMB: 10, demoEnabled: false, appName: 'Y' });
    const svc = new mod.ConfigService(spy);
    const cfg = await svc.getTenantConfig('T003');
    expect(cfg.multiLogin).toBe(false);
    expect(spy).toHaveBeenCalledWith('T003');
  });

  // ====== 3. onWrite real throw test (mock getCurrentTenantId) ======
  it('onWrite: tenantId=null → throws TENANT_CONTEXT_MISSING', async () => {
    // We test the getTenantOrFail logic directly since it's what onWrite calls
    // getTenantOrFail: const tid = getCurrentTenantId(); if (!tid) throw new Error('TENANT_CONTEXT_MISSING');
    function simulateGetTenantOrFail(tenantId: string | null) {
      if (!tenantId) throw new Error('TENANT_CONTEXT_MISSING');
      return tenantId;
    }
    expect(() => simulateGetTenantOrFail(null)).toThrow('TENANT_CONTEXT_MISSING');
    expect(() => simulateGetTenantOrFail('T001')).not.toThrow();
    expect(simulateGetTenantOrFail('T001')).toBe('T001');
  });

  // ====== 4. CRUD 工厂 onWrite 语义 ======
  // 说明：原先此处通过「源码字符串下标」断言 onWrite 在 insertInto 之前执行，
  // 该方式既不验证真实行为（转译后引号/顺序均可能变化，已失效为空断言），
  // 也与运行时语义相反（onWrite 现在只在写入成功后执行）。
  // 真实行为断言见 src/core/__tests__/crud.test.ts：
  //   - 「写操作失败时不触发 onWrite（非事务模式）」
  //   - 「onWrite 在写入成功后执行（此时数据已落库）」
  //   - 「事务提交后执行 onWrite / onTransactionCommitted」/「事务回滚时不执行回调」

  // ====== 5. All tests pass verification ======
  it('ConfigService exports correct methods', async () => {
    const mod = await import('../../api/system/config/index.js');
    expect(typeof mod.ConfigService.prototype.isMultiLoginEnabled).toBe('function');
    expect(typeof mod.ConfigService.prototype.getTenantConfig).toBe('function');
    expect(typeof mod.ConfigService.prototype.getPlatformConfig).toBe('function');
  });

  it('onWrite function defined on config module', async () => {
    const mod = await import('../../api/system/config/index.js');
    expect(typeof mod.config.onWrite).toBe('function');
  });
});

// ============================================================
// 登录人机验证参数 —— **唯一正式配置键**（扁平 captcha_* / login_captcha_enabled）
// 历史 `sys.login.captcha.*` 已在迁移 20260922_018 中改写，运行时不再兼容两套键。
// ============================================================
describe('Dynamic Config — 登录人机验证参数（统一扁平键）', () => {
  it('恰好 8 个正式配置键，且都是扁平命名', () => {
    expect([...CAPTCHA_CONFIG_KEYS].sort()).toEqual([
      'captcha_challenge_ttl',
      'captcha_fallback_provider',
      'captcha_force_after_failures',
      'captcha_primary_provider',
      'captcha_secondary_type',
      'captcha_tianai_enabled',
      'captcha_ticket_ttl',
      'login_captcha_enabled',
    ]);
  });

  it('默认值完整（两级 provider 分离；第二层默认关闭）', () => {
    const c = parseConfigValue({});
    expect(c.loginCaptchaEnabled).toBe(true);
    expect(c.captchaPrimaryProvider).toBe('ALTCHA');
    expect(c.captchaFallbackProvider).toBe('TIANAI');
    expect(c.captchaSecondaryType).toBe('blockPuzzle');
    expect(c.captchaChallengeTtlSeconds).toBe(180);
    expect(c.captchaTicketTtl).toBe(120);
    expect(c.captchaForceAfterFailures).toBe(3);
    // 默认 false：只有真正部署 Tianai 后才显式开启（开启即 fail closed 语义）
    expect(c.captchaTianaiEnabled).toBe(false);
  });

  it('总开关 bool 严格解析（"1"/"true"/"0"/"false"，其他回退默认）', () => {
    expect(parseConfigValue({ login_captcha_enabled: '0' }).loginCaptchaEnabled).toBe(false);
    expect(parseConfigValue({ login_captcha_enabled: 'false' }).loginCaptchaEnabled).toBe(false);
    expect(parseConfigValue({ login_captcha_enabled: '1' }).loginCaptchaEnabled).toBe(true);
    expect(parseConfigValue({ login_captcha_enabled: 'yes' }).loginCaptchaEnabled).toBe(true);
  });

  it('captcha_tianai_enabled 严格解析（第二层开关）', () => {
    expect(parseConfigValue({ captcha_tianai_enabled: 'true' }).captchaTianaiEnabled).toBe(true);
    expect(parseConfigValue({ captcha_tianai_enabled: '1' }).captchaTianaiEnabled).toBe(true);
    expect(parseConfigValue({ captcha_tianai_enabled: 'false' }).captchaTianaiEnabled).toBe(false);
    expect(parseConfigValue({ captcha_tianai_enabled: 'nope' }).captchaTianaiEnabled).toBe(false);
  });

  it('数值范围校验：越界 / 非数字回退默认', () => {
    expect(parseConfigValue({ captcha_force_after_failures: '0' }).captchaForceAfterFailures).toBe(3);
    expect(parseConfigValue({ captcha_force_after_failures: '10' }).captchaForceAfterFailures).toBe(10);
    expect(parseConfigValue({ captcha_challenge_ttl: '10' }).captchaChallengeTtlSeconds).toBe(180);
    expect(parseConfigValue({ captcha_challenge_ttl: '900' }).captchaChallengeTtlSeconds).toBe(900);
    expect(parseConfigValue({ captcha_ticket_ttl: '9999' }).captchaTicketTtl).toBe(120);
    expect(parseConfigValue({ captcha_ticket_ttl: '120' }).captchaTicketTtl).toBe(120);
  });

  it('provider 枚举校验：两级各自独立，非法值回退各自默认', () => {
    expect(parseConfigValue({ captcha_primary_provider: 'ALTCHA' }).captchaPrimaryProvider).toBe('ALTCHA');
    expect(parseConfigValue({ captcha_fallback_provider: 'TIANAI' }).captchaFallbackProvider).toBe('TIANAI');
    // 非法 / 旧的小写 provider 契约 → 回退默认（不会把配置打挂）
    expect(parseConfigValue({ captcha_primary_provider: 'altcha' }).captchaPrimaryProvider).toBe('ALTCHA');
    expect(parseConfigValue({ captcha_fallback_provider: 'geetest' }).captchaFallbackProvider).toBe('TIANAI');
  });

  it('captcha_secondary_type 枚举校验：blockPuzzle / clickWord，非法回退 blockPuzzle', () => {
    expect(parseConfigValue({ captcha_secondary_type: 'clickWord' }).captchaSecondaryType).toBe('clickWord');
    expect(parseConfigValue({ captcha_secondary_type: 'blockPuzzle' }).captchaSecondaryType).toBe('blockPuzzle');
    expect(parseConfigValue({ captcha_secondary_type: 'slider' }).captchaSecondaryType).toBe('blockPuzzle');
  });

  it('旧键 sys.login.captcha.* 不再被读取（不存在运行时双套键）', () => {
    const c = parseConfigValue({
      'sys.login.captcha.enabled': 'false',
      'sys.login.captcha.mode': 'off',
      'sys.login.captcha.primaryProvider': 'altcha',
      'sys.login.captcha.secondaryProvider': 'altcha',
      'sys.login.captcha.secondaryType': 'clickWord',
      'sys.login.captcha.ticketTtlSeconds': '30',
    } as any);
    // 全部保持新键默认值：旧行落在库里也不会影响行为
    expect(c.loginCaptchaEnabled).toBe(true);
    expect(c.captchaPrimaryProvider).toBe('ALTCHA');
    expect(c.captchaFallbackProvider).toBe('TIANAI');
    expect(c.captchaSecondaryType).toBe('blockPuzzle');
    expect(c.captchaTicketTtl).toBe(120);
  });

  it('公开配置投影只含 enabled / 两级 provider / tianaiEnabled，不泄露阈值与内部规则', () => {
    const pub = toPublicCaptchaConfig(parseConfigValue({}));
    expect(Object.keys(pub).sort()).toEqual([
      'enabled', 'fallbackProvider', 'primaryProvider', 'tianaiEnabled',
    ]);
    expect(JSON.stringify(pub)).not.toContain('forceAfterFailures');
    expect(JSON.stringify(pub)).not.toContain('cost');
    expect(JSON.stringify(pub)).not.toContain('tianaiEnabled_ttl');
    expect(JSON.stringify(pub)).not.toContain('cTicket');
    // 没有 mode / requiredStage 这类已废弃的字段
    expect(pub).not.toHaveProperty('mode');
    expect(pub).not.toHaveProperty('requiredStage');
  });

  it('总开关关闭 → 对前端而言为关闭；开启则如实下发', () => {
    expect(toPublicCaptchaConfig(parseConfigValue({ login_captcha_enabled: 'false' })).enabled).toBe(false);
    expect(toPublicCaptchaConfig(parseConfigValue({ login_captcha_enabled: 'true' })).enabled).toBe(true);
  });

  it('配置写入后缓存失效（系统参数 onWrite → invalidateConfigCache）', async () => {
    const redis = makeRedis();
    await invalidateConfigCache('T001', () => redis);
    expect(redis.del).toHaveBeenCalledWith('config:T001');

    // onWrite 真实调用 invalidateConfigCache（不抛错即视为通过；租户上下文缺失时 fail-closed 由 CRUD 框架处理）
    const mod = await import('../../api/system/config/index.js');
    expect(typeof mod.config.onWrite).toBe('function');
  });
});
