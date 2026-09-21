/**
 * 登录人机验证 hook —— 把纯状态机（captcha-machine.ts）接到网络请求上
 *
 * 与后端的契约（统一 Ticket 架构）：
 *   GET  /api/captcha/config    公开配置
 *   POST /api/captcha/generate  ALTCHA challenge（本地）/ TIANAI challenge（Koa 代理 Java 服务）
 *   POST /api/captcha/verify    统一校验 → 通过则签发一次性 captchaTicket
 *   POST /api/auth/login        只认 captchaTicket
 *
 * 职责：
 *   - 拉取公开配置（未完成前禁止提交登录）；
 *   - 用户名稳定（debounce 400ms）后按用户名生成 ALTCHA challenge（签名内绑定 tenant/username）；
 *   - 第一层 payload 交换**一次**即丢弃（服务端已一次性消费，绝不重复提交）；
 *   - 服务端返回 `requireFallback` 时加载 TIANAI challenge（Koa 签发的一次性 sessionId）并等待交互；
 *   - 用 cycleId 丢弃用户名变化 / 组件重挂载造成的过期响应，保证并发安全；
 *   - 用 expiresAt 定时让本地 ticket 失效并自动重新验证。
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  CAPTCHA_FIELD_NAME,
  CAPTCHA_GENERATE_URL,
  CAPTCHA_VERIFY_URL,
  CAPTCHA_REASON_TEXT,
  generateCaptcha,
  getCaptchaConfig,
  secondaryTypeOf,
  verifyCaptcha,
  type CaptchaConfig,
  type CaptchaProviderName,
  type SecondaryChallenge,
} from '@/services/auth/captcha';
import {
  canSubmit,
  captchaReducer,
  createInitialState,
  needsSecondary,
  type CaptchaPhase,
  type CaptchaMachineState,
} from '@/pages/user/login/captcha-machine';

/** 用户名稳定多久后才取 challenge（避免每敲一个字符都发请求） */
export const USERNAME_DEBOUNCE_MS = 500;

/** 同一轮内第一层组件的自动重试上限（防止报错 → 重取 → 再报错 的请求风暴） */
export const MAX_CHALLENGE_RETRY = 2;

/**
 * 浏览器是否处于**安全上下文**（HTTPS / localhost）。
 *
 * ALTCHA v3 的 Proof-of-Work 基于 WebCrypto（`crypto.subtle`），浏览器只在安全上下文里提供它，
 * 官方代码会直接抛 `Secure context (HTTPS) required.` —— 没有开关可以绕过。
 * 因此 `http://<局域网IP>` 访问时第一层根本无解，必须拦在提交之前并明确告知用户。
 */
export function isInsecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === false;
}

export const INSECURE_CONTEXT_HINT =
  '当前为非安全上下文（HTTP）：浏览器不允许执行人机验证，请改用 HTTPS 或 localhost 访问';

/** 配置拿不到 / 未开启时的安全默认值（fail closed 由状态机保证） */
const DISABLED_CONFIG: CaptchaConfig = {
  enabled: false,
  primaryProvider: 'ALTCHA',
  fallbackProvider: 'TIANAI',
  tianaiEnabled: false,
  generateUrl: CAPTCHA_GENERATE_URL,
  verifyUrl: CAPTCHA_VERIFY_URL,
  fieldName: CAPTCHA_FIELD_NAME,
};

export interface UseLoginCaptchaResult {
  state: CaptchaMachineState;
  phase: CaptchaPhase;
  config: CaptchaConfig | null;
  enabled: boolean;
  /** 登录按钮是否可用（config 未加载完成 / 出错 / 无凭证 → false） */
  submitEnabled: boolean;
  needSecondary: boolean;
  /**
   * 第一层 ALTCHA 的 challenge（**官方 JSON 字符串**）。
   * 官方 widget 对以 `{` 开头的 challenge 会直接解析，不再发请求，
   * 因此这里把 Koa `/api/captcha/generate` 的结果内联给它。
   */
  altchaChallenge: string | null;
  /** 变化即重新挂载 ALTCHA widget（重新取 challenge） */
  altchaKey: number;
  silentSolved: boolean;
  secondary: SecondaryChallenge | null;
  hint: string | null;
  /** 官方 widget 求解完成（invisible 无感 / standard 用户点击后） */
  onAltchaVerified: (payload: string) => void;
  onAltchaExpired: () => void;
  /** 第一层组件报错（非安全上下文 / 加载失败） */
  onAltchaError: () => void;
  /** 第二层（Tianai）提交答案 */
  onSecondarySubmit: (data: Record<string, unknown>) => void;
  /** 登录失败（密码错误）后重新拉取策略 */
  refreshPolicy: () => void;
  /** 提交前：置 submitting；返回 false 表示不允许提交 */
  beginSubmit: () => boolean;
  /** finally：服务端已消费 ticket，本地必须清空 */
  endSubmit: () => void;
  /** 当前可用的一次性 captchaTicket（服务端开启验证码时才有） */
  ticket: string | null;
}

export function useLoginCaptcha(username: string): UseLoginCaptchaResult {
  const [state, dispatch] = useReducer(captchaReducer, undefined, createInitialState);
  const [altchaChallenge, setAltchaChallenge] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  /** 第一层并发守卫：一次求解只允许发出一次 verify */
  const verifyingRef = useRef(false);
  /** 第二层 challenge 是否正在加载 */
  const secondaryLoadingRef = useRef(false);
  /** 当前 config（用于回调里读最新值，避免闭包过期） */
  const configRef = useRef<CaptchaConfig | null>(null);
  const [altchaKey, setAltchaKey] = useReducer((n: number) => n + 1, 0);
  /** 用户名 debounce 定时器 */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 同一轮（同一 username）内第一层组件自动重试次数：防止报错 → 重取 → 再报错 的死循环 */
  const challengeRetryRef = useRef(0);

  // ---------- 配置 ----------

  const loadConfig = useCallback(async (name: string): Promise<CaptchaConfig | null> => {
    try {
      const res = await getCaptchaConfig(name ? { username: name } : undefined);
      const cfg = ((res as any)?.data ?? null) as CaptchaConfig | null;
      if (!cfg) throw new Error('empty config');
      const merged = cfg?.enabled ? cfg : { ...DISABLED_CONFIG, ...cfg };
      configRef.current = merged;
      dispatch({ type: 'CONFIG_LOADED', config: merged });
      return merged;
    } catch {
      // fail closed：配置拿不到时不能按"未开启"直接放行登录
      configRef.current = null;
      dispatch({ type: 'CONFIG_FAILED' });
      return null;
    }
  }, []);

  // 首次加载配置（不含用户名）
  useEffect(() => {
    void loadConfig('');
  }, [loadConfig]);

  // 配置已加载且验证码开启，但浏览器不是安全上下文 → 第一层无解，直接明确报错并禁止提交
  // （功能关闭时不拦：原登录流程不需要 WebCrypto）
  useEffect(() => {
    if (!state.configLoaded || !state.config?.enabled || state.envBlocked) return;
    if (!isInsecureContext()) return;
    dispatch({ type: 'ENV_UNSUPPORTED', hint: INSECURE_CONTEXT_HINT });
  }, [state.configLoaded, state.config?.enabled, state.envBlocked]);

  /** 取第一层 challenge（带用户名，保证服务端把 tenant/username 签进 challenge） */
  const fetchSilentChallenge = useCallback(async (name: string, cfg: CaptchaConfig | null) => {
    if (!cfg?.enabled) {
      setAltchaChallenge(null);
      return;
    }
    try {
      const res = await generateCaptcha({
        provider: cfg.primaryProvider,
        username: name || undefined,
      });
      const data = ((res as any)?.data ?? null) as { challenge?: Record<string, unknown> } | null;
      if (!data?.challenge) throw new Error('empty challenge');
      setAltchaChallenge(JSON.stringify(data.challenge));
    } catch {
      setAltchaChallenge(null);
    }
  }, []);

  // 用户名变化：清空旧凭证 + debounce 后按新用户名重新拉策略并取 challenge
  useEffect(() => {
    dispatch({ type: 'USERNAME_CHANGED', username });
    verifyingRef.current = false;
    secondaryLoadingRef.current = false;
    challengeRetryRef.current = 0;
    setAltchaChallenge(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username) return undefined;

    debounceRef.current = setTimeout(() => {
      void (async () => {
        // ⚠ 这里**不再重新拉 /config**：统一 ticket 架构下公开配置只有
        // enabled / provider / tianaiEnabled，**没有任何与用户名相关的策略字段**
        // （是否要求第二层由 /verify 在服务端按风控判定并返回 requireFallback）。
        // 旧实现每次输入都多打一次 config，属于旧"requiredStage 下发"设计的遗留。
        // 如果首次配置还没拉回来，先补一次（仅在需要时）。
        if (!configRef.current) await loadConfig('');
        if (stateRef.current.username !== username) return;
        setAltchaKey();
        await fetchSilentChallenge(username, configRef.current);
      })();
    }, USERNAME_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, loadConfig, fetchSilentChallenge]);

  // ---------- 第一层 ----------

  const onAltchaVerified = useCallback(
    (payload: string) => {
      // 并发守卫：多个 verified 回调 / 重挂载只允许产生一次 verify 请求
      if (verifyingRef.current || !payload) return;
      const cycle = stateRef.current.cycleId;
      const name = stateRef.current.username;
      verifyingRef.current = true;
      dispatch({ type: 'SILENT_REQUESTED' });

      void (async () => {
        try {
          const res = await verifyCaptcha({ payload, username: name || undefined });
          // 过期响应直接丢弃（用户名已变 / 已重挂载）
          if (stateRef.current.cycleId !== cycle) return;

          const data: any = (res as any)?.data ?? {};
          if (data.status === 'passed' && data.captchaTicket) {
            dispatch({
              type: 'SILENT_TICKET',
              ticket: String(data.captchaTicket),
              expiresAt: Number(data.expiresAt ?? Date.now() + 120_000),
              provider: (data.provider ?? 'ALTCHA') as CaptchaProviderName,
            });
            return;
          }
          // 第一层通过但风控命中 → 必须继续完成第二层
          if (data.requireFallback || data.reason === 'SECONDARY_REQUIRED') {
            dispatch({
              type: 'SECONDARY_REQUIRED',
              hint: CAPTCHA_REASON_TEXT.SECONDARY_REQUIRED,
            });
            return;
          }
          dispatch({ type: 'SILENT_FAILED', hint: CAPTCHA_REASON_TEXT[String(data.reason ?? '')] });
        } catch {
          if (stateRef.current.cycleId !== cycle) return;
          dispatch({ type: 'SILENT_FAILED', hint: '人机验证服务暂不可用，请稍后重试' });
        } finally {
          verifyingRef.current = false;
        }
      })();
    },
    [],
  );

  const onAltchaExpired = useCallback(() => {
    verifyingRef.current = false;
    dispatch({ type: 'HINT', hint: '验证已过期，正在重新验证…' });
    setAltchaKey();
    void fetchSilentChallenge(stateRef.current.username, configRef.current);
  }, [fetchSilentChallenge]);

  /**
   * 第一层组件报错。
   * - 非安全上下文（HTTP 非 localhost）：ALTCHA 拿不到 `crypto.subtle`，无解 → 明确说明并禁止提交；
   * - 其他错误：可恢复，提示后重新取 challenge。
   */
  const onAltchaError = useCallback(() => {
    verifyingRef.current = false;
    if (isInsecureContext()) {
      dispatch({ type: 'ENV_UNSUPPORTED', hint: INSECURE_CONTEXT_HINT });
      return;
    }
    // 自动重试上限：否则"组件报错 → 重取 challenge → 再报错"会变成无限请求
    if (challengeRetryRef.current >= MAX_CHALLENGE_RETRY) {
      dispatch({ type: 'SILENT_FAILED', hint: '人机验证组件加载失败，请刷新页面重试' });
      return;
    }
    challengeRetryRef.current += 1;
    dispatch({ type: 'SILENT_FAILED', hint: '正在重新获取验证码…' });
    setAltchaKey();
    void fetchSilentChallenge(stateRef.current.username, configRef.current);
  }, [fetchSilentChallenge]);

  // ---------- 第二层 ----------

  const requireSecondary = needsSecondary(state);

  /** 取第二层（TIANAI）challenge：Koa 会把上游 challenge 归一化并签发一次性 sessionId */
  const fetchSecondaryChallenge = useCallback(async (): Promise<SecondaryChallenge | null> => {
    const cycle = stateRef.current.cycleId;
    const name = stateRef.current.username;
    const cfg = configRef.current;

    secondaryLoadingRef.current = true;
    dispatch({ type: 'SECONDARY_LOADING', secondaryType: null });
    try {
      const res = await generateCaptcha({ provider: 'TIANAI', username: name || undefined });
      if (stateRef.current.cycleId !== cycle) return null;
      const data = ((res as any)?.data ?? null) as
        | { challenge?: Record<string, unknown>; sessionId?: string; expiresAt?: number }
        | null;
      if (!data?.sessionId || !data?.challenge) throw new Error('empty challenge');
      const challenge: SecondaryChallenge = {
        sessionId: String(data.sessionId),
        type: secondaryTypeOf(data.challenge),
        expiresAt: Number(data.expiresAt ?? Date.now() + (cfg?.fieldName ? 180_000 : 180_000)),
        payload: data.challenge,
      };
      dispatch({ type: 'SECONDARY_CHALLENGE', challenge });
      return challenge;
    } catch (err: any) {
      if (stateRef.current.cycleId !== cycle) return null;
      // 优先透出服务端文案：例如 50301「人机验证服务暂不可用」（第二层未部署/不可达）
      dispatch({
        type: 'SECONDARY_FAILED',
        hint: err?.response?.data?.message ?? '验证码加载失败，请稍后重试',
      });
      return null;
    } finally {
      secondaryLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!requireSecondary) return;
    if (state.secondary || secondaryLoadingRef.current) return;
    void fetchSecondaryChallenge();
  }, [requireSecondary, state.secondary, fetchSecondaryChallenge]);

  const onSecondarySubmit = useCallback(
    (data: Record<string, unknown>) => {
      const session = stateRef.current.secondary;
      if (!session) return;
      const cycle = stateRef.current.cycleId;
      const name = stateRef.current.username;
      dispatch({ type: 'SECONDARY_LOADING', secondaryType: session.type });

      void (async () => {
        try {
          const res = await verifyCaptcha({
            provider: 'TIANAI',
            sessionId: session.sessionId,
            username: name || undefined,
            data,
          });
          if (stateRef.current.cycleId !== cycle) return;
          const payload: any = (res as any)?.data ?? {};
          if (payload.status === 'passed' && payload.captchaTicket) {
            dispatch({
              type: 'SECONDARY_TICKET',
              ticket: String(payload.captchaTicket),
              expiresAt: Number(payload.expiresAt ?? Date.now() + 120_000),
            });
            return;
          }
          dispatch({
            type: 'SECONDARY_FAILED',
            hint: CAPTCHA_REASON_TEXT[String(payload.reason ?? '')] ?? '验证未通过，请重试',
          });
          // 服务端已消费本地会话 → 重新取一个 challenge（保留失败提示，不清空）
          void fetchSecondaryChallenge();
        } catch (err: any) {
          if (stateRef.current.cycleId !== cycle) return;
          dispatch({
            type: 'SECONDARY_FAILED',
            hint: err?.response?.data?.message ?? '验证服务暂不可用，请稍后重试',
          });
        }
      })();
    },
    [fetchSecondaryChallenge],
  );

  // ---------- ticket 有效期 ----------

  useEffect(() => {
    if (!state.ticketExpiresAt) return undefined;
    const delay = Math.max(0, state.ticketExpiresAt - Date.now());
    const timer = setTimeout(() => {
      dispatch({ type: 'TICKET_EXPIRED' });
      // 过期后**显式**重新取一次 challenge。
      // ⚠ 不要写成"监听 phase === 'solvingSilent' 且 challenge 为空就 fetch"的 effect：
      //   用户名每变一次都会清空 challenge，于是每个字符都会触发一次 generate（而且失败会自激）。
      setAltchaKey();
      void fetchSilentChallenge(stateRef.current.username, configRef.current);
    }, delay);
    return () => clearTimeout(timer);
  }, [state.ticketExpiresAt, fetchSilentChallenge]);

  // ---------- 提交 ----------

  const beginSubmit = useCallback((): boolean => {
    if (!canSubmit(stateRef.current)) return false;
    dispatch({ type: 'SUBMIT_START' });
    return true;
  }, []);

  const endSubmit = useCallback(() => {
    // 无论成功 / 失败：后端都已一次性消费，本地必须清空
    dispatch({ type: 'LOGIN_SENT' });
    dispatch({ type: 'SUBMIT_END' });
  }, []);

  const refreshPolicy = useCallback(() => {
    // 密码错误后策略可能升级（连续失败达阈值）→ 重新拉配置并重新取 challenge
    verifyingRef.current = false;
    secondaryLoadingRef.current = false;
    dispatch({ type: 'RESET' });
    setAltchaChallenge(null);
    setAltchaKey();
    void (async () => {
      const name = stateRef.current.username;
      // 配置与用户名无关（见上面说明），这里只为拿到最新 provider/开关
      const cfg = await loadConfig('');
      await fetchSilentChallenge(name, cfg);
    })();
  }, [loadConfig, fetchSilentChallenge]);

  return {
    state,
    phase: state.phase,
    config: state.config,
    enabled: !!state.config?.enabled,
    submitEnabled: canSubmit(state),
    needSecondary: requireSecondary,
    altchaChallenge,
    altchaKey,
    silentSolved: state.silentSolved,
    secondary: state.secondary,
    hint: state.hint,
    onAltchaVerified,
    onAltchaExpired,
    onAltchaError,
    onSecondarySubmit,
    refreshPolicy,
    beginSubmit,
    endSubmit,
    ticket: state.ticket,
  };
}
