/**
 * 登录页测试
 *
 * 覆盖两类场景：
 *   A. 人机验证**未开启**：保持原登录流程（只提交 username/password/type，无 tenantId）
 *   B. 人机验证**已开启**：配置未就绪禁止提交；第一层/第二层拿到凭证后才允许提交；
 *      登录请求必须携带服务端签发的一次性 captchaToken，且失败后本地凭证被清除。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ============ Mocks (hoisted by vitest) ============

const { mockLogin, mockTokenStore, mockUseModel, mockMessage, captchaApi } = vi.hoisted(
  () => ({
    mockLogin: vi.fn(),
    mockTokenStore: {
      setTokenPair: vi.fn(),
      getAccessToken: vi.fn(),
      getRefreshToken: vi.fn(),
      clear: vi.fn(),
      getRememberedUsername: vi.fn(),
      setRememberedUsername: vi.fn(),
      clearRememberedUsername: vi.fn(),
      setCurrentUser: vi.fn(),
    },
    mockUseModel: vi.fn(),
    mockMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    captchaApi: {
      getCaptchaConfig: vi.fn(),
      generateCaptcha: vi.fn(),
      verifyCaptcha: vi.fn(),
      CAPTCHA_CONFIG_URL: '/api/captcha/config',
      CAPTCHA_GENERATE_URL: '/api/captcha/generate',
      CAPTCHA_VERIFY_URL: '/api/captcha/verify',
      CAPTCHA_FIELD_NAME: 'altchaPayload',
      CAPTCHA_ERROR_CODES: [40010, 40011, 40012, 40013, 50301, 50302],
      CAPTCHA_REASON_TEXT: {
        SECONDARY_REQUIRED: '需要完成额外安全验证',
        SOLUTION_INVALID: '人机验证未通过，请重试',
        UPSTREAM_TIMEOUT: '人机验证服务响应超时，请稍后重试',
      },
      secondaryTypeOf: (challenge: Record<string, unknown> | null | undefined) =>
        String(challenge?.type ?? '').toUpperCase().includes('WORD') ? 'clickWord' : 'blockPuzzle',
    },
  }),
);

vi.mock('@/services/ant-design-pro/api', () => ({
  login: mockLogin,
}));

vi.mock('@/auth/token-store', () => ({
  tokenStore: mockTokenStore,
}));

vi.mock('@umijs/max', () => ({
  Helmet: ({ children }: any) => <div data-testid="helmet">{children}</div>,
  SelectLang: () => <div data-testid="select-lang">Lang</div>,
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) => (
    <span>{defaultMessage}</span>
  ),
  useIntl: () => ({
    formatMessage: vi.fn(({ defaultMessage }) => defaultMessage),
  }),
  useModel: mockUseModel,
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    App: {
      useApp: () => ({ message: mockMessage }),
    },
  };
});

vi.mock('antd-style', () => ({
  createStyles: () => () => ({
    styles: {
      lang: 'mock-lang-class',
      container: 'mock-container-class',
    },
  }),
}));

vi.mock('@/components', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

// 第一层组件替身：暴露一个"求解完成"按钮，模拟官方 widget 的 verified 事件
vi.mock('@/components/AltchaCaptcha', () => ({
  default: ({ onVerified, enabled }: any) =>
    enabled ? (
      <button data-testid="altcha-solve" onClick={() => onVerified('altcha-payload-1')}>
        solve
      </button>
    ) : null,
}));

// 第二层组件替身：暴露一个"提交答案"按钮
vi.mock('@/components/TianaiCaptcha', () => ({
  default: ({ onSubmit }: any) => (
    <button data-testid="tianai-submit" onClick={() => onSubmit({ x: 100, y: 40 })}>
      submit-secondary
    </button>
  ),
}));

vi.mock('@/services/auth/captcha', () => captchaApi);

vi.mock('@ant-design/pro-components', () => ({
  LoginForm: ({ children, onFinish, onValuesChange, submitter, formRef }: any) => {
    if (formRef) {
      formRef.current = {
        setFieldsValue: vi.fn(),
        getFieldValue: () => 'testuser',
        getFieldsValue: () => ({}),
      };
    }
    React.useEffect(() => {
      // 模拟用户输入了用户名（challenge 需要带 username）
      onValuesChange?.({ username: 'testuser' });
    }, [onValuesChange]);
    return (
      <div data-testid="login-form">
        <div data-testid="login-submitter">{JSON.stringify(submitter)}</div>
        {children}
        <button
          data-testid="login-submit-btn"
          disabled={submitter?.submitButtonProps?.disabled || false}
          onClick={() => {
            if (!submitter?.submitButtonProps?.disabled) {
              onFinish?.({
                username: 'testuser',
                password: 'testpass',
                rememberUsername: true,
              });
            }
          }}
        >
          {submitter?.searchConfig?.submitText || '登录'}
        </button>
      </div>
    );
  },
  ProFormText: Object.assign(
    ({ name, hidden, placeholder }: any) => {
      if (hidden) {
        return <input data-testid={`form-field-${name}`} type="hidden" />;
      }
      return (
        <div data-testid={`form-field-${name}`}>
          <input data-testid={`input-${name}`} placeholder={placeholder} type="text" />
        </div>
      );
    },
    {
      Password: ({ name, hidden, placeholder }: any) => {
        if (hidden) {
          return <input data-testid={`form-field-${name}`} type="hidden" />;
        }
        return (
          <div data-testid={`form-field-${name}`}>
            <input data-testid={`input-${name}`} placeholder={placeholder} type="password" />
          </div>
        );
      },
    },
  ),
  ProFormCheckbox: ({ name, children }: any) => (
    <label data-testid={`form-field-${name}`}>
      <input type="checkbox" data-testid={`checkbox-${name}`} />
      {children}
    </label>
  ),
  ProFormSelect: ({ name, options }: any) => (
    <select data-testid={`form-field-${name}`}>
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('../../../config/defaultSettings', () => ({
  default: {
    title: 'Test App',
    logo: '/logo.svg',
  },
}));

// ============ Imports ============
import Login from './index';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const CAPTCHA_DISABLED_CONFIG = {
  enabled: false,
  primaryProvider: 'ALTCHA',
  fallbackProvider: 'TIANAI',
  tianaiEnabled: false,
  generateUrl: '/api/captcha/generate',
  verifyUrl: '/api/captcha/verify',
  fieldName: 'altchaPayload',
};

function mockCaptchaConfig(over: Record<string, unknown> = {}) {
  captchaApi.getCaptchaConfig.mockResolvedValue({
    code: 200,
    data: { ...CAPTCHA_DISABLED_CONFIG, ...over },
  });
}

/** 第一层 ALTCHA challenge（官方结构，widget 只要求 parameters + signature） */
const ALTCHA_CHALLENGE = {
  parameters: { algorithm: 'SHA-256', nonce: 'n-1', salt: 's-1', cost: 10, keyLength: 32, keyPrefix: '' },
  signature: 'sig-1',
};

function mockAltchaChallenge() {
  captchaApi.generateCaptcha.mockResolvedValue({
    code: 200,
    data: { provider: 'ALTCHA', challenge: ALTCHA_CHALLENGE, expiresAt: Date.now() + 180_000, fieldName: 'altchaPayload' },
  });
}



/** 功能关闭时：等待按钮可用（配置加载完成后） */
async function waitForSubmitEnabled() {
  await waitFor(() => expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled());
}

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // captchaApi 的默认实现与 Once 队列必须每个用例重置，避免串味
    for (const key of ['getCaptchaConfig', 'generateCaptcha', 'verifyCaptcha'] as const) {
      captchaApi[key].mockReset();
    }
    localStorage.clear();

    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost/user/login',
        origin: 'http://localhost',
        search: '',
        hash: '',
        pathname: '/user/login',
      },
      writable: true,
      configurable: true,
    });

    mockTokenStore.getRememberedUsername.mockReturnValue(null);

    mockUseModel.mockReturnValue({
      initialState: {
        systemMap: {
          'sys.app.name': 'Test App',
          'sys.app.logo': '/logo.svg',
        },
        fetchUserInfo: vi.fn().mockResolvedValue({
          userId: 'U001',
          username: 'testuser',
        }),
      },
      setInitialState: vi.fn((updater) => {
        if (typeof updater === 'function') {
          return updater({});
        }
        return updater;
      }),
    });

    // 默认：人机验证关闭（保持原登录流程）；仍给出第一层 challenge 供需要的用例使用
    mockCaptchaConfig();
    mockAltchaChallenge();
  });

  // ===== A1. 功能关闭：登录请求只提交 username/password/type，不含 tenantId =====
  it('should submit login with only username/password/type (no tenantId)', async () => {
    mockLogin.mockResolvedValue({
      code: 200,
      data: { token: 'access-token', refreshToken: 'refresh-token', user: null },
    });

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        { username: 'testuser', password: 'testpass', type: 'account' },
        expect.anything(),
      );
    });
  });

  // ===== A2. 功能关闭：配置加载完成后按钮可用 =====
  it('should enable the login button once captcha config is loaded (feature off)', async () => {
    render(<Login />);
    await waitForSubmitEnabled();
  });

  // ===== A3. 401 错误 =====
  it('should show error message on 401 without redirecting', async () => {
    const error401 = new Error('Request failed');
    (error401 as any).response = { status: 401, data: { message: '账号或密码错误' } };
    mockLogin.mockRejectedValue(error401);

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockMessage.error).toHaveBeenCalledWith('账号或密码错误');
    });
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  // ===== A4. 登录成功 =====
  it('should save tokens and user info on successful login', async () => {
    mockLogin.mockResolvedValue({
      code: 200,
      data: {
        token: 'access-token-123',
        refreshToken: 'refresh-token-456',
        user: { userId: 'U001', username: 'testuser' },
      },
    });

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockTokenStore.setTokenPair).toHaveBeenCalledWith({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
    });
    await waitFor(() => {
      expect(mockMessage.success).toHaveBeenCalledWith(expect.stringContaining('登录成功'));
    });
  });

  // ===== A5. 记住用户名 =====
  it('should save username when rememberUsername is checked', async () => {
    mockLogin.mockResolvedValue({
      code: 200,
      data: { token: 'access-token', refreshToken: 'refresh-token', user: null },
    });

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockTokenStore.setRememberedUsername).toHaveBeenCalledWith('testuser');
    });
  });

  // ===== A6. 防重复提交 =====
  it('should prevent duplicate submissions', async () => {
    let resolveLogin: any;
    const loginPromise = new Promise((resolve) => { resolveLogin = resolve; });
    mockLogin.mockReturnValue(loginPromise);

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    resolveLogin({ code: 200, data: { token: 'a', refreshToken: 'r', user: null } });

    await waitFor(() => { expect(mockLogin).toHaveBeenCalledTimes(1); }, { timeout: 3000 });
  });

  // ===== A7. 表单字段 =====
  it('should render username, password and rememberUsername fields (no tenantId)', async () => {
    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('form-field-username')).toBeInTheDocument();
      expect(screen.getByTestId('form-field-password')).toBeInTheDocument();
      expect(screen.getByTestId('form-field-rememberUsername')).toBeInTheDocument();
      expect(screen.queryByTestId('form-field-tenantId')).toBeNull();
    });
  });

  // ===== A8. 500 错误提示 =====
  it('should show user-friendly error on catch', async () => {
    const networkError = new Error('Network Error');
    (networkError as any).response = { status: 500, data: { message: '服务器内部错误' } };
    mockLogin.mockRejectedValue(networkError);

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockMessage.error).toHaveBeenCalledWith('服务器内部错误');
    });
  });

  // ===== A9. 无响应体时的兜底提示 =====
  it('should show default error message when no response data', async () => {
    mockLogin.mockRejectedValue(new Error('Unknown Error'));

    render(<Login />);
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockMessage.error).toHaveBeenCalledWith('账号或密码错误');
    });
  });

  // ===== A10. 记住用户名字段 =====
  it('should use rememberUsername as checkbox name', async () => {
    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('form-field-rememberUsername')).toBeInTheDocument();
      expect(screen.getByText('记住用户名')).toBeInTheDocument();
    });
  });

  // ===== B1. 配置未返回 → 禁止提交 =====
  it('[captcha] keeps the login button disabled until config is loaded', async () => {
    captchaApi.getCaptchaConfig.mockReturnValue(new Promise(() => { /* never resolves */ }));

    render(<Login />);
    expect(await screen.findByTestId('login-submit-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('login-submit-btn'));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ===== B2. 配置加载失败 → 禁止提交（不能绕过验证码直接登录） =====
  it('[captcha] blocks login when captcha config fails to load', async () => {
    captchaApi.getCaptchaConfig.mockRejectedValue(new Error('500'));

    render(<Login />);
    await waitFor(() => {
      expect(screen.getByText(/安全校验配置加载失败/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('login-submit-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('login-submit-btn'));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ===== B3. 第一层：拿到凭证后才允许提交，并把 captchaTicket 带上 =====
  it('[captcha] submits with the server-issued captchaTicket after silent verification', async () => {
    mockCaptchaConfig({ enabled: true });
    captchaApi.verifyCaptcha.mockResolvedValue({
      code: 200,
      data: {
        status: 'passed',
        provider: 'ALTCHA',
        captchaTicket: 'server-ticket-1',
        expiresAt: Date.now() + 120_000,
      },
    });
    mockLogin.mockResolvedValue({
      code: 200,
      data: { token: 'at', refreshToken: 'rt', user: null },
    });

    render(<Login />);
    // 静默验证完成前按钮不可用
    await waitFor(() => expect(screen.getByTestId('altcha-solve')).toBeInTheDocument());
    expect(screen.getByTestId('login-submit-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('altcha-solve'));

    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'testuser',
          password: 'testpass',
          type: 'account',
          captchaTicket: 'server-ticket-1',
        }),
        expect.anything(),
      );
    });
    // 登录体里绝不能出现旧契约 captchaToken
    expect(mockLogin.mock.calls[0][0]).not.toHaveProperty('captchaToken');

    // 第一层校验请求只允许提交 payload / username（阶段、凭证由服务端决定）
    const verifyArgs = captchaApi.verifyCaptcha.mock.calls[0][0];
    expect(verifyArgs).toMatchObject({ payload: 'altcha-payload-1', username: 'testuser' });
    expect(Object.keys(verifyArgs).sort()).toEqual(['payload', 'username']);
  });

  // ===== B4. 服务端风控要求第二层：带 grant 取 challenge，第二层通过后才能提交 =====
  it('[captcha] requires the secondary (Tianai) step with the server-issued escalation grant', async () => {
    mockCaptchaConfig({ enabled: true, tianaiEnabled: true });
    captchaApi.verifyCaptcha
      .mockResolvedValueOnce({
        code: 200,
        data: {
          status: 'failed',
          provider: 'ALTCHA',
          reason: 'SECONDARY_REQUIRED',
          requireFallback: true,
          nextProvider: 'TIANAI',
          escalationGrant: 'grant-1',
        },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: { status: 'passed', provider: 'TIANAI', captchaTicket: 'server-ticket-2', expiresAt: Date.now() + 120_000 },
      });
    // 第一次生成用于第一层 ALTCHA challenge，第二次才是第二层 Tianai challenge
    captchaApi.generateCaptcha
      .mockResolvedValueOnce({
        code: 200,
        data: { provider: 'ALTCHA', challenge: ALTCHA_CHALLENGE, expiresAt: Date.now() + 180_000, fieldName: 'altchaPayload' },
      })
      .mockResolvedValueOnce({
        code: 200,
        data: {
          provider: 'TIANAI',
          sessionId: 's-1',
          challenge: { type: 'SLIDER', backgroundImageWidth: 600, backgroundImageHeight: 300 },
          expiresAt: Date.now() + 180_000,
        },
      });
    mockLogin.mockResolvedValue({ code: 200, data: { token: 'at', refreshToken: 'rt', user: null } });

    render(<Login />);
    await waitFor(() => expect(screen.getByTestId('altcha-solve')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('altcha-solve'));

    await waitFor(() => expect(screen.getByTestId('tianai-submit')).toBeInTheDocument());
    expect(screen.getByTestId('login-submit-btn')).toBeDisabled();
    // 第二层生成必须携带服务端下发的升级凭证
    expect(captchaApi.generateCaptcha).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'TIANAI', escalationGrant: 'grant-1' }),
    );

    fireEvent.click(screen.getByTestId('tianai-submit'));
    await waitForSubmitEnabled();
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({ captchaTicket: 'server-ticket-2' }),
        expect.anything(),
      );
    });
  });

  // ===== B5. 登录被验证码拒绝（40010）→ 提示 + 清除本地凭证，不自动重发 =====
  it('[captcha] clears the local ticket and does not auto-resubmit when login is rejected by captcha', async () => {
    mockCaptchaConfig({ enabled: true });
    captchaApi.verifyCaptcha.mockResolvedValue({
      code: 200,
      data: { status: 'passed', provider: 'ALTCHA', captchaTicket: 'server-ticket-3', expiresAt: Date.now() + 120_000 },
    });
    const captchaError = new Error('captcha required');
    (captchaError as any).response = { status: 400, data: { code: 40010, message: '请先完成人机验证' } };
    mockLogin.mockRejectedValue(captchaError);

    render(<Login />);
    await waitFor(() => expect(screen.getByTestId('altcha-solve')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('altcha-solve'));
    await waitForSubmitEnabled();

    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(mockMessage.warning).toHaveBeenCalledWith('请先完成人机验证');
    });
    // 只提交了一次（绝不自动补发）
    expect(mockLogin).toHaveBeenCalledTimes(1);
    // 一次性凭证已被服务端消费 → 本地必须失效，需要重新验证
    await waitFor(() => expect(screen.getByTestId('login-submit-btn')).toBeDisabled());
  });

  // ===== B6. 密码错误（401）→ 绝不自动重放口令 =====
  it('[captcha] never replays the password automatically after a 401', async () => {
    mockCaptchaConfig({ enabled: true });
    captchaApi.verifyCaptcha.mockResolvedValue({
      code: 200,
      data: { status: 'passed', provider: 'ALTCHA', captchaTicket: 'server-ticket-4', expiresAt: Date.now() + 120_000 },
    });
    const error401 = new Error('unauthorized');
    (error401 as any).response = { status: 401, data: { code: 401, message: '用户名或密码错误' } };
    mockLogin.mockRejectedValue(error401);

    render(<Login />);
    await waitFor(() => expect(screen.getByTestId('altcha-solve')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('altcha-solve'));
    await waitForSubmitEnabled();

    fireEvent.click(screen.getByTestId('login-submit-btn'));
    await waitFor(() => expect(mockMessage.error).toHaveBeenCalledWith('用户名或密码错误'));

    // 给足时间：即使触发 refreshPolicy 也绝不能自动再发一次登录
    await new Promise((r) => setTimeout(r, 800));
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });
});
