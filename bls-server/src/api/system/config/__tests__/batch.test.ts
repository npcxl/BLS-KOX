/**
 * 系统参数批量事务保存 —— 保存前的可用性预检
 *
 * 目的：避免「把 secondaryProvider 改成 tianai 但服务不可用」导致**保存后无人能登录**。
 * 预检失败必须拒绝保存（整体回滚），而不是"先存下来再说"。
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

import { assertEffectiveCaptchaUsable, assertManagedKeys } from '../batch';

/** 健康检查替身 */
function provider(healthy: boolean) {
  return { healthCheck: async () => healthy } as any;
}

const baseRow = { 'sys.login.captcha.enabled': 'true', 'sys.login.captcha.mode': 'adaptive' };

describe('assertManagedKeys', () => {
  it('受管键通过，非受管键拒绝（避免通过该接口写任意 sys_config）', () => {
    expect(() => assertManagedKeys([
      { configKey: 'sys.login.captcha.secondaryType', configValue: 'clickWord' },
    ])).not.toThrow();

    // 受管白名单之外的键（例如随便造一个 / 已废弃的旧键）一律拒绝
    expect(() => assertManagedKeys([
      { configKey: 'sys.login.captcha.provider', configValue: 'builtin' },
    ])).toThrowError(/不支持批量修改/);

    expect(() => assertManagedKeys([
      { configKey: 'sys.whatever.unknown', configValue: 'x' },
    ])).toThrowError(/不支持批量修改/);
  });
});

describe('assertEffectiveCaptchaUsable — 保存前 Tianai 可用性预检', () => {
  it('启用 tianai 且服务健康 → 允许保存', async () => {
    state.tianaiUrl = 'https://tianai.test';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'sys.login.captcha.secondaryProvider', configValue: 'tianai' }],
      provider(true),
    )).resolves.toBeUndefined();
  });

  it('启用 tianai 但健康检查失败 → 拒绝保存', async () => {
    state.tianaiUrl = 'https://tianai.test';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'sys.login.captcha.secondaryProvider', configValue: 'tianai' }],
      provider(false),
    )).rejects.toThrowError(/不可用/);
  });

  it('启用 tianai 但未配置 TIANAI_BASE_URL → 拒绝保存', async () => {
    state.tianaiUrl = '';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'sys.login.captcha.secondaryProvider', configValue: 'tianai' }],
      provider(true),
    )).rejects.toThrowError(/TIANAI_BASE_URL/);
    state.tianaiUrl = 'https://tianai.test';
  });

  it('人机验证关闭 / mode=off → 不校验第二层（可离线保存）', async () => {
    state.tianaiUrl = '';
    await expect(assertEffectiveCaptchaUsable(
      { ...baseRow, 'sys.login.captcha.enabled': 'false' },
      [{ configKey: 'sys.login.captcha.secondaryType', configValue: 'clickWord' }],
      provider(false),
    )).resolves.toBeUndefined();

    await expect(assertEffectiveCaptchaUsable(
      { ...baseRow, 'sys.login.captcha.mode': 'off' },
      [{ configKey: 'sys.login.captcha.secondaryType', configValue: 'clickWord' }],
      provider(false),
    )).resolves.toBeUndefined();
    state.tianaiUrl = 'https://tianai.test';
  });

  it('第二层未启用（secondaryProvider 非 tianai）→ 不校验', async () => {
    state.tianaiUrl = '';
    await expect(assertEffectiveCaptchaUsable(
      baseRow,
      [{ configKey: 'sys.login.captcha.secondaryProvider', configValue: 'altcha' }],
      provider(false),
    )).resolves.toBeUndefined();
    state.tianaiUrl = 'https://tianai.test';
  });

  it('库中已是 tianai（本次未改 provider）→ 仍要校验，防止"改坏其他参数"把登录锁死', async () => {
    state.tianaiUrl = 'https://tianai.test';
    await expect(assertEffectiveCaptchaUsable(
      { ...baseRow, 'sys.login.captcha.secondaryProvider': 'tianai' },
      [{ configKey: 'sys.login.captcha.forceAfterFailures', configValue: '5' }],
      provider(false),
    )).rejects.toThrowError(/不可用/);
  });
});
