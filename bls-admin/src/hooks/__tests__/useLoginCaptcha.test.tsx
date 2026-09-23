/**
 * @vitest-environment jsdom
 *
 * 登录人机验证 hook —— 前端流程测试（jsdom + @testing-library/react）
 *
 * 覆盖必须由**前端流程**保证的几条：
 *   1. config 加载失败 / 未完成时不能绕过验证码直接登录；
 *   2. 多个 verified 回调只能产生一次 verify 请求；
 *   3. 登录请求结束后（无论成败）不复用已消费的 captchaTicket；
 *   4. 服务端风控升级 → 必须带 escalationGrant 才能取到第二层 challenge；
 *   5. Tianai 技术故障 → 服务端补发 grant → **自动**换 challenge（不要求用户先失败一次）；
 *   6. 用户答错 / grant 失效 → 回到第一层重新申请（**绝不重放登录口令**）；
 *   7. 用户名变化立即清空旧凭证。
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getCaptchaConfig: vi.fn(),
  generateCaptcha: vi.fn(),
  verifyCaptcha: vi.fn(),
}));

vi.mock('@/services/auth/captcha', () => ({
  ...api,
  CAPTCHA_CONFIG_URL: '/api/captcha/config',
  CAPTCHA_GENERATE_URL: '/api/captcha/generate',
  CAPTCHA_VERIFY_URL: '/api/captcha/verify',
  CAPTCHA_FIELD_NAME: 'altchaPayload',
  CAPTCHA_ERROR_CODES: [40010, 40011, 40012, 40013, 50301, 50302],
  CAPTCHA_REASON_TEXT: {
    SECONDARY_REQUIRED: '需要完成额外安全验证',
    SOLUTION_INVALID: '人机验证未通过，请重试',
    CHALLENGE_EXPIRED: '验证已过期，请重新验证',
    UPSTREAM_TIMEOUT: '人机验证服务响应超时，请稍后重试',
  },
  secondaryTypeOf: (challenge: Record<string, unknown> | null | undefined) =>
    String(challenge?.type ?? '').toUpperCase().includes('WORD') ? 'clickWord' : 'blockPuzzle',
}));

import { useLoginCaptcha, USERNAME_DEBOUNCE_MS } from '../useLoginCaptcha';
import type { CaptchaConfig } from '@/services/auth/captcha';

function cfg(over: Partial<CaptchaConfig> = {}): CaptchaConfig {
  return {
    enabled: true,
    primaryProvider: 'ALTCHA',
    fallbackProvider: 'TIANAI',
    tianaiEnabled: false,
    generateUrl: '/api/captcha/generate',
    verifyUrl: '/api/captcha/verify',
    fieldName: 'altchaPayload',
    ...over,
  };
}

/** 与 bls-captcha-service 返回字段一致的 SLIDER challenge */
const sliderChallenge = {
  id: 'up-1',
  type: 'SLIDER',
  backgroundImage: 'data:image/jpeg;base64,AAAA',
  templateImage: 'data:image/png;base64,BBBB',
  backgroundImageWidth: 600,
  backgroundImageHeight: 300,
  templateImageWidth: 120,
  templateImageHeight: 300,
  data: null,
};

const passed = (ticket: string, provider = 'ALTCHA') => ({
  code: 200,
  data: { status: 'passed', provider, captchaTicket: ticket, expiresAt: Date.now() + 120_000 },
});

const needsSecondary = (grant: string) => ({
  code: 200,
  data: {
    status: 'failed',
    provider: 'ALTCHA',
    reason: 'SECONDARY_REQUIRED',
    requireFallback: true,
    nextProvider: 'TIANAI',
    escalationGrant: grant,
    escalationExpiresAt: Date.now() + 180_000,
  },
});

/** 官方 payload（base64）—— 只要能解出 challenge.parameters.nonce 即可复现"陈旧回调" */
function altchaPayload(nonce: string): string {
  return Buffer.from(
    JSON.stringify({ challenge: { parameters: { nonce }, signature: 's' }, solution: {} }),
    'utf8',
  ).toString('base64');
}

/** 第一层 challenge 响应（带指定 nonce） */
const altchaChallengeOf = (nonce: string) => ({
  code: 200,
  data: {
    provider: 'ALTCHA',
    challenge: {
      parameters: { algorithm: 'PBKDF2/SHA-256', nonce, salt: 's-1', cost: 10, keyLength: 32, keyPrefix: '' },
      signature: 'sig-1',
    },
    expiresAt: Date.now() + 180_000,
    fieldName: 'altchaPayload',
  },
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('useLoginCaptcha — 配置门槛', () => {
  it('config 尚未返回时禁止提交（不能先放行再验证）', () => {
    api.getCaptchaConfig.mockReturnValue(new Promise(() => { /* never resolves */ }));
    const { result } = renderHook(() => useLoginCaptcha('alice'));

    expect(result.current.state.configLoaded).toBe(false);
    expect(result.current.submitEnabled).toBe(false);
    expect(result.current.beginSubmit()).toBe(false);
  });

  it('config 加载失败时禁止提交，并给出明确提示（fail closed）', async () => {
    api.getCaptchaConfig.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useLoginCaptcha('alice'));

    await waitFor(() => expect(result.current.state.configError).toBe(true));
    expect(result.current.submitEnabled).toBe(false);
    expect(result.current.hint).toContain('安全校验配置加载失败');
    expect(result.current.beginSubmit()).toBe(false);
  });

  it('非安全上下文（HTTP 非 localhost）→ ALTCHA 无法求解，明确报错并禁止提交', async () => {
    const original = window.isSecureContext;
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    try {
      api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
      const { result } = renderHook(() => useLoginCaptcha('alice'));

      await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
      await waitFor(() => expect(result.current.state.envBlocked).toBe(true));
      expect(result.current.hint).toContain('非安全上下文');
      expect(result.current.submitEnabled).toBe(false);
      expect(result.current.beginSubmit()).toBe(false);
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: original, configurable: true });
    }
  });

  it('非安全上下文但验证码关闭时不影响原登录流程', async () => {
    const original = window.isSecureContext;
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    try {
      api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ enabled: false }) });
      const { result } = renderHook(() => useLoginCaptcha('alice'));

      await waitFor(() => expect(result.current.submitEnabled).toBe(true));
      expect(result.current.state.envBlocked).toBe(false);
      expect(api.verifyCaptcha).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: original, configurable: true });
    }
  });
});

describe('useLoginCaptcha — 第一层并发与凭证', () => {
  it('多个 verified 回调只能产生一次 verify 请求', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    let resolveVerify: (v: any) => void = () => {};
    api.verifyCaptcha.mockReturnValue(new Promise((r) => { resolveVerify = r; }));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));

    act(() => {
      result.current.onAltchaVerified('payload-1');
      result.current.onAltchaVerified('payload-1'); // 重复回调（重挂载 / 事件重复）
      result.current.onAltchaVerified('payload-2');
    });

    expect(api.verifyCaptcha).toHaveBeenCalledTimes(1);

    await act(async () => { resolveVerify(passed('T-1')); });
    await waitFor(() => expect(result.current.submitEnabled).toBe(true));
    expect(result.current.ticket).toBe('T-1');
    expect(result.current.state.ticketProvider).toBe('ALTCHA');
  });

  it('登录请求结束后（成功或失败）本地 captchaTicket 必须清空，且不能复用', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    api.verifyCaptcha.mockResolvedValue(passed('T-2'));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));

    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.ticket).toBe('T-2'));
    expect(result.current.beginSubmit()).toBe(true);

    // 模拟 handleSubmit 的 finally
    act(() => { result.current.endSubmit(); });
    expect(result.current.ticket).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
    expect(result.current.beginSubmit()).toBe(false);
  });

  it('用户名变化 → 立即清空旧凭证与二级状态', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    api.verifyCaptcha.mockResolvedValue(passed('T-3'));

    const { result, rerender } = renderHook(({ u }: { u: string }) => useLoginCaptcha(u), {
      initialProps: { u: 'alice' },
    });
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.ticket).toBe('T-3'));

    rerender({ u: 'bob' });
    await waitFor(() => expect(result.current.ticket).toBeNull());
    expect(result.current.secondary).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
  });

  it('陈旧 challenge 的 payload 被直接丢弃，绝不发给 /verify（否则服务端会判 BINDING_MISMATCH）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    api.generateCaptcha.mockResolvedValue(altchaChallengeOf('nonce-current'));
    api.verifyCaptcha.mockResolvedValue(passed('T-OK'));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.altchaChallenge).toBeTruthy(), { timeout: 2000 });

    // 旧 widget（上一张 challenge）的回调：nonce 不匹配 → 丢弃，不产生任何请求
    act(() => { result.current.onAltchaVerified(altchaPayload('nonce-stale')); });
    await new Promise((r) => setTimeout(r, 30));
    expect(api.verifyCaptcha).not.toHaveBeenCalled();

    // 当前 widget 的回调正常放行
    act(() => { result.current.onAltchaVerified(altchaPayload('nonce-current')); });
    await waitFor(() => expect(result.current.ticket).toBe('T-OK'));
    expect(api.verifyCaptcha).toHaveBeenCalledTimes(1);
  });

  it('第一层拿到"已作废"的判定（BINDING_MISMATCH 等）时自动换一张 challenge 自愈，不卡死用户', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    api.generateCaptcha
      .mockResolvedValueOnce(altchaChallengeOf('n-1'))
      .mockResolvedValueOnce(altchaChallengeOf('n-2'));
    api.verifyCaptcha.mockResolvedValue({
      code: 200,
      data: { status: 'failed', provider: 'ALTCHA', reason: 'BINDING_MISMATCH' },
    });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.altchaChallenge).toBeTruthy(), { timeout: 2000 });

    act(() => { result.current.onAltchaVerified(altchaPayload('n-1')); });

    // 自愈：重新取一张 challenge（widget 会重跑 PoW），而不是只留一句错误提示
    await waitFor(() => expect(api.generateCaptcha.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    expect(result.current.ticket).toBeNull();
    expect(result.current.hint).toBeTruthy();
    expect(result.current.phase).toBe('solvingSilent');
  });

  it('用户名变化后旧异步响应被丢弃（不会给新用户签凭证）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    let resolveVerify: (v: any) => void = () => {};
    api.verifyCaptcha.mockReturnValue(new Promise((r) => { resolveVerify = r; }));

    const { result, rerender } = renderHook(({ u }: { u: string }) => useLoginCaptcha(u), {
      initialProps: { u: 'alice' },
    });
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload-alice'); });

    // 请求还没回来就换了用户名
    rerender({ u: 'bob' });
    await act(async () => { resolveVerify(passed('T-ALICE')); });

    // 过期响应必须被丢弃：不能给 bob 用 alice 的 ticket
    expect(result.current.ticket).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
  });

  it('Tianai 未启用时不会请求第二层', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: false }) });
    api.verifyCaptcha.mockResolvedValue(passed('T-4'));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });

    await waitFor(() => expect(result.current.ticket).toBe('T-4'));
    expect(result.current.needSecondary).toBe(false);
  });
});

describe('useLoginCaptcha — 第二层（Tianai）与升级凭证', () => {
  it('风控升级 → 带 escalationGrant 取 challenge → 提交答案 → ticket 就绪', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: true }) });
    api.verifyCaptcha
      .mockResolvedValueOnce(needsSecondary('G-1'))
      .mockResolvedValueOnce(passed('S-TICKET', 'TIANAI'));
    api.generateCaptcha.mockResolvedValue({
      code: 200,
      data: { provider: 'TIANAI', sessionId: 'SES-1', challenge: sliderChallenge, expiresAt: Date.now() + 180_000 },
    });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));

    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.needSecondary).toBe(true));

    // 取第二层 challenge 必须携带服务端签发的 grant
    await waitFor(() => expect(api.generateCaptcha).toHaveBeenCalled());
    expect(api.generateCaptcha).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'TIANAI', escalationGrant: 'G-1' }),
    );
    await waitFor(() => expect(result.current.secondary?.sessionId).toBe('SES-1'));
    expect(result.current.secondary?.type).toBe('blockPuzzle');

    const trackDto = {
      bgImageWidth: 600,
      bgImageHeight: 300,
      templateImageWidth: 120,
      templateImageHeight: 300,
      startTime: 1,
      stopTime: 900,
      trackList: [{ x: 0, y: 0, t: 0, type: 'DOWN' }, { x: 200, y: 3, t: 900, type: 'UP' }],
    };
    act(() => { result.current.onSecondarySubmit(trackDto as unknown as Record<string, unknown>); });

    await waitFor(() => expect(result.current.ticket).toBe('S-TICKET'));
    expect(result.current.submitEnabled).toBe(true);
    expect(api.verifyCaptcha).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'TIANAI', sessionId: 'SES-1', data: trackDto }),
    );
  });

  it('Tianai 技术故障 → 服务端补发 grant → 自动换 challenge（不要求用户先失败一次）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: true }) });
    api.verifyCaptcha
      .mockResolvedValueOnce(needsSecondary('G-1'))
      .mockResolvedValueOnce({
        code: 200,
        data: {
          status: 'technical_error',
          provider: 'TIANAI',
          reason: 'UPSTREAM_TIMEOUT',
          requireFallback: true,
          nextProvider: 'TIANAI',
          escalationGrant: 'G-2',
        },
      });
    api.generateCaptcha
      .mockResolvedValueOnce({ code: 200, data: { provider: 'TIANAI', sessionId: 'SES-A', challenge: sliderChallenge, expiresAt: Date.now() + 180_000 } })
      .mockResolvedValueOnce({ code: 200, data: { provider: 'TIANAI', sessionId: 'SES-B', challenge: sliderChallenge, expiresAt: Date.now() + 180_000 } });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.secondary?.sessionId).toBe('SES-A'));

    act(() => { result.current.onSecondarySubmit({ bgImageWidth: 600 } as any); });

    // 自动用新 grant 重新取一张 challenge，用户不需要手动刷新
    await waitFor(() => expect(result.current.secondary?.sessionId).toBe('SES-B'));
    expect(api.generateCaptcha).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: 'TIANAI', escalationGrant: 'G-2' }),
    );
    // 全程没有重放第一层验证，也当然没有重放登录
    expect(api.verifyCaptcha).toHaveBeenCalledTimes(2);
    expect(result.current.ticket).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
  });

  it('用户答错（一次性 grant 已消费）→ 回到第一层重新申请授权，不重放密码', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: true }) });
    api.verifyCaptcha
      .mockResolvedValueOnce(needsSecondary('G-1'))
      .mockResolvedValueOnce({ code: 200, data: { status: 'failed', provider: 'TIANAI', reason: 'SOLUTION_INVALID' } })
      .mockResolvedValueOnce(needsSecondary('G-2'));
    api.generateCaptcha.mockResolvedValue({
      code: 200,
      data: { provider: 'TIANAI', sessionId: 'SES-X', challenge: sliderChallenge, expiresAt: Date.now() + 180_000 },
    });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload-1'); });
    await waitFor(() => expect(result.current.secondary?.sessionId).toBe('SES-X'));

    act(() => { result.current.onSecondarySubmit({ bgImageWidth: 600 } as any); });
    await waitFor(() => expect(result.current.hint).toBeTruthy());

    // 答错后回到第一层（phase=solvingSilent），旧 ticket 一律没有
    await waitFor(() => expect(result.current.phase).toBe('solvingSilent'));
    expect(result.current.ticket).toBeNull();
    expect(result.current.submitEnabled).toBe(false);

    // 第一层重新求解 → 服务端再次风控升级并下发新 grant
    act(() => { result.current.onAltchaVerified('payload-2'); });
    await waitFor(() => expect(api.verifyCaptcha).toHaveBeenCalledTimes(3));
    expect(api.verifyCaptcha).toHaveBeenLastCalledWith(expect.objectContaining({ payload: 'payload-2' }));
  });

  it('无 grant 时不会请求第二层（客户端不能自行索要）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: true }) });
    // 服务端只返回需要第二层，但**没有**给 grant（异常/被篡改）
    api.verifyCaptcha.mockResolvedValue({
      code: 200,
      data: { status: 'failed', provider: 'ALTCHA', reason: 'SECONDARY_REQUIRED', requireFallback: true },
    });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });

    // 没有授权 → 直接回到第一层重新申请，且从不请求 TIANAI challenge
    await waitFor(() => expect(result.current.phase).toBe('solvingSilent'));
    expect(api.generateCaptcha).not.toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'TIANAI' }),
    );
    expect(result.current.ticket).toBeNull();
  });

  it('第二层 generate 返回 40011（grant 失效）→ 回到第一层重新申请', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: true }) });
    api.verifyCaptcha.mockResolvedValueOnce(needsSecondary('G-stale'));
    api.generateCaptcha.mockRejectedValue({ response: { data: { code: 40011, message: '未获得第二层验证授权' } } });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });

    // 回到第一层重新申请授权，不会拿到任何第二层 challenge
    await waitFor(() => expect(result.current.phase).toBe('solvingSilent'));
    expect(result.current.secondary).toBeNull();
    expect(result.current.ticket).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
  });

  it('第二层 challenge 加载失败（非 40011）→ 提示且不能提交', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ tianaiEnabled: true }) });
    api.verifyCaptcha.mockResolvedValueOnce(needsSecondary('G-1'));
    api.generateCaptcha.mockRejectedValue({ response: { data: { code: 50301, message: '人机验证服务暂不可用，请稍后重试' } } });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });

    await waitFor(() => expect(result.current.hint).toBe('人机验证服务暂不可用，请稍后重试'));
    expect(result.current.submitEnabled).toBe(false);
  });

  it('debounce 常量保持 500ms（用户名稳定后才取 challenge）', () => {
    expect(USERNAME_DEBOUNCE_MS).toBe(500);
  });
});
