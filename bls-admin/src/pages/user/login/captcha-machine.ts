/**
 * 登录人机验证状态机（**纯函数**，不依赖 React / DOM，便于单测）
 *
 * 状态：
 *   loadingConfig      读取公开配置中（此阶段禁止提交登录）
 *   waitingUsername    等待输入用户名（不提前取 challenge）
 *   solvingSilent      第一层 ALTCHA 求解中
 *   secondaryRequired  服务端要求第二层（Tianai），等待用户交互
 *   solvingSecondary   第二层校验中
 *   ready              凭证就绪，登录按钮可用（是否可提交由 canSubmit 判定）
 *   submitting         登录请求进行中
 *   error              配置加载失败 / 环境不支持等不可自愈的错误
 *
 * 不变式：
 *   - `config === null`（未加载完成）时 **永远不能提交登录**；
 *   - 用户名变化 → cycleId+1 且清空 payload / ticket / expiresAt / 二级状态；
 *   - 任何 /login 请求发出后（成功或失败）都必须清除本地 captchaTicket（服务端已一次性消费）。
 */
import type {
  CaptchaConfig,
  CaptchaProviderName,
  CaptchaSecondaryType,
  SecondaryChallenge,
} from '@/services/auth/captcha';

export type { SecondaryChallenge };

export type CaptchaPhase =
  | 'loadingConfig'
  | 'waitingUsername'
  | 'solvingSilent'
  | 'secondaryRequired'
  | 'solvingSecondary'
  | 'ready'
  | 'submitting'
  | 'error';

export interface CaptchaMachineState {
  phase: CaptchaPhase;
  /** 公开配置；null = 尚未加载完成 */
  config: CaptchaConfig | null;
  configLoaded: boolean;
  configError: boolean;
  username: string;
  /** 第一层是否已完成（不代表可以提交：第二层可能仍被要求） */
  silentSolved: boolean;
  /** 服务端签发的一次性 captchaTicket（登录接口唯一认的凭证） */
  ticket: string | null;
  ticketExpiresAt: number | null;
  /** 签发 ticket 的 provider（ALTCHA=第一层，TIANAI=第二层） */
  ticketProvider: CaptchaProviderName | null;
  /** 第二层 challenge（Tianai） */
  secondary: SecondaryChallenge | null;
  secondarySolved: boolean;
  /** 第二层进行中的提示（例如"正在加载验证码…"） */
  secondaryType: CaptchaSecondaryType | null;
  /** 面向用户的提示文案 */
  hint: string | null;
  /**
   * 当前浏览器环境**不可能**完成人机验证（例如非安全上下文下 ALTCHA 拿不到 crypto.subtle）。
   * 一旦为 true，永久禁止提交：不是"用户还没验证"，而是"这个环境验证不了"。
   */
  envBlocked: boolean;
  /** 并发守卫：用户名/流程变化时自增，丢弃过期响应 */
  cycleId: number;
}

export type CaptchaEvent =
  | { type: 'CONFIG_LOADED'; config: CaptchaConfig }
  | { type: 'CONFIG_FAILED'; hint?: string }
  | { type: 'USERNAME_CHANGED'; username: string }
  | { type: 'SILENT_REQUESTED' }
  | { type: 'SILENT_FAILED'; hint?: string }
  | { type: 'SILENT_TICKET'; ticket: string; expiresAt: number; provider: CaptchaProviderName }
  | { type: 'SECONDARY_REQUIRED'; hint?: string }
  | { type: 'SECONDARY_LOADING'; secondaryType: CaptchaSecondaryType | null }
  | { type: 'SECONDARY_CHALLENGE'; challenge: SecondaryChallenge }
  | { type: 'SECONDARY_FAILED'; hint?: string }
  | { type: 'SECONDARY_TICKET'; ticket: string; expiresAt: number }
  | { type: 'TICKET_EXPIRED' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END' }
  /** /login 请求已发出（无论成败）→ 本地 ticket 必须作废 */
  | { type: 'LOGIN_SENT' }
  | { type: 'HINT'; hint: string | null }
  /** 浏览器环境不支持验证码（非安全上下文 / 组件报错）→ 禁止提交并说明原因 */
  | { type: 'ENV_UNSUPPORTED'; hint: string }
  | { type: 'RESET' };

export function createInitialState(): CaptchaMachineState {
  return {
    phase: 'loadingConfig',
    config: null,
    configLoaded: false,
    configError: false,
    username: '',
    silentSolved: false,
    ticket: null,
    ticketExpiresAt: null,
    ticketProvider: null,
    secondary: null,
    secondarySolved: false,
    secondaryType: null,
    hint: null,
    envBlocked: false,
    cycleId: 0,
  };
}

/** 清空所有与"当前用户名的验证结果"相关的状态 */
function clearCredentials(state: CaptchaMachineState): CaptchaMachineState {
  return {
    ...state,
    silentSolved: false,
    ticket: null,
    ticketExpiresAt: null,
    ticketProvider: null,
    secondary: null,
    secondarySolved: false,
    secondaryType: null,
  };
}

/** 用户名变化 / 重置后应处于的阶段 */
function phaseAfterUsernameChange(state: CaptchaMachineState, username: string): CaptchaPhase {
  if (state.envBlocked) return 'error';
  if (!state.configLoaded) return 'loadingConfig';
  if (state.configError) return 'error';
  if (!state.config?.enabled) return 'ready';
  if (!username) return 'waitingUsername';
  return 'solvingSilent';
}

export function captchaReducer(state: CaptchaMachineState, event: CaptchaEvent): CaptchaMachineState {
  switch (event.type) {
    case 'CONFIG_LOADED': {
      const next: CaptchaMachineState = {
        ...state,
        config: event.config,
        configLoaded: true,
        configError: false,
      };
      // 配置里 enabled 变了（例如刚被打开）→ 旧凭证可能已经不适用，直接清掉重来
      const clearIfDisabled = !event.config.enabled || !state.config?.enabled
        ? clearCredentials(next)
        : next;
      return { ...clearIfDisabled, phase: phaseAfterUsernameChange(clearIfDisabled, state.username) };
    }

    case 'CONFIG_FAILED':
      // 配置拿不到 → fail closed：禁止提交登录（避免在"验证码是否开启未知"时直接放行）
      return {
        ...state,
        config: null,
        configLoaded: false,
        configError: true,
        phase: 'error',
        hint: event.hint ?? '安全校验配置加载失败，请刷新页面重试',
      };

    case 'USERNAME_CHANGED': {
      if (event.username === state.username) return state;
      // 用户名变化：立即作废旧 payload / ticket / expiresAt / provider 状态
      const cleared = clearCredentials({
        ...state,
        username: event.username,
        cycleId: state.cycleId + 1,
        hint: null,
      });
      return { ...cleared, phase: phaseAfterUsernameChange(cleared, event.username) };
    }

    case 'SILENT_REQUESTED':
      return { ...state, phase: 'solvingSilent', hint: null };

    case 'SILENT_FAILED':
      return { ...clearCredentials(state), phase: 'solvingSilent', hint: event.hint ?? '人机验证未通过，正在重试…' };

    case 'SILENT_TICKET':
      // 第一层完成：凭证就绪（**不代表可以提交**，第二层可能仍被要求）
      return {
        ...state,
        silentSolved: true,
        ticket: event.ticket,
        ticketExpiresAt: event.expiresAt,
        ticketProvider: event.provider,
        secondary: null,
        secondarySolved: false,
        phase: 'ready',
        hint: null,
      };

    case 'SECONDARY_REQUIRED':
      return {
        ...state,
        ticket: null,
        ticketExpiresAt: null,
        ticketProvider: null,
        silentSolved: true,
        secondary: null,
        secondarySolved: false,
        phase: 'secondaryRequired',
        hint: event.hint ?? null,
      };

    case 'SECONDARY_LOADING':
      return { ...state, phase: 'solvingSecondary', secondaryType: event.secondaryType, hint: null };

    case 'SECONDARY_CHALLENGE':
      return { ...state, secondary: event.challenge, secondaryType: event.challenge.type, phase: 'secondaryRequired' };

    case 'SECONDARY_FAILED':
      return {
        ...state,
        secondary: null,
        secondarySolved: false,
        phase: 'secondaryRequired',
        hint: event.hint ?? '验证未通过，请重试',
      };

    case 'SECONDARY_TICKET':
      return {
        ...state,
        ticket: event.ticket,
        ticketExpiresAt: event.expiresAt,
        ticketProvider: 'TIANAI',
        secondarySolved: true,
        phase: 'ready',
        hint: null,
      };

    case 'TICKET_EXPIRED':
      // 凭证过期：立即失效并回到重新验证（保留用户名）
      return {
        ...clearCredentials(state),
        phase: state.config?.enabled ? 'solvingSilent' : 'ready',
        hint: '验证已过期，正在重新验证…',
      };

    case 'SUBMIT_START':
      return { ...state, phase: 'submitting', hint: null };

    case 'SUBMIT_END':
      return { ...state, phase: 'ready' };

    case 'LOGIN_SENT':
      // 服务端已一次性消费；本地必须立刻清掉，避免复用
      return { ...clearCredentials(state), silentSolved: false };

    case 'ENV_UNSUPPORTED':
      // 环境不支持（非安全上下文 / 组件报错）：清空凭证并永久禁止提交，把原因明确告诉用户
      return { ...clearCredentials(state), envBlocked: true, phase: 'error', hint: event.hint };

    case 'HINT':
      return { ...state, hint: event.hint };

    case 'RESET':
      return { ...clearCredentials({ ...state, cycleId: state.cycleId + 1 }), phase: phaseAfterUsernameChange(state, state.username) };

    default:
      return state;
  }
}

/** 是否允许提交登录（环境不支持 / config 未加载完成 / 出错 / 无凭证时一律禁止） */
export function canSubmit(state: CaptchaMachineState): boolean {
  if (state.envBlocked) return false;
  if (!state.configLoaded || state.configError || !state.config) return false;
  if (state.phase !== 'ready') return false;
  if (!state.config.enabled) return true;
  return !!state.ticket;
}

/** 是否需要渲染第二层（Tianai）组件 */
export function needsSecondary(state: CaptchaMachineState): boolean {
  if (!state.configLoaded || !state.config?.enabled) return false;
  if (state.phase === 'secondaryRequired' || state.phase === 'solvingSecondary') return true;
  return false;
}

/** 当前 ticket 是否已过期（供 UI 显示 / 定时器判断） */
export function isTicketExpired(state: CaptchaMachineState, now: number = Date.now()): boolean {
  return state.ticketExpiresAt !== null && state.ticketExpiresAt <= now;
}
