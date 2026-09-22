/**
 * 系统参数批量事务保存 —— 白名单 / 保存前预检 / 事务回滚
 *
 * 目的：
 *   1. 只允许写受管键（`MANAGED_CONFIG_KEYS`），旧键 `sys.login.captcha.*` 一律拒绝；
 *   2. 预检：把「生效配置」算出来，若 `captcha_tianai_enabled=true` 则先探活，
 *      不可用则整体拒绝 —— 避免「保存后无人能登录」；
 *   3. 写入在**单个事务**内完成，任一失败整体回滚，且不刷新配置缓存。
 */
import { describe, it, expect, vi } from 'vitest';

/** vi.mock 会被提升到顶部，共享可变状态必须用 vi.hoisted 声明 */
const state = vi.hoisted(() => ({ tianaiUrl: 'https://tianai.test' }));

/** 只覆盖 captcha.tianaiUrl（其余 env 保持真实值，避免其他模块在 import 期读不到配置） */
vi.mock('../../../../config/env', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    env: {
      ...actual.env,
      captcha: {
        ...actual.env.captcha,
        get tianaiUrl() { return state.tianaiUrl; },
      },
    },
  };
});

const cacheState = vi.hoisted(() => ({ invalidated: [] as string[] }));
vi.mock('../../../../config/dynamic-config', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    invalidateConfigCache: async (tid: string) => { cacheState.invalidated.push(tid); },
  };
});

import { assertEffectiveCaptchaUsable, assertManagedKeys, saveConfigBatch } from '../batch';

/** 健康检查替身 */
function provider(healthy: boolean) {
  return { healthCheck: async () => healthy } as any;
}

const baseRow = { login_captcha_enabled: 'true' };

describe('assertManagedKeys', () => {
  it('受管键通过（统一扁平键），非受管键拒绝（避免通过该接口写任意 sys_config）', () => {
    expect(() => assertManagedKeys([
      { configKey: 'captcha_secondary_type', configValue: 'clickWord' },
      { configKey: 'captcha_tianai_enabled', configValue: 'true' },
      { configKey: 'login_captcha_enabled', configValue: 'true' },
    ])).not.toThrow();

    // 旧键（迁移 20260922_018 已改写）与随便造的键一律拒绝
    expect(() => assertManagedKeys([
      { configKey: 'sys.login.captcha.enabled', configValue: 'true' },
    ])).toThrowError(/不支持批量修改/);

    expect(() => assertManagedKeys([
      { configKey: 'sys.login.captcha.secondaryProvider', configValue: 'tianai' },
    ])).toThrowError(/不支持批量修改/);

    expect(() => assertManagedKeys([
      { configKey: 'sys.whatever.unknown', configValue: 'x' },
    ])).toThrowError(/不支持批量修改/);
  });
});

describe('assertEffectiveCaptchaUsable — 保存前 Tianai 可用性预检', () => {
  it('启用第二层且服务健康 → 允许保存', async () => {
    state.tianaiUrl = 'https://tianai.test';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'captcha_tianai_enabled', configValue: 'true' }],
      provider(true),
    )).resolves.toBeUndefined();
  });

  it('启用第二层但健康检查失败 → 拒绝保存', async () => {
    state.tianaiUrl = 'https://tianai.test';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'captcha_tianai_enabled', configValue: 'true' }],
      provider(false),
    )).rejects.toThrowError(/不可用/);
  });

  it('启用第二层但未配置 TIANAI_BASE_URL → 拒绝保存', async () => {
    state.tianaiUrl = '';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'captcha_tianai_enabled', configValue: 'true' }],
      provider(true),
    )).rejects.toThrowError(/TIANAI_BASE_URL/);
    state.tianaiUrl = 'https://tianai.test';
  });

  it('总开关关闭 → 不校验第二层（可离线保存）', async () => {
    state.tianaiUrl = '';
    await expect(assertEffectiveCaptchaUsable(
      { login_captcha_enabled: 'false' },
      [{ configKey: 'captcha_secondary_type', configValue: 'clickWord' }],
      provider(false),
    )).resolves.toBeUndefined();
    state.tianaiUrl = 'https://tianai.test';
  });

  it('第二层未启用（captcha_tianai_enabled=false，默认）→ 不校验', async () => {
    state.tianaiUrl = '';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'captcha_tianai_enabled', configValue: 'false' }],
      provider(false),
    )).resolves.toBeUndefined();
    state.tianaiUrl = 'https://tianai.test';
  });

  it('库中已启用第二层（本次未改开关）→ 仍要校验，防止「改坏其他参数」把登录锁死', async () => {
    state.tianaiUrl = 'https://tianai.test';
    await expect(assertEffectiveCaptchaUsable(
      { ...baseRow, captcha_tianai_enabled: 'true' },
      [{ configKey: 'captcha_force_after_failures', configValue: '5' }],
      provider(false),
    )).rejects.toThrowError(/不可用/);
  });
});

/** 事务替身：记录 begin / commit / rollback，并可让第 N 次写入抛错 */
function makeTxDb(failOnKey?: string) {
  const events: string[] = [];
  const writes: string[] = [];

  const trx = {
    updateTable: () => {
      const chain: any = {
        set: () => chain,
        where: () => chain,
        executeTakeFirst: async () => {
          // 模拟「行不存在」→ 走 insert 分支
          return { numUpdatedRows: 0 };
        },
      };
      return chain;
    },
    insertInto: () => {
      const chain: any = {
        values: (v: any) => {
          writes.push(String(v.config_key));
          if (failOnKey && v.config_key === failOnKey) {
            return { execute: async () => { throw new Error('db write failed'); } };
          }
          return { execute: async () => { events.push(`write:${v.config_key}`); return undefined; } };
        },
      };
      return chain;
    },
  };

  const db = {
    transaction: () => ({
      execute: async (cb: (t: any) => Promise<void>) => {
        events.push('begin');
        try {
          await cb(trx);
          events.push('commit');
        } catch (err) {
          events.push('rollback');
          throw err;
        }
      },
    }),
  };

  return { db, events, writes };
}

describe('saveConfigBatch — 单事务写入与回滚', () => {
  it('全部写入成功：同一事务内 begin → commit（不出现 rollback）', async () => {
    const { db, events } = makeTxDb();
    await saveConfigBatch(db, 'T001', [
      { configKey: 'captcha_ticket_ttl', configValue: '120' },
      { configKey: 'captcha_secondary_type', configValue: 'clickWord' },
    ]);
    expect(events.filter((e) => e === 'begin')).toHaveLength(1);
    expect(events).toContain('commit');
    expect(events).not.toContain('rollback');
  });

  it('任一项写入失败 → 整体回滚并抛出「已回滚」错误（不返回部分成功）', async () => {
    const { db, events } = makeTxDb('captcha_secondary_type');
    await expect(saveConfigBatch(db, 'T001', [
      { configKey: 'captcha_ticket_ttl', configValue: '120' },
      { configKey: 'captcha_secondary_type', configValue: 'boom' },
    ])).rejects.toThrowError(/已回滚/);
    expect(events).toContain('rollback');
    expect(events).not.toContain('commit');
  });
});
