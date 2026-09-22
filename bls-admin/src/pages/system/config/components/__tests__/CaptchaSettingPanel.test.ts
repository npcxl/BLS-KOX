/**
 * @vitest-environment node
 *
 * 系统参数「登录人机验证」面板 —— 配置键与过滤/批量保存契约测试
 *
 * 断言：
 *   1. 面板只使用 8 个正式扁平键（`login_captcha_enabled` / `captcha_*`），
 *      且**不含** `sys.login.captcha.*`、`mode`、`requiredStage` 等历史契约；
 *   2. 批量保存项被白名单化（旧键/伪造键会被丢弃，不会打到后端 400）；
 *   3. 配置行过滤必须分页扫描（sys_config 行数超过单页上限 100 时仍能读全）。
 */
import { describe, expect, it, vi } from 'vitest';
import { CAPTCHA_KEYS, loadCaptchaRows, toBatchItems } from '../CaptchaSettingPanel';

const OFFICIAL_KEYS = [
  'login_captcha_enabled',
  'captcha_primary_provider',
  'captcha_fallback_provider',
  'captcha_ticket_ttl',
  'captcha_tianai_enabled',
  'captcha_challenge_ttl',
  'captcha_force_after_failures',
  'captcha_secondary_type',
];

describe('CaptchaSettingPanel — 配置键（唯一正式契约）', () => {
  it('恰好 8 个键，且与后端 SCHEMA 完全一致', () => {
    const keys = Object.values(CAPTCHA_KEYS);
    expect(keys).toHaveLength(8);
    expect([...keys].sort()).toEqual([...OFFICIAL_KEYS].sort());
  });

  it('不含任何历史契约（sys.login.captcha.* / mode / requiredStage / captchaToken）', () => {
    const dump = JSON.stringify(CAPTCHA_KEYS);
    expect(dump).not.toContain('sys.login.captcha');
    expect(dump).not.toContain('mode');
    expect(dump).not.toContain('requiredStage');
    expect(dump).not.toContain('captchaToken');
    expect(dump).not.toContain('secondaryProvider');
    expect(dump).not.toContain('tokenTtl');
  });
});

describe('toBatchItems — 白名单化', () => {
  it('正式键原样透传并带上展示名/备注', () => {
    const items = toBatchItems([
      [CAPTCHA_KEYS.tianaiEnabled, 'true'],
      [CAPTCHA_KEYS.secondaryType, 'clickWord'],
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ configKey: 'captcha_tianai_enabled', configValue: 'true', configType: 'sys' });
    expect(items[0].configName).toBeTruthy();
    expect(items[1]).toMatchObject({ configKey: 'captcha_secondary_type', configValue: 'clickWord' });
  });

  it('旧键 / 伪造键被丢弃（不会造成后端 400 "不支持批量修改的参数"）', () => {
    const items = toBatchItems([
      ['sys.login.captcha.mode', 'always'],
      ['sys.login.captcha.enabled', 'false'],
      ['sys.whatever.unknown', 'x'],
      [CAPTCHA_KEYS.enabled, 'true'],
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].configKey).toBe('login_captcha_enabled');
  });
});

describe('loadCaptchaRows — 配置页过滤', () => {
  function makeFetcher(pages: Array<Array<{ configKey: string; configValue: string }>>) {
    return vi.fn(async (_resource: any, params: any) => {
      const page = pages[(params?.pageNum ?? 1) - 1] ?? [];
      return { code: 200, data: page } as any;
    });
  }

  it('第 1 页没有目标键时继续翻页（不会被单页 100 条上限截断）', async () => {
    const filler = Array.from({ length: 100 }, (_, i) => ({ configKey: `sys.filler.${i}`, configValue: 'x' }));
    const target = OFFICIAL_KEYS.map((k) => ({ configKey: k, configValue: 'true' }));
    const fetcher = makeFetcher([filler, target]);

    const rows = await loadCaptchaRows(fetcher as any);
    expect(rows.size).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(rows.get('captcha_tianai_enabled')?.configValue).toBe('true');
  });

  it('首页就找齐 → 只请求一次', async () => {
    const target = OFFICIAL_KEYS.map((k) => ({ configKey: k, configValue: 'v' }));
    const fetcher = makeFetcher([target]);
    const rows = await loadCaptchaRows(fetcher as any);
    expect(rows.size).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('忽略非人机验证键（不会把其他系统参数混进来）', async () => {
    const fetcher = makeFetcher([[
      { configKey: 'sys.app.name', configValue: 'X' },
      { configKey: CAPTCHA_KEYS.enabled, configValue: 'false' },
    ]]);
    const rows = await loadCaptchaRows(fetcher as any);
    expect([...rows.keys()]).toEqual(['login_captcha_enabled']);
  });
});
