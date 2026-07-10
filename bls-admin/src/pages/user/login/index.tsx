import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, Helmet, SelectLang, useIntl, useModel } from '@umijs/max';
import { Alert, App } from 'antd';
import { createStyles } from 'antd-style';
import React, { startTransition, useEffect, useRef, useState } from 'react';
import { Footer } from '@/components';
import { login, tenantLoginOptions } from '@/services/ant-design-pro/api';
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
    backgroundImage:
      "url('https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/V-_oS6r-i7wAAAAAAAAAAAAAFl94AQBr')",
    backgroundSize: '100% 100%',
  },
}));

const Lang = () => {
  const { styles } = useStyles();
  return <div className={styles.lang} data-lang>{SelectLang && <SelectLang />}</div>;
};

const LoginMessage: React.FC<{ content: string }> = ({ content }) => (
  <Alert style={{ marginBottom: 24 }} title={content} type="error" showIcon />
);

const Login: React.FC = () => {
  const [userLoginState, setUserLoginState] = useState<API.LoginResult>({});
  const [tenantOptions, setTenantOptions] = useState<API.TenantOption[]>([]);
  const [defaultTenantId, setDefaultTenantId] = useState<string | undefined>(undefined);
  const formRef = useRef<any>(null);
  const rememberPasswordKey = 'rememberLoginCredentials';
  const usernameKey = 'rememberLoginUsername';
  const passwordKey = 'rememberLoginPassword';
  const { initialState, setInitialState } = useModel('@@initialState');
  const { styles } = useStyles();
  const { message } = App.useApp();
  const intl = useIntl();
  const appName = initialState?.systemMap?.['sys.app.name'] ?? Settings.title ?? 'title-default';
  const appLogo = initialState?.systemMap?.['sys.app.logo'] ?? Settings.logo;

  useEffect(() => {
    let cancelled = false;

    const loadTenantOptions = async () => {
      try {
        const res = await tenantLoginOptions();
        if (cancelled) return;
        const list = res.data ?? [];
        setTenantOptions(list);
        const savedTenantId = localStorage.getItem('lastTenantId') ?? undefined;
        const firstTenantId = list.find((item) => item.tenantId === savedTenantId)?.tenantId ?? list[0]?.tenantId;
        setDefaultTenantId(firstTenantId);
        const rememberPassword = localStorage.getItem(rememberPasswordKey) === 'true';
        const rememberedUsername = localStorage.getItem(usernameKey) ?? undefined;
        const rememberedPassword = rememberPassword ? (localStorage.getItem(passwordKey) ?? undefined) : undefined;
        if (firstTenantId !== undefined) {
          formRef.current?.setFieldsValue({
            tenantId: firstTenantId,
            username: rememberedUsername,
            password: rememberedPassword,
            rememberPassword,
          });
        }
      } catch {
        if (cancelled) return;
        setTenantOptions([]);
        setDefaultTenantId(undefined);
      }
    };

    void loadTenantOptions();

    return () => {
      cancelled = true;
    };
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

  const handleSubmit = async (values: API.LoginParams & { rememberPassword?: boolean }) => {
    try {
      const res = await login({ ...values, type: 'account' });
      const msg = res.data;
      if (res.code === 200 && msg?.token) {
        tokenStore.setTokenPair({
          accessToken: msg.token,
          refreshToken: msg.refreshToken ?? '',
        });
        if (msg.user) {
          localStorage.setItem('currentUser', JSON.stringify(msg.user));
        }
        const tenantId = values.tenantId;
        if (tenantId !== undefined) {
          localStorage.setItem('lastTenantId', String(tenantId));
        }
        if (values.rememberPassword) {
          localStorage.setItem(rememberPasswordKey, 'true');
          if (values.username) {
            localStorage.setItem(usernameKey, values.username);
          }
          if (values.password) {
            localStorage.setItem(passwordKey, values.password);
          }
        } else {
          localStorage.removeItem(rememberPasswordKey);
          localStorage.removeItem(usernameKey);
          localStorage.removeItem(passwordKey);
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
    } catch (error) {
      console.log(error);
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
          initialValues={{ autoLogin: true, tenantId: defaultTenantId, rememberPassword: false }}
          onFinish={async (values) => {
            await handleSubmit(values as API.LoginParams & { rememberPassword?: boolean });
          }}
        >
          {status === 'error' && loginType === 'account' && (
            <LoginMessage
              content={intl.formatMessage({
                id: 'pages.login.accountLogin.errorMessage',
                defaultMessage: '账户或密码错误(admin/123456)',
              })}
            />
          )}

          {process.env.NODE_ENV === 'development' && (
            <ProFormSelect
              name="tenantId"
              fieldProps={{ size: 'large' }}
              placeholder="请选择租户"
              options={tenantOptions.map((item) => ({
                label: item.tenantName,
                value: item.tenantId,
              }))}
              rules={[{ required: true, message: '请选择租户' }]}
            />
          )}

          <ProFormText
            name="username"
            fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
            placeholder={intl.formatMessage({
              id: 'pages.login.username.placeholder',
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
              id: 'pages.login.password.placeholder',
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
            <ProFormCheckbox name="rememberPassword" noStyle>
              记住密码
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
