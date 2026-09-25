/**
 * 登录页 —— 两级人机验证状态机
 *
 * 第一层：ALTCHA Proof-of-Work，可见形态（`display="standard"`，展示"我不是机器人"确认框；
 *        状态机内部仍叫 `solvingSilent`，因为对状态流转而言它是自动的、不是用户答题）
 * 第二层：服务端策略命中后由 Tianai CAPTCHA 完成（`secondaryRequired` / `solvingSecondary`）
 *
 * 提交规则（不可绕过）：
 *   - 公开配置未加载完成 / 加载失败 → **禁止提交**；
 *   - 服务端开启验证码时，必须持有服务端签发的一次性 captchaTicket 才能提交；
 *   - `/login` 请求发出后（无论成败）立即清除本地 ticket（服务端已一次性消费）；
 *   - 密码错误后重新拉取策略，命中阈值时会出现第二层验证。
 *
 * 本页不保存密码：密码只作为表单值在提交瞬间读取，不写入 ref / state。
 */
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, Helmet, SelectLang, useIntl, useModel } from '@umijs/max';
import { Alert, App } from 'antd';
import { createStyles } from 'antd-style';
import React, { startTransition, useCallback, useRef, useState } from 'react';
import { Footer } from '@/components';
import AltchaCaptcha from '@/components/AltchaCaptcha';
import TianaiCaptcha from '@/components/TianaiCaptcha';
import { useLoginCaptcha } from '@/hooks/useLoginCaptcha';
import { login } from '@/services/ant-design-pro/api';
import { CAPTCHA_ERROR_CODES } from '@/services/auth/captcha';
import { tokenStore } from '@/auth/token-store';
import Settings from '../../../../config/defaultSettings';

const useStyles = createStyles(({ token, isDarkMode }) => {
  /** 磨砂玻璃的底色 / 描边：浅色模式用白色半透明，深色模式用深色半透明 */
  const glassBg = isDarkMode ? 'rgba(22, 24, 29, 0.55)' : 'rgba(255, 255, 255, 0.55)';
  const glassBorder = isDarkMode ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.65)';
  const glassBlur = 'blur(18px) saturate(160%)';

  return {
    lang: {
      width: 42,
      height: 42,
      lineHeight: '42px',
      position: 'fixed',
      right: 16,
      borderRadius: token.borderRadius,
      // 语言切换按钮浮在背景图上，同样给一层玻璃，避免看不清
      background: glassBg,
      border: `1px solid ${glassBorder}`,
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      ':hover': {
        backgroundColor: token.colorBgTextHover,
      },
    },
    container: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      overflow: 'auto',
      // 全屏背景图：public/login-bg.png → 构建后位于站点根路径，用绝对路径引用
      backgroundImage: 'url(/login-bg.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    },
    /** 登录区：把登录框推到右侧居中；窄屏回落到居中、内边距收紧 */
    loginArea: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '32px 6vw',
      '@media (max-width: 768px)': {
        justifyContent: 'center',
        padding: '24px 16px',
      },
    },
    /** 磨砂玻璃面板：半透明底 + 背景模糊 + 细描边 + 投影 */
    panel: {
      width: 420,
      maxWidth: '100%',
      padding: '32px 32px 16px',
      borderRadius: 20,
      background: glassBg,
      border: `1px solid ${glassBorder}`,
      backdropFilter: glassBlur,
      WebkitBackdropFilter: glassBlur,
      boxShadow: isDarkMode
        ? '0 12px 40px rgba(0, 0, 0, 0.55)'
        : '0 12px 40px rgba(0, 0, 0, 0.18)',
      /**
       * ⚠ pro-components 的 `LoginForm` **自带白色容器**（`.ant-pro-form-login-container`），
       * 会把玻璃面板挡成"白卡片"，只剩四角能看出磨砂 → 这里把它的底色去掉、内边距交给面板。
       * 同时 `.ant-pro-form-login-main` 默认固定 328px，会造成"输入框窄、登录按钮宽"的错位，
       * 一并撑满面板。
       */
      '.ant-pro-form-login-container': {
        backgroundColor: 'transparent',
        padding: 0,
      },
      '.ant-pro-form-login-main': {
        width: '100%',
        maxWidth: '100%',
        backgroundColor: 'transparent',
      },
      '.ant-pro-form-login-header': {
        backgroundColor: 'transparent',
      },
      // ALTCHA 官方组件自带白底，同样让它透出玻璃（只影响本页）
      'altcha-widget': {
        backgroundColor: 'transparent',
      },
      '@media (max-width: 768px)': {
        width: '100%',
        padding: '24px 20px 8px',
      },
    },
  };
});

const Lang = () => {
  const { styles } = useStyles();
  return <div className={styles.lang} data-lang>{SelectLang && <SelectLang />}</div>;
};

const LoginMessage: React.FC<{ content: string }> = ({ content }) => (
  <Alert style={{ marginBottom: 24 }} message={content} type="error" showIcon />
);

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

  /** 用户名（表单驱动）：稳定后 hook 才会按用户名拉策略 / 取 challenge */
  const [username, setUsername] = useState('');

  const captcha = useLoginCaptcha(username);
  const { submitEnabled, ticket: captchaTicket, phase } = captcha;

  React.useEffect(() => {
    const rememberedUsername = tokenStore.getRememberedUsername() ?? '';
    if (rememberedUsername) {
      formRef.current?.setFieldsValue({ username: rememberedUsername, rememberUsername: true });
      setUsername(rememberedUsername);
    }
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

  /** 执行登录（captchaTicket 由调用方从状态机读取） */
  const doLogin = useCallback(
    async (values: LoginValues, captchaTicketValue: string | null) => {
      const res = await login(
        {
          username: values.username,
          password: values.password,
          type: 'account',
          // 登录接口只认服务端签发的一次性 captchaTicket
          ...(captchaTicketValue ? { captchaTicket: captchaTicketValue } : {}),
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

  const handleSubmit = async (values: LoginValues) => {
    if (submittingRef.current) return;

    // 配置未加载完成 / 加载失败 / 尚无凭证 → 禁止提交（前端第一道闸门，后端仍会强制校验）
    if (!captcha.beginSubmit()) {
      message.warning(captcha.hint ?? '请先完成人机验证');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await doLogin(values, captchaTicket);
    } catch (error: any) {
      setUserLoginState({ status: 'error', type: 'account' });
      const code = Number(error?.response?.data?.code);

      if (CAPTCHA_ERROR_CODES.includes(code as any)) {
        // 验证码凭证问题：提示并重新走验证流程（不自动补发登录，由用户再次提交）
        message.warning(error?.response?.data?.message ?? '人机验证未通过，请重新验证');
        captcha.refreshPolicy();
      } else {
        // 密码错误等：策略可能因连续失败而升级（下一次提交可能出现第二层验证）
        captcha.refreshPolicy();
        message.error(error?.response?.data?.message || error?.response?.data?.errmsg || '账号或密码错误');
      }
    } finally {
      // 无论成功或失败：后端都已一次性消费 captchaTicket，本地必须清空
      captcha.endSubmit();
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

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
      <div className={styles.loginArea}>
        <div className={styles.panel}>
        <LoginForm
          formRef={formRef}
          contentStyle={{ minWidth: 280, maxWidth: '100%', width: '100%' }}
          logo={appLogo || undefined}
          title={appName}
          subTitle={intl.formatMessage({ id: 'pages.layouts.userLayout.title' })}
          initialValues={{ autoLogin: true, rememberUsername: false }}
          onValuesChange={(changed) => {
            if (changed && typeof changed.username === 'string') setUsername(changed.username);
          }}
          onFinish={async (values) => {
            await handleSubmit(values as LoginValues);
          }}
          submitter={{
            searchConfig: {
              submitText: '登录',
            },
            submitButtonProps: {
              loading: submitting,
              // 人机验证未就绪 / 配置未加载完成 → 按钮不可用
              disabled: !submitEnabled,
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

          {/*
            第一层：ALTCHA Proof-of-Work。
            display="standard" → 官方可见形态（"我不是机器人"确认框 + 求解进度），
            用户**看得见**正在做安全校验，不再是"提交后莫名失败"。
            交互仍是 PoW：进页面即自动开始求解（约 0.5-2 秒后自动打勾），
            没算完/失败时用户可点击重试；完成才向前端发一次性 captchaTicket。
            它不是第二层（图形验证）—— 第二层见下面的 TianaiCaptcha。
          */}
          {/*
            ⚠ 第二层期间这里**只隐藏、不卸载**（曾经的 `!needSecondary &&` 写法会卸载）。
            卸载后等第二层通过（needSecondary 变回 false）第一层组件会重新挂载，
            官方 widget 的 auto="onload" 会再求解一次**同一份已被消费的 challenge** →
            服务端判过期 → SILENT_FAILED 把刚签发的 ticket 清掉 → 回第一层 → 风控又要求
            第二层 → 无限循环。保持挂载后 widget 不会重跑，配合 hook 里的阶段守卫双保险。
          */}
          {captcha.enabled && captcha.altchaChallenge && (
            <div style={{ display: captcha.needSecondary ? 'none' : undefined }}>
              <AltchaCaptcha
                enabled={captcha.enabled}
                display="standard"
                challenge={captcha.altchaChallenge}
                fieldName={captcha.config?.fieldName ?? 'altchaPayload'}
                instanceKey={captcha.altchaKey}
                solved={captcha.silentSolved}
                onVerified={captcha.onAltchaVerified}
                onExpired={captcha.onAltchaExpired}
                onError={captcha.onAltchaError}
              />
            </div>
          )}

          {/* 第二层：Tianai 图形验证（独立组件，不复用 altcha-widget） */}
          {captcha.needSecondary && captcha.secondary && (
            <div style={{ marginBottom: 16 }}>
              <TianaiCaptcha
                challenge={captcha.secondary}
                loading={phase === 'solvingSecondary'}
                disabled={submitting}
                onSubmit={captcha.onSecondarySubmit}
                onRefresh={captcha.refreshPolicy}
              />
            </div>
          )}

          {captcha.hint && (
            <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={captcha.hint} />
          )}

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
      </div>
      <Footer />
    </div>
  );
};

export default Login;
