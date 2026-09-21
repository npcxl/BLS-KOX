/**
 * @vitest-environment jsdom
 *
 * 登录人机验证 hook —— 前端流程测试（jsdom + @testing-library/react）
 *
 * 覆盖需求中必须由**前端流程**保证的几条：
 *   6. config 加载失败 / 未完成时不能绕过验证码直接登录
 *   10. 多个 verified 回调只能产生一次 verify 请求
 *   5. 登录请求结束后（无论成败）不复用已消费的 Token
 *   8. silent 被服务端要求第二层 → 加载 Tianai challenge → 提交答案 → 凭证就绪
 *   + 用户名变化立即清空旧凭证
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getCaptchaConfig: vi.fn(),
  verifySilentCaptcha: vi.fn(),
  createSecondaryChallenge: vi.fn(),
  verifySecondaryCaptcha: vi.fn(),
}));

vi.mock('@/services/auth/captcha', () => ({
  ...api,
  CAPTCHA_ERROR_CODES: [40010, 40011, 40012, 40013, 50301],
  CAPTCHA_REASON_TEXT: {
    SECONDARY_REQUIRED: '需要完成额外安全验证',
    SOLUTION_INVALID: '人机验证未通过，请重试',
    CHALLENGE_EXPIRED: '验证已过期，请重新验证',
  },
}));

import { useLoginCaptcha } from '../useLoginCaptcha';
import type { CaptchaConfig, SecondaryChallenge } from '@/services/auth/captcha';

function cfg(over: Partial<CaptchaConfig> = {}): CaptchaConfig {
  return {
    enabled: true,
    mode: 'adaptive',
    primaryProvider: 'altcha',
    secondaryProvider: 'tianai',
    secondaryType: 'blockPuzzle',
    requiredStage: 'silent',
    challengeUrl: '/api/auth/captcha/challenge',
    secondaryChallengeUrl: '/api/auth/captcha/secondary/challenge',
    fieldName: 'altchaPayload',
    ...over,
  };
}

const secondaryChallenge: SecondaryChallenge = {
  sessionId: 'S-1',
  type: 'blockPuzzle',
  expiresAt: Date.now() + 60_000,
  payload: { backgroundImage: 'data:image/png;base64,AAAA', width: 320, height: 160 },
};

const okToken = (token: string, stage: 'silent' | 'secondary' = 'silent') => ({
  code: 200,
  data: { passed: true, captchaToken: token, expiresAt: Date.now() + 120_000, stage },
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

  it('请求配置时携带用户名（challenge 绑定账号）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    renderHook(() => useLoginCaptcha('alice'));

    await waitFor(() => {
      expect(api.getCaptchaConfig).toHaveBeenCalledWith({ username: 'alice' });
    });
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
      api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ enabled: false, mode: 'off' }) });
      const { result } = renderHook(() => useLoginCaptcha('alice'));

      await waitFor(() => expect(result.current.submitEnabled).toBe(true));
      expect(result.current.state.envBlocked).toBe(false);
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: original, configurable: true });
    }
  });
});

describe('useLoginCaptcha — 第一层并发与凭证', () => {
  it('10. 多个 verified 回调只能产生一次 verify 请求', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    let resolveVerify: (v: any) => void = () => {};
    api.verifySilentCaptcha.mockReturnValue(new Promise((r) => { resolveVerify = r; }));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));

    act(() => {
      result.current.onAltchaVerified('payload-1');
      result.current.onAltchaVerified('payload-1'); // 重复回调（重挂载 / 事件重复）
      result.current.onAltchaVerified('payload-2');
    });

    expect(api.verifySilentCaptcha).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVerify(okToken('T-1'));
    });
    await waitFor(() => expect(result.current.submitEnabled).toBe(true));
    expect(result.current.token).toBe('T-1');
    expect(result.current.state.tokenStage).toBe('silent');
  });

  it('5. 登录请求结束后（成功或失败）本地 token 必须清空，且不能复用', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    api.verifySilentCaptcha.mockResolvedValue(okToken('T-2'));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));

    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.token).toBe('T-2'));
    expect(result.current.beginSubmit()).toBe(true);

    // 模拟 handleSubmit 的 finally
    act(() => { result.current.endSubmit(); });
    expect(result.current.token).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
    expect(result.current.beginSubmit()).toBe(false);
  });

  it('用户名变化 → 立即清空旧凭证与二级状态', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg() });
    api.verifySilentCaptcha.mockResolvedValue(okToken('T-3'));

    const { result, rerender } = renderHook(({ u }: { u: string }) => useLoginCaptcha(u), {
      initialProps: { u: 'alice' },
    });
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.token).toBe('T-3'));

    rerender({ u: 'bob' });
    await waitFor(() => expect(result.current.token).toBeNull());
    expect(result.current.secondary).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
  });
});

describe('useLoginCaptcha — 第二层（Tianai）', () => {
  it('8. silent 被要求第二层 → 加载 challenge → 提交答案 → 凭证就绪（stage=secondary）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ mode: 'always' }) });
    api.verifySilentCaptcha.mockResolvedValue({
      code: 200,
      data: { passed: false, requiredStage: 'secondary', reason: 'SECONDARY_REQUIRED' },
    });
    api.createSecondaryChallenge.mockResolvedValue({ code: 200, data: secondaryChallenge });
    api.verifySecondaryCaptcha.mockResolvedValue(okToken('S-TOKEN', 'secondary'));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));

    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.needSecondary).toBe(true));
    await waitFor(() => expect(result.current.secondary?.sessionId).toBe('S-1'));

    act(() => { result.current.onSecondarySubmit({ x: 120, y: 40 }); });
    await waitFor(() => expect(result.current.token).toBe('S-TOKEN'));

    expect(result.current.state.tokenStage).toBe('secondary');
    expect(result.current.submitEnabled).toBe(true);
    expect(api.verifySecondaryCaptcha).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'S-1', username: 'alice', data: { x: 120, y: 40 } }),
    );
  });

  it('第二层答案错误 → 不能提交，并重新获取 challenge（会话已被服务端消费）', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ mode: 'always' }) });
    api.verifySilentCaptcha.mockResolvedValue({
      code: 200,
      data: { passed: false, requiredStage: 'secondary', reason: 'SECONDARY_REQUIRED' },
    });
    api.createSecondaryChallenge.mockResolvedValue({ code: 200, data: secondaryChallenge });
    api.verifySecondaryCaptcha.mockResolvedValue({
      code: 200,
      data: { passed: false, reason: 'SOLUTION_INVALID' },
    });

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });
    await waitFor(() => expect(result.current.secondary?.sessionId).toBe('S-1'));

    act(() => { result.current.onSecondarySubmit({ x: 1, y: 1 }); });
    await waitFor(() => expect(result.current.hint).toBeTruthy());
    expect(result.current.token).toBeNull();
    expect(result.current.submitEnabled).toBe(false);
    // 失败后会再取一次 challenge
    await waitFor(() => expect(api.createSecondaryChallenge.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('第二层 challenge 加载失败 → 提示且不能提交', async () => {
    api.getCaptchaConfig.mockResolvedValue({ code: 200, data: cfg({ mode: 'always' }) });
    api.verifySilentCaptcha.mockResolvedValue({
      code: 200,
      data: { passed: false, requiredStage: 'secondary', reason: 'SECONDARY_REQUIRED' },
    });
    api.createSecondaryChallenge.mockRejectedValue(new Error('503'));

    const { result } = renderHook(() => useLoginCaptcha('alice'));
    await waitFor(() => expect(result.current.state.configLoaded).toBe(true));
    act(() => { result.current.onAltchaVerified('payload'); });

    await waitFor(() => expect(result.current.hint).toBe('验证码加载失败，请稍后重试'));
    expect(result.current.submitEnabled).toBe(false);
  });
});
