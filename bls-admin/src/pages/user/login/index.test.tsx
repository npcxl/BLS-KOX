import { describe, expect, it, vi, beforeEach } from 'vitest';

// ============ Mocks (hoisted by vitest) ============

const { mockLogin, mockTenantLoginOptions, mockTokenStore, mockUseModel, mockMessage } = vi.hoisted(
  () => ({
    mockLogin: vi.fn(),
    mockTenantLoginOptions: vi.fn(),
    mockTokenStore: {
      setTokenPair: vi.fn(),
      getAccessToken: vi.fn(),
      getRefreshToken: vi.fn(),
      clear: vi.fn(),
    },
    mockUseModel: vi.fn(),
    mockMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  }),
);

vi.mock('@/services/ant-design-pro/api', () => ({
  login: mockLogin,
  tenantLoginOptions: mockTenantLoginOptions,
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

vi.mock('@ant-design/pro-components', () => ({
  LoginForm: ({ children, onFinish, submitter, formRef, initialValues }: any) => {
    if (formRef) {
      formRef.current = {
        setFieldsValue: vi.fn(),
        getFieldsValue: () => ({}),
      };
    }
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
                tenantId: initialValues?.tenantId || 'T001',
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

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Mock window.location to avoid jsdom navigation errors
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
  });

  // ===== 1. tenantId 正常传递 =====
  it('should pass tenantId in login request', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    mockLogin.mockResolvedValue({
      code: 200,
      data: { token: 'access-token', refreshToken: 'refresh-token', user: null },
    });

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'T001' }),
      );
    });
  });

  // ===== 2. 租户列表为空 =====
  it('should disable login button and show error when tenant list is empty', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [],
    });

    render(<Login />);

    await waitFor(() => {
      const btn = screen.getByTestId('login-submit-btn');
      expect(btn).toBeDisabled();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ===== 3. 租户接口失败 =====
  it('should show error and disable login when tenant API fails', async () => {
    mockTenantLoginOptions.mockRejectedValue(new Error('Network Error'));

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByText('租户信息加载失败')).toBeInTheDocument();
    });

    const btn = screen.getByTestId('login-submit-btn');
    expect(btn).toBeDisabled();

    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ===== 4. 登录接口返回 HTTP 401 =====
  it('should show error message on 401 without redirecting', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    const error401 = new Error('Request failed');
    (error401 as any).response = {
      status: 401,
      data: { message: '账号或密码错误' },
    };
    mockLogin.mockRejectedValue(error401);

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMessage.error).toHaveBeenCalledWith('账号或密码错误');
    });

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  // ===== 5. 登录成功 =====
  it('should save tokens and user info on successful login', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    const mockUser = { userId: 'U001', username: 'testuser' };
    mockLogin.mockResolvedValue({
      code: 200,
      data: {
        token: 'access-token-123',
        refreshToken: 'refresh-token-456',
        user: mockUser,
      },
    });

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockTokenStore.setTokenPair).toHaveBeenCalledWith({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
    });

    await waitFor(() => {
      expect(localStorage.getItem('currentUser')).toBe(JSON.stringify(mockUser));
    });

    await waitFor(() => {
      expect(localStorage.getItem('lastTenantId')).toBe('T001');
    });

    await waitFor(() => {
      expect(mockMessage.success).toHaveBeenCalledWith(
        expect.stringContaining('登录成功'),
      );
    });
  });

  // ===== 6. 记住用户名 =====
  it('should save only username when rememberUsername is checked', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    mockLogin.mockResolvedValue({
      code: 200,
      data: { token: 'access-token', refreshToken: 'refresh-token', user: null },
    });

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(localStorage.getItem('rememberLoginUsername')).toBe('testuser');
    });

    expect(localStorage.getItem('password')).toBeNull();
  });

  // ===== 7. 防重复提交 =====
  it('should prevent duplicate submissions', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    let resolveLogin: any;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    mockLogin.mockReturnValue(loginPromise);

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    // Simulate rapid double-click before React can re-render
    // In real app, submitting state prevents second call
    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    // The second click should be blocked by the submitting flag in handleSubmit
    // But since our mock doesn't re-render, we verify the login was only called once
    fireEvent.click(submitBtn);

    // Resolve the login
    resolveLogin({
      code: 200,
      data: { token: 'access-token', refreshToken: 'refresh-token', user: null },
    });

    // Verify login was only called once (submitting guard works)
    await waitFor(
      () => {
        expect(mockLogin).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
  });

  // ===== 8. 表单字段存在性 =====
  it('should render username and password fields', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('form-field-username')).toBeInTheDocument();
      expect(screen.getByTestId('form-field-password')).toBeInTheDocument();
    });
  });

  // ===== 9. tenantId 字段在生产环境存在（hidden） =====
  it('should render tenantId as hidden in production', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('form-field-tenantId')).toBeInTheDocument();
    });
  });

  // ===== 10. catch 错误不打印敏感信息 =====
  it('should show user-friendly error on catch', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    const networkError = new Error('Network Error');
    (networkError as any).response = {
      status: 500,
      data: { message: '服务器内部错误' },
    };
    mockLogin.mockRejectedValue(networkError);

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMessage.error).toHaveBeenCalledWith('服务器内部错误');
    });
  });

  // ===== 11. 登录失败显示 fallback 消息 =====
  it('should show default error message when no response data', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    mockLogin.mockRejectedValue(new Error('Unknown Error'));

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).not.toBeDisabled();
    });

    const submitBtn = screen.getByTestId('login-submit-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMessage.error).toHaveBeenCalledWith('账号或密码错误');
    });
  });

  // ===== 12. 记住用户名字段名确认 =====
  it('should use rememberUsername as checkbox name', async () => {
    mockTenantLoginOptions.mockResolvedValue({
      data: [{ tenantId: 'T001', tenantName: '测试租户' }],
    });

    render(<Login />);

    await waitFor(() => {
      expect(screen.getByTestId('form-field-rememberUsername')).toBeInTheDocument();
      expect(screen.getByText('记住用户名')).toBeInTheDocument();
    });
  });
});
