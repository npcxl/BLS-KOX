import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, Helmet, SelectLang, useIntl, useModel } from '@umijs/max';
import { Alert, App } from 'antd';
import { createStyles } from 'antd-style';
import React, { startTransition, useEffect, useRef, useState } from 'react';
import { Footer } from '@/components';
import { login } from '@/services/ant-design-pro/api';
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

  const handleSubmit = async (values: API.LoginParams & { rememberUsername?: boolean }) => {
    // Prevent duplicate submissions using a ref (synchronous guard)
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await login({ username: values.username, password: values.password, type: 'account' });
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
    } catch (error: any) {
      setUserLoginState({
        status: 'error',
        type: 'account',
      });

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
            await handleSubmit(values as API.LoginParams & { rememberUsername?: boolean });
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
