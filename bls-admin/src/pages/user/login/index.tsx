import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, Helmet, SelectLang, useIntl, useModel } from '@umijs/max';
import { Alert, App } from 'antd';
import { createStyles } from 'antd-style';
import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Footer } from '@/components';
import CaptchaChallengeModal from '@/components/CaptchaChallenge';
import { login } from '@/services/ant-design-pro/api';
import {
  createCaptchaChallenge,
  getCaptchaConfig,
  verifyCaptchaSilent,
  type CaptchaChallenge,
  type CaptchaPublicConfig,
} from '@/services/auth/captcha';
import { loginBehaviorCollector } from '@/auth/behavior-collector';
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

const CAPTCHA_DISABLED: CaptchaPublicConfig = { enabled: false, mode: 'off', secondaryTypes: [] };
/** captcha 业务码：40010 缺失 / 40011 无效 / 40012 过期 / 40013 重放 / 50301 服务不可用 */
const CAPTCHA_ERROR_CODES = [40010, 40011, 40012, 40013, 50301];

type LoginValues = API.LoginParams & { rememberUsername?: boolean };

/** 后端 challenge 响应 → 前端结构 */
function toChallenge(data: any): CaptchaChallenge | null {
  if (!data?.challengeId || !data?.stage || !data?.nonce) return null;
  return {
    challengeId: String(data.challengeId),
    stage: data.stage,
    expiresAt: Number(data.expiresAt ?? 0),
    nonce: String(data.nonce),
    secondaryType: data.secondaryType,
    payload: data.payload ?? null,
  };
}

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

  // ===== 登录人机验证状态 =====
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaPublicConfig>(CAPTCHA_DISABLED);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [secondaryChallenge, setSecondaryChallenge] = useState<CaptchaChallenge | null>(null);
  /** 已签发的一次性 captchaToken（登录成功后立即作废，重复使用会被服务端拒绝） */
  const captchaTokenRef = useRef<string | null>(null);
  /** 第一层静默 challenge */
  const silentChallengeRef = useRef<CaptchaChallenge | null>(null);
  /** 等待第二层验证完成后继续登录的表单值 */
  const pendingValuesRef = useRef<LoginValues | null>(null);
  /** 当前验证码绑定的账号（用于二级验证弹窗提交） */
  const captchaUsernameRef = useRef('');
  const captchaRetryRef = useRef(false);
  /** 供弹窗成功回调复用最新的 handleSubmit */
  const handleSubmitRef = useRef<((values: LoginValues) => Promise<void>) | null>(null);

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

  /** 创建 challenge；stage=secondary 时（且允许）打开第二层弹窗 */
  const createChallenge = useCallback(
    async (
      username?: string,
      stage?: 'secondary',
      openSecondary = true,
    ): Promise<CaptchaChallenge | null> => {
      setCaptchaLoading(true);
      try {
        const res = await createCaptchaChallenge({ username, stage });
        const challenged = toChallenge((res as any)?.data ?? {});
        if (!challenged) return null;
        if (challenged.stage === 'secondary') {
          if (openSecondary) {
            setSecondaryChallenge(challenged);
            setSecondaryOpen(true);
          }
          return null;
        }
        return challenged;
      } catch {
        return null;
      } finally {
        setCaptchaLoading(false);
      }
    },
    [],
  );

  // 挂载时读取公开配置：enabled=false 时保持原登录流程
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getCaptchaConfig();
        const cfg = (res as any)?.data as CaptchaPublicConfig | undefined;
        if (!alive) return;
        if (cfg?.enabled) {
          setCaptchaConfig({ ...CAPTCHA_DISABLED, ...cfg, enabled: true });
          loginBehaviorCollector.start();
          // 只预热「静默」challenge：always / 高风险场景由提交时再进入第二层，避免用户还没输入就弹窗
          silentChallengeRef.current = await createChallenge(undefined, undefined, false);
        } else {
          setCaptchaConfig(CAPTCHA_DISABLED);
        }
      } catch {
        // 配置获取失败不阻断登录（后端仍会在登录时强制校验）
        if (alive) setCaptchaConfig(CAPTCHA_DISABLED);
      }
    })();
    return () => {
      alive = false;
      loginBehaviorCollector.stop();
    };
  }, [createChallenge]);

  /** 第二层验证成功 → 用一次性 token 继续登录 */
  const handleSecondarySuccess = useCallback(async (captchaToken: string) => {
    captchaTokenRef.current = captchaToken;
    setSecondaryOpen(false);
    setSecondaryChallenge(null);
    const values = pendingValuesRef.current;
    pendingValuesRef.current = null;
    if (values) await handleSubmitRef.current?.(values);
  }, []);

  const handleSecondaryClose = useCallback(() => {
    setSecondaryOpen(false);
    setSecondaryChallenge(null);
    pendingValuesRef.current = null;
    message.warning('已取消安全验证，登录未完成');
  }, [message]);

  /** 刷新验证码：重新申请一个二级挑战 */
  const handleSecondaryRefresh = useCallback(async () => {
    setSecondaryChallenge(null);
    await createChallenge(captchaUsernameRef.current || undefined, 'secondary');
  }, [createChallenge]);

  /** 第一层：静默验证；通过返回 captchaToken，否则打开第二层弹窗并返回 null */
  const runSilentVerify = useCallback(
    async (username: string): Promise<string | null> => {
      let challenge = silentChallengeRef.current;
      if (!challenge || challenge.expiresAt <= Date.now()) {
        challenge = await createChallenge(username);
      }
      if (!challenge) return null;

      const summary = loginBehaviorCollector.summary();
      const finishedAt = Date.now();
      const startedAt = finishedAt - (summary.dwellMs || 0);

      try {
        const res = await verifyCaptchaSilent({
          challengeId: challenge.challengeId,
          nonce: challenge.nonce,
          username,
          startedAt,
          finishedAt,
          interactionSummary: summary,
        });
        const data: any = (res as any)?.data ?? {};
        silentChallengeRef.current = null;
        if (data.passed && data.captchaToken) {
          captchaTokenRef.current = String(data.captchaToken);
          return captchaTokenRef.current;
        }
        const next = toChallenge(data.secondaryChallenge);
        if (next) {
          setSecondaryChallenge(next);
          setSecondaryOpen(true);
        }
        return null;
      } catch {
        silentChallengeRef.current = null;
        return null;
      }
    },
    [createChallenge],
  );

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
        // 一次性 token 已被服务端消费
        captchaTokenRef.current = null;
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

  /** captcha 相关登录错误：清理一次性 token，并按需自动重试一次 */
  const handleCaptchaLoginError = useCallback(
    async (error: any, values: LoginValues): Promise<boolean> => {
      const code = Number(error?.response?.data?.code);
      if (!CAPTCHA_ERROR_CODES.includes(code)) return false;

      captchaTokenRef.current = null;
      silentChallengeRef.current = null;

      if (code === 50301) {
        message.error(error?.response?.data?.message ?? '人机验证服务暂不可用，请稍后重试');
        return true;
      }

      if (!captchaRetryRef.current) {
        captchaRetryRef.current = true;
        try {
          const token = await runSilentVerify(String(values.username ?? ''));
          if (token) {
            await doLogin(values, token);
            return true;
          }
          message.warning('人机验证已失效，请重新验证');
          return true;
        } finally {
          captchaRetryRef.current = false;
        }
      }

      message.warning(error?.response?.data?.message ?? '人机验证未通过，请重试');
      return true;
    },
    [doLogin, message, runSilentVerify],
  );

  const handleSubmit = async (values: LoginValues) => {
    // Prevent duplicate submissions using a ref (synchronous guard)
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    captchaUsernameRef.current = String(values.username ?? '');
    try {
      // 功能关闭 → 保持原登录流程
      if (!captchaConfig.enabled) {
        await doLogin(values, null);
        return;
      }

      if (captchaTokenRef.current) {
        await doLogin(values, captchaTokenRef.current);
        return;
      }

      const token = await runSilentVerify(String(values.username ?? ''));
      if (token) {
        await doLogin(values, token);
        return;
      }
      // 需要第二层验证：记录表单值，弹窗验证成功后继续登录
      pendingValuesRef.current = values;
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
              loading: submitting || captchaLoading,
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

      <CaptchaChallengeModal
        open={secondaryOpen}
        challenge={secondaryChallenge}
        username={captchaUsernameRef.current}
        loading={captchaLoading}
        onSuccess={handleSecondarySuccess}
        onClose={handleSecondaryClose}
        onRefresh={handleSecondaryRefresh}
      />
    </div>
  );
};

export default Login;
