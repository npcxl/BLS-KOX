/**
 * @vitest-environment node
 *
 * 登录人机验证状态机（纯函数）测试
 *
 * 重点验证安全相关不变式：
 *   - config 未加载完成 / 加载失败 → 永远不能提交；
 *   - 用户名变化立即清空 ticket / expiresAt / escalationGrant / 二级状态；
 *   - /login 发出后（无论成败）本地 captchaTicket 必须清空；
 *   - 第二层未被满足时不能提交；
 *   - ticket 过期自动回到重新验证；
 *   - 服务端补发升级凭证（技术故障）时能靠 ESCALATION_RENEWED 自动换 challenge。
 */
import { describe, it, expect } from 'vitest';
import {
  canSubmit,
  captchaReducer,
  createInitialState,
  isTicketExpired,
  needsSecondary,
  type CaptchaMachineState,
} from '../captcha-machine';
import type { CaptchaConfig, SecondaryChallenge } from '@/services/auth/captcha';

function cfg(over: Partial<CaptchaConfig> = {}): CaptchaConfig {
  return {
    enabled: true,
    primaryProvider: 'ALTCHA',
    fallbackProvider: 'TIANAI',
    tianaiEnabled: true,
    generateUrl: '/api/captcha/generate',
    verifyUrl: '/api/captcha/verify',
    fieldName: 'altchaPayload',
    ...over,
  };
}

/** 一路推进到"第一层已完成、ticket 就绪" */
function readyState(over: Partial<CaptchaConfig> = {}, username = 'alice'): CaptchaMachineState {
  let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg(over) });
  s = captchaReducer(s, { type: 'USERNAME_CHANGED', username });
  s = captchaReducer(s, { type: 'SILENT_REQUESTED' });
  s = captchaReducer(s, { type: 'SILENT_TICKET', ticket: 'T1', expiresAt: 2_000, provider: 'ALTCHA' });
  return s;
}

const challenge: SecondaryChallenge = {
  sessionId: 'S1',
  type: 'blockPuzzle',
  expiresAt: 9_999,
  payload: {
    type: 'SLIDER',
    backgroundImage: 'data:image/jpeg;base64,AAAA',
    templateImage: 'data:image/png;base64,BBBB',
    backgroundImageWidth: 600,
    backgroundImageHeight: 300,
    templateImageWidth: 120,
    templateImageHeight: 300,
  },
};

describe('captcha-machine — 阶段流转', () => {
  it('初始处于 loadingConfig，禁止提交', () => {
    const s = createInitialState();
    expect(s.phase).toBe('loadingConfig');
    expect(s.configLoaded).toBe(false);
    expect(canSubmit(s)).toBe(false);
  });

  it('配置加载完成后：无用户名 → waitingUsername；有用户名 → solvingSilent', () => {
    const s1 = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    expect(s1.phase).toBe('waitingUsername');
    expect(canSubmit(s1)).toBe(false);

    const s2 = captchaReducer(s1, { type: 'USERNAME_CHANGED', username: 'alice' });
    expect(s2.phase).toBe('solvingSilent');
  });

  it('功能关闭时不需要凭证即可提交', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg({ enabled: false }) });
    s = captchaReducer(s, { type: 'USERNAME_CHANGED', username: 'alice' });
    expect(s.phase).toBe('ready');
    expect(canSubmit(s)).toBe(true);
  });

  it('配置加载失败 → error 且禁止提交（不能当作"未开启"放行）', () => {
    const s = captchaReducer(createInitialState(), { type: 'CONFIG_FAILED' });
    expect(s.phase).toBe('error');
    expect(s.configError).toBe(true);
    expect(canSubmit(s)).toBe(false);
  });

  it('第一层拿到 ticket → ready 且可提交；provider 由服务端给出', () => {
    const s = readyState();
    expect(s.phase).toBe('ready');
    expect(s.ticket).toBe('T1');
    expect(s.ticketProvider).toBe('ALTCHA');
    expect(canSubmit(s)).toBe(true);
  });
});

describe('captcha-machine — 安全不变式', () => {
  it('用户名变化：立即清空 ticket / expiresAt / grant / 二级状态并自增 cycleId', () => {
    let before = readyState();
    before = captchaReducer(before, { type: 'SECONDARY_REQUIRED', escalationGrant: 'G-1' });
    expect(before.escalationGrant).toBe('G-1');

    const after = captchaReducer(before, { type: 'USERNAME_CHANGED', username: 'bob' });
    expect(after.username).toBe('bob');
    expect(after.ticket).toBeNull();
    expect(after.ticketExpiresAt).toBeNull();
    expect(after.ticketProvider).toBeNull();
    expect(after.escalationGrant).toBeNull();
    expect(after.silentSolved).toBe(false);
    expect(after.secondary).toBeNull();
    expect(after.cycleId).toBe(before.cycleId + 1);
    expect(canSubmit(after)).toBe(false);
  });

  it('LOGIN_SENT：无论登录成功或失败都必须清空本地 captchaTicket', () => {
    const s = readyState();
    const after = captchaReducer(s, { type: 'LOGIN_SENT' });
    expect(after.ticket).toBeNull();
    expect(after.ticketExpiresAt).toBeNull();
    expect(canSubmit(after)).toBe(false);
  });

  it('SUBMIT_START 之后不允许再次提交（防止重复请求）', () => {
    let s = captchaReducer(readyState(), { type: 'SUBMIT_START' });
    expect(s.phase).toBe('submitting');
    expect(canSubmit(s)).toBe(false);
    s = captchaReducer(s, { type: 'SUBMIT_END' });
    expect(s.phase).toBe('ready');
  });

  it('ticket 过期 → 清空凭证并回到重新验证', () => {
    const s = captchaReducer(readyState(), { type: 'TICKET_EXPIRED' });
    expect(s.ticket).toBeNull();
    expect(s.phase).toBe('solvingSilent');
    expect(canSubmit(s)).toBe(false);
  });

  it('isTicketExpired 依据服务端 expiresAt 判定', () => {
    const s = readyState();
    expect(isTicketExpired(s, 1_000)).toBe(false);
    expect(isTicketExpired(s, 2_001)).toBe(true);
  });

  it('服务端要求第二层：第一层不算完成，不能提交，且必须拿到 escalationGrant', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    s = captchaReducer(s, { type: 'USERNAME_CHANGED', username: 'alice' });
    s = captchaReducer(s, { type: 'SECONDARY_REQUIRED', escalationGrant: 'G-9' });
    expect(s.phase).toBe('secondaryRequired');
    expect(s.ticket).toBeNull();
    expect(s.escalationGrant).toBe('G-9');
    expect(canSubmit(s)).toBe(false);
    expect(needsSecondary(s)).toBe(true);
  });

  it('服务端未下发 grant 时 escalationGrant 保持 null（后续 /generate 会被服务端拒绝）', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    s = captchaReducer(s, { type: 'SECONDARY_REQUIRED' });
    expect(s.escalationGrant).toBeNull();
    expect(canSubmit(s)).toBe(false);
  });
});

describe('captcha-machine — 第二层', () => {
  it('第二层通过后 ticketProvider=TIANAI，可提交，且 grant 被清空', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    s = captchaReducer(s, { type: 'USERNAME_CHANGED', username: 'alice' });
    s = captchaReducer(s, { type: 'SECONDARY_REQUIRED', escalationGrant: 'G-1' });
    s = captchaReducer(s, { type: 'SECONDARY_LOADING', secondaryType: 'blockPuzzle' });
    expect(s.phase).toBe('solvingSecondary');

    s = captchaReducer(s, { type: 'SECONDARY_CHALLENGE', challenge });
    expect(s.secondary?.sessionId).toBe('S1');
    expect(needsSecondary(s)).toBe(true);

    s = captchaReducer(s, { type: 'SECONDARY_TICKET', ticket: 'S-TICKET', expiresAt: 5_000 });
    expect(s.ticketProvider).toBe('TIANAI');
    expect(s.secondarySolved).toBe(true);
    expect(s.escalationGrant).toBeNull();
    expect(canSubmit(s)).toBe(true);
    expect(needsSecondary(s)).toBe(false);
  });

  it('第二层失败 → 回到 secondaryRequired 且不能提交', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    s = captchaReducer(s, { type: 'SECONDARY_CHALLENGE', challenge });
    s = captchaReducer(s, { type: 'SECONDARY_FAILED', hint: '答案错误' });
    expect(s.phase).toBe('secondaryRequired');
    expect(s.hint).toBe('答案错误');
    expect(canSubmit(s)).toBe(false);
  });

  it('ESCALATION_RENEWED（上游技术故障补发凭证）→ 清空旧 challenge，立即准备重取', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    s = captchaReducer(s, { type: 'USERNAME_CHANGED', username: 'alice' });
    s = captchaReducer(s, { type: 'SECONDARY_REQUIRED', escalationGrant: 'G-old' });
    s = captchaReducer(s, { type: 'SECONDARY_CHALLENGE', challenge });
    expect(s.secondary).not.toBeNull();

    s = captchaReducer(s, { type: 'ESCALATION_RENEWED', escalationGrant: 'G-new', hint: '已刷新' });
    expect(s.escalationGrant).toBe('G-new');
    expect(s.secondary).toBeNull();
    expect(s.phase).toBe('secondaryRequired');
    expect(needsSecondary(s)).toBe(true);
    expect(canSubmit(s)).toBe(false);
  });

  it('功能关闭时不渲染第二层', () => {
    const s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg({ enabled: false }) });
    expect(needsSecondary(s)).toBe(false);
  });
});

describe('captcha-machine — 环境不支持（非安全上下文）', () => {
  it('ENV_UNSUPPORTED：清空凭证、永久禁止提交并给出原因', () => {
    let s = readyState();
    expect(canSubmit(s)).toBe(true);

    s = captchaReducer(s, { type: 'ENV_UNSUPPORTED', hint: '当前为非安全上下文（HTTP）' });
    expect(s.envBlocked).toBe(true);
    expect(s.phase).toBe('error');
    expect(s.ticket).toBeNull();
    expect(s.hint).toContain('非安全上下文');
    expect(canSubmit(s)).toBe(false);
  });

  it('环境不支持后用户名变化仍保持 error（不能靠改用户名绕过）', () => {
    let s = captchaReducer(createInitialState(), { type: 'CONFIG_LOADED', config: cfg() });
    s = captchaReducer(s, { type: 'ENV_UNSUPPORTED', hint: 'HTTPS required' });
    s = captchaReducer(s, { type: 'USERNAME_CHANGED', username: 'bob' });
    expect(s.phase).toBe('error');
    expect(canSubmit(s)).toBe(false);
  });
});
