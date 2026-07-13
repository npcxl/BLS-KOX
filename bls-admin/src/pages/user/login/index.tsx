import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, Helmet, SelectLang, useIntl, useModel } from '@umijs/max';
import { Alert, App, Avatar } from 'antd';
import React, { startTransition, useEffect, useRef, useState } from 'react';
import { Footer } from '@/components';
import { login, tenantLoginOptions } from '@/services/ant-design-pro/api';
import { tokenStore } from '@/auth/token-store';
import Settings from '../../../../config/defaultSettings';

const Lang = () => {
  return (
    <div
      className="fixed right-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 shadow-lg shadow-slate-900/10 backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-slate-50"
      data-lang
    >
      {SelectLang && <SelectLang />}
    </div>
  );
};

const LoginMessage: React.FC<{ content: string }> = ({ content }) => (
  <Alert style={{ marginBottom: 24 }} title={content} type="error" showIcon />
);

const Login: React.FC = () => {
  const [userLoginState, setUserLoginState] = useState<API.LoginResult>({});
  const [tenantOptions, setTenantOptions] = useState<API.TenantOption[]>([]);
  const [defaultTenantId, setDefaultTenantId] = useState<string | undefined>(undefined);
  const formRef = useRef<any>(null);
  const rememberUsernameKey = 'rememberLoginUsername';
  const { initialState, setInitialState } = useModel('@@initialState');
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
        // 仅记住用户名，不存储密码（安全考量）
        const rememberedUsername = localStorage.getItem(rememberUsernameKey) ?? undefined;
        if (firstTenantId !== undefined) {
          formRef.current?.setFieldsValue({
            tenantId: firstTenantId,
            username: rememberedUsername,
            rememberPassword: !!rememberedUsername,
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
          if (values.username) {
            localStorage.setItem(rememberUsernameKey, values.username);
          }
        } else {
          localStorage.removeItem(rememberUsernameKey);
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.16),transparent_28%),radial-gradient(circle_at_right_center,rgba(59,130,246,0.14),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#edf4ff_100%)]">
      <Helmet>
        <title>
          {intl.formatMessage({ id: 'menu.login', defaultMessage: '登录页' })}
          {appName && ` - ${appName}`}
        </title>
      </Helmet>
      <div className="pointer-events-none absolute inset-0 bg-[url('https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/V-_oS6r-i7wAAAAAAAAAAAAAFl94AQBr')] bg-cover bg-center opacity-[0.06]" />
      <Lang />

      <main className="relative z-10 grid flex-1 place-items-center px-4 py-12">
        <div className="grid w-full max-w-[1120px] overflow-hidden rounded-[28px] border border-white/70 bg-white/75 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative hidden min-h-[640px] overflow-hidden bg-[linear-gradient(135deg,rgba(24,144,255,0.98)_0%,rgba(17,76,160,0.98)_100%)] px-14 py-14 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -bottom-24 -right-12 h-64 w-64 rounded-full bg-white/10 blur-[2px]" />
            <div className="absolute right-8 top-8 h-40 w-40 rounded-full border border-white/10" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                {appLogo ? (
                  <img src={appLogo} alt={appName} className="h-full w-full object-cover" />
                ) : (
                  <Avatar size={56} className="bg-white/15 text-white">
                    {appName?.slice(0, 1)?.toUpperCase() ?? 'B'}
                  </Avatar>
                )}
              </div>
              <div className="flex min-w-0 flex-col justify-center">
                <h1 className="m-0 text-[32px] font-bold leading-tight">{appName}</h1>
                <div className="mt-2 max-w-[340px] text-[15px] leading-8 text-white/85">
                  {intl.formatMessage({ id: 'pages.layouts.userLayout.title' })}
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-10 grid gap-4 text-[14px] text-white/92">
              {[
                '开源透明，方便你快速了解和二次开发',
                '统一的视觉层级，适配桌面端与移动端',
                '登录更聚焦，减少干扰，提升品牌感',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/90" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col justify-center bg-white/92 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-sky-50 text-sky-600 shadow-sm">
                {appLogo ? (
                  <img src={appLogo} alt={appName} className="h-full w-full object-cover" />
                ) : (
                  <Avatar size={56} className="bg-sky-50 text-sky-600">
                    {appName?.slice(0, 1)?.toUpperCase() ?? 'B'}
                  </Avatar>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="m-0 text-2xl font-bold leading-tight text-slate-900">{appName}</h1>
                <div className="mt-1 text-sm text-slate-500">
                  {intl.formatMessage({ id: 'pages.layouts.userLayout.title' })}
                </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[460px]">
              <div className="mb-7">
                <h2 className="m-0 text-[28px] font-semibold leading-tight text-slate-900">欢迎回来</h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">请输入你的账号信息，继续进入系统。</p>
              </div>

              <LoginForm
                formRef={formRef}
                contentStyle={{ minWidth: 280, maxWidth: 460, width: '100%' }}
                logo={undefined}
                title={undefined}
                subTitle={undefined}
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
                      message: <FormattedMessage id="pages.login.username.required" defaultMessage="请输入用户名!" />,
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
                      message: <FormattedMessage id="pages.login.password.required" defaultMessage="请输入密码！" />,
                    },
                  ]}
                />

                <div className="mb-6 flex items-center justify-between gap-4 text-sm">
                  <ProFormCheckbox name="rememberPassword" noStyle>
                    记住用户名
                  </ProFormCheckbox>
                  <a href="#" onClick={(e) => e.preventDefault()} className="text-sky-600 hover:text-sky-500">
                    <FormattedMessage id="pages.login.forgotPassword" defaultMessage="忘记密码" />
                  </a>
                </div>
              </LoginForm>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Login;
