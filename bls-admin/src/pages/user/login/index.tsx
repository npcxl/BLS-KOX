import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, Helmet, SelectLang, useIntl, useModel } from '@umijs/max';
import { Alert, App } from 'antd';
import { createStyles } from 'antd-style';
import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Footer } from '@/components';
import AltchaCaptcha from '@/components/AltchaCaptcha';
import { login } from '@/services/ant-design-pro/api';
import {
  CAPTCHA_REASON_TEXT,
  getCaptchaConfig,
  verifyCaptcha,
  type CaptchaConfig,
  type CaptchaDisplay,
} from '@/services/auth/captcha';
import { tokenStore } from '@/auth/token-store';
import Settings from '../../../../config/defaultSettings';

const useStyles = createStyles(({ token }) => ({
  lang: {
    width: 42,
    height: 42,
    lineHeight: '42px',
    position: 'fixed',
    right: 16,
    borderRadius: token.borderRadius,
    ':hover': {
      backgroundColor: token.colorBgTextHover,
    },
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'auto',
    background: '#fff',
  },
}));

const Lang = () => {
  const { styles } = useStyles();
  return <div className={styles.lang} data-lang>{SelectLang && <SelectLang />}</div>;
};

const LoginMessage: React.FC<{ content: string }> = ({ content }) => (
  <Alert style={{ marginBottom: 24 }} message={content} type="error" showIcon />
);

const CAPTCHA_DISABLED: CaptchaConfig = {
  enabled: false,
  mode: 'off',
  provider: 'altcha',
  display: 'invisible',
  challengeUrl: '/api/auth/captcha/challenge',
  fieldName: 'altchaPayload',
};

/** captcha 业务码：40010 缺失 / 40011 无效 / 40012 过期 / 40013 重放 / 50301 服务不可用 */
const CAPTCHA_ERROR_CODES = [40010, 40011, 40012, 40013, 50301];

type LoginValues = API.LoginParams & { rememberUsername?: boolean };

const Login: React.FC = () => {
  const [userLoginState, setUserLoginState] = useState<API.LoginResult>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<any>(null);
  const { initialState, setInitialState } = useModel('@@initialState');
  const { styles } = useStyles();
  const { message } = App.useApp();
  const intl = useIntl();
  const appName = initialState?.systemMap?.['sys.app.name'] ?? Settings.title ?? 'title-default';
  const appLogo = initialState?.systemMap?.['sys.app.logo'] ?? Settings.logo;

  // ===== 登录人机验证（ALTCHA）状态 =====
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaConfig>(CAPTCHA_DISABLED);
  const [captchaDisplay, setCaptchaDisplay] = useState<CaptchaDisplay>('invisible');
  const [captchaHint, setCaptchaHint] = useState<string | null>(null);
  /**
   * 静默验证是否已完成并拿到 captchaToken。
   * 必须是 state —— 用 ref 不会触发重渲染，界面会一直停在「正在后台完成安全校验…」。
   */
  const [captchaSolved, setCaptchaSolved] = useState(false);
  /** 每次需要刷新 challenge 时自增，用于重新挂载官方 widget */
  const [captchaInstance, setCaptchaInstance] = useState(0);
  /** 官方 widget 产出的 payload（一次性；提交后作废） */
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  /** 服务端签发的一次性 captchaToken */
  const captchaTokenRef = useRef<string | null>(null);
  const captchaRetryRef = useRef(false);
  const handleSubmitRef = useRef<((values: LoginValues) => Promise<void>) | null>(null);
  /** 因人机验证失败而挂起的登录：widget 重新求解成功后自动补发一次，用户无需再点登录 */
  const pendingLoginRef = useRef<LoginValues | null>(null);
  /** doLogin 定义在下方，用 ref 转发避免 TDZ */
  const doLoginRef = useRef<((values: LoginValues, captchaToken: string | null) => Promise<void>) | null>(null);

  useEffect(() => {
    const rememberedUsername = tokenStore.getRememberedUsername() ?? undefined;
    formRef.current?.setFieldsValue({
      username: rememberedUsername,
      rememberUsername: !!rememberedUsername,
    });
  }, []);

  const getSafeRedirectUrl = (redirect: string | null): string => {
    if (!redirect?.startsWith('/')) return '/dashboard';
    if (redirect.startsWith('//')) return '/dashboard';
    try {
      const parsed = new URL(redirect, window.location.origin);
      if (parsed.origin !== window.location.origin) return '/dashboard';
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return '/dashboard';
    }
  };

  const fetchUserInfo = async () => {
    const userInfo = await initialState?.fetchUserInfo?.();
    if (userInfo) {
      startTransition(() => {
        setInitialState((s) => ({ ...s, currentUser: userInfo }));
      });
    }
  };

  /** 重新拉取一次配置（策略可能因连续失败 / 风险升高而变化） */
  const refreshCaptchaConfig = useCallback(async (username?: string): Promise<CaptchaConfig> => {
    try {
      const res = await getCaptchaConfig(username ? { username } : undefined);
      const cfg = (res as any)?.data as CaptchaConfig | undefined;
      const next = cfg?.enabled ? { ...CAPTCHA_DISABLED, ...cfg, enabled: true } : CAPTCHA_DISABLED;
      setCaptchaConfig(next);
      setCaptchaDisplay(next.display);
      return next;
    } catch {
      setCaptchaConfig(CAPTCHA_DISABLED);
      setCaptchaDisplay('invisible');
      return CAPTCHA_DISABLED;
    }
  }, []);

  // 挂载时读取公开配置：enabled=false 时保持原登录流程
  useEffect(() => {
    void refreshCaptchaConfig();
  }, [refreshCaptchaConfig]);

  /** 把官方 widget 的 payload 交给服务端校验 → 换取一次性 captchaToken */
  const exchangePayload = useCallback(
    async (payload: string, stage: CaptchaDisplay, username?: string): Promise<boolean> => {
      try {
        const res = await verifyCaptcha({ payload, username, stage });
        const data: any = (res as any)?.data ?? {};
        if (data.passed && data.captchaToken) {
          captchaTokenRef.current = String(data.captchaToken);
          setCaptchaHint(null);
          setCaptchaSolved(true);
          return true;
        }
        if (data.requireVisible) {
          // 服务端要求人工交互：切换为官方可见组件并重新获取 challenge
          setCaptchaDisplay('visible');
          setCaptchaHint(CAPTCHA_REASON_TEXT[String(data.reason ?? '')] ?? '请完成下方安全验证');
          setAltchaPayload(null);
          setCaptchaSolved(false);
          setCaptchaInstance((n) => n + 1);
          return false;
        }
        setCaptchaHint(CAPTCHA_REASON_TEXT[String(data.reason ?? '')] ?? '人机验证未通过，请重试');
        setAltchaPayload(null);
        setCaptchaSolved(false);
        setCaptchaInstance((n) => n + 1);
        return false;
      } catch {
        setCaptchaHint('人机验证服务暂不可用，请稍后重试');
        setCaptchaSolved(false);
        return false;
      }
    },
    [],
  );

  /** 官方 widget 求解完成（invisible 无感 / visible 用户点击后） */
  const handleAltchaVerified = useCallback(
    async (payload: string) => {
      setAltchaPayload(payload);
      const username = String(formRef.current?.getFieldValue?.('username') ?? '');
      const ok = await exchangePayload(payload, captchaDisplay, username || undefined);

      // 上一次登录因人机验证被拒（40010-40013）→ 拿到新凭证后自动补发登录
      const pending = pendingLoginRef.current;
      if (!ok || !pending) return;
      pendingLoginRef.current = null;
      setSubmitting(true);
      try {
        await doLoginRef.current?.(pending, captchaTokenRef.current);
      } catch (error: any) {
        setUserLoginState({ status: 'error', type: 'account' });
        message.error(error?.response?.data?.message ?? '登录失败，请重试');
      } finally {
        setSubmitting(false);
      }
    },
    [captchaDisplay, exchangePayload, message, setUserLoginState],
  );

  /** challenge 过期 → 重新拉取并求解 */
  const handleAltchaReset = useCallback(() => {
    setAltchaPayload(null);
    captchaTokenRef.current = null;
    setCaptchaSolved(false);
    setCaptchaInstance((n) => n + 1);
  }, []);

  // ===== 登录 =====
  const doLogin = useCallback(
    async (values: LoginValues, captchaToken: string | null) => {
      const res = await login(
        {
          username: values.username,
          password: values.password,
          type: 'account',
          ...(captchaToken ? { captchaToken } : {}),
        } as any,
        // 错误提示由本页面统一控制，避免重复 toast
        { skipErrorMessage: true },
      );
      const msg = (res as any).data;
      if (res.code === 200 && msg?.token) {
        tokenStore.setTokenPair({
          accessToken: msg.token,
          refreshToken: msg.refreshToken ?? '',
        });
        if (msg.user) {
          tokenStore.setCurrentUser(msg.user);
        }
        if (values.rememberUsername && values.username) {
          tokenStore.setRememberedUsername(values.username);
        } else {
          tokenStore.clearRememberedUsername();
        }
        // 一次性凭证与 payload 均已被服务端消费
        captchaTokenRef.current = null;
        setAltchaPayload(null);
        message.success(
          intl.formatMessage({ id: 'pages.login.success', defaultMessage: '登录成功！' }),
        );
        if (msg.user) {
          startTransition(() => {
            setInitialState((s) => ({ ...s, currentUser: msg.user }));
          });
        } else {
          await fetchUserInfo();
        }
        const urlParams = new URL(window.location.href).searchParams;
        window.location.href = getSafeRedirectUrl(urlParams.get('redirect'));
        return;
      }
      setUserLoginState({ ...msg, status: 'error', type: 'account' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialState, intl, message, setInitialState],
  );
  doLoginRef.current = doLogin;

  /** captcha 相关登录错误：清理凭证，重新取 challenge 并重试一次 */
  const handleCaptchaLoginError = useCallback(
    async (error: any, values: LoginValues): Promise<boolean> => {
      const code = Number(error?.response?.data?.code);
      if (!CAPTCHA_ERROR_CODES.includes(code)) return false;

      captchaTokenRef.current = null;
      setAltchaPayload(null);
      setCaptchaSolved(false);

      if (code === 50301) {
        message.error(error?.response?.data?.message ?? '人机验证服务暂不可用，请稍后重试');
        return true;
      }

      if (!captchaRetryRef.current) {
        captchaRetryRef.current = true;
        try {
          const cfg = await refreshCaptchaConfig(String(values.username ?? ''));
          setCaptchaHint('人机验证已失效，正在重新验证…');
          setCaptchaInstance((n) => n + 1);
          if (!cfg.enabled) {
            // 配置已关闭 → 直接按原流程登录
            await doLogin(values, null);
          } else {
            // 仍开启 → 挂起这次登录，widget 重新求解成功后自动补发
            pendingLoginRef.current = values;
          }
          return true;
        } finally {
          captchaRetryRef.current = false;
        }
      }

      message.warning(error?.response?.data?.message ?? '人机验证未通过，请重试');
      return true;
    },
    [doLogin, message, refreshCaptchaConfig],
  );

  const handleSubmit = async (values: LoginValues) => {
    // 用户手动提交：丢弃可能残留的自动补发，避免重复登录
    pendingLoginRef.current = null;
    // Prevent duplicate submissions using a ref (synchronous guard)
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // 功能关闭 → 保持原登录流程
      if (!captchaConfig.enabled) {
        await doLogin(values, null);
        return;
      }

      let token = captchaTokenRef.current;
      if (!token) {
        if (!altchaPayload) {
          setCaptchaDisplay('visible');
          setCaptchaInstance((n) => n + 1);
          message.warning(captchaHint ?? '请先完成下方安全验证');
          return;
        }
        const ok = await exchangePayload(altchaPayload, captchaDisplay, String(values.username ?? '') || undefined);
        if (!ok) {
          message.warning(captchaHint ?? '请完成下方安全验证');
          return;
        }
        token = captchaTokenRef.current;
      }

      await doLogin(values, token);
    } catch (error: any) {
      setUserLoginState({
        status: 'error',
        type: 'account',
      });

      if (await handleCaptchaLoginError(error, values)) return;

      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.errmsg ||
        '账号或密码错误';

      message.error(errorMessage);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  handleSubmitRef.current = handleSubmit;

  const { status, type: loginType } = userLoginState;

  return (
    <div className={styles.container}>
      <Helmet>
        <title>
          {intl.formatMessage({ id: 'menu.login', defaultMessage: '登录页' })}
          {appName && ` - ${appName}`}
        </title>
      </Helmet>
      <Lang />
      <div style={{ flex: '1', padding: '32px 0' }}>
        <LoginForm
          formRef={formRef}
          contentStyle={{ minWidth: 280, maxWidth: '75vw' }}
          logo={appLogo || undefined}
          title={appName}
          subTitle={intl.formatMessage({ id: 'pages.layouts.userLayout.title' })}
          initialValues={{ autoLogin: true, rememberUsername: false }}
          onFinish={async (values) => {
            await handleSubmit(values as LoginValues);
          }}
          submitter={{
            searchConfig: {
              submitText: '登录',
            },
            submitButtonProps: {
              loading: submitting,
            },
          }}
        >
          {status === 'error' && loginType === 'account' && (
            <LoginMessage
              content={userLoginState?.message || intl.formatMessage({
                id: 'pages.login.accountLogin.errorMessage',
                defaultMessage: '登录失败，请重试',
              })}
            />
          )}

          <ProFormText
            name="username"
            fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
            placeholder={intl.formatMessage({
              id: 'pages.login.username',
              defaultMessage: '请输入账号',
            })}
            rules={[
              {
                required: true,
                message: (
                  <FormattedMessage id="pages.login.username.required" defaultMessage="请输入用户名!" />
                ),
              },
            ]}
          />

          <ProFormText.Password
            name="password"
            fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
            placeholder={intl.formatMessage({
              id: 'pages.login.password',
              defaultMessage: '请输入密码',
            })}
            rules={[
              {
                required: true,
                message: (
                  <FormattedMessage id="pages.login.password.required" defaultMessage="请输入密码！" />
                ),
              },
            ]}
          />

          {captchaConfig.enabled && (
            <AltchaCaptcha
              enabled={captchaConfig.enabled}
              display={captchaDisplay}
              challengeUrl={captchaConfig.challengeUrl}
              fieldName={captchaConfig.fieldName}
              instanceKey={captchaInstance}
              solved={captchaSolved}
              onVerified={handleAltchaVerified}
              onExpired={handleAltchaReset}
            />
          )}

          {captchaHint && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={captchaHint} />}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <ProFormCheckbox name="rememberUsername" noStyle>
              记住用户名
            </ProFormCheckbox>
            <a href="#" onClick={(e) => e.preventDefault()}>
              <FormattedMessage id="pages.login.forgotPassword" defaultMessage="忘记密码" />
            </a>
          </div>
        </LoginForm>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
