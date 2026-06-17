import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { getIntl, request as umiRequest } from '@umijs/max';
import { message, notification, Modal } from 'antd';
import { refreshToken as requestRefreshToken, outLogin } from '@/services/ant-design-pro/api';

// 错误处理方案： 错误类型
enum ErrorShowType {
  SILENT = 0,
  WARN_MESSAGE = 1,
  ERROR_MESSAGE = 2,
  NOTIFICATION = 3,
  REDIRECT = 9,
}
// 与后端约定的响应数据格式
interface ResponseStructure {
  success: boolean;
  data: unknown;
  errorCode?: number;
  errorMessage?: string;
  showType?: ErrorShowType;
}

let refreshingPromise: Promise<string | null> | null = null;

function isRefreshableRequest(url?: string): boolean {
  return !!url && !url.includes('/auth/login') && !url.includes('/auth/refresh');
}

function isRetriedRequest(config: any): boolean {
  return Boolean(config?._retryAfterRefresh);
}

async function refreshAccessToken() {
  const rt = localStorage.getItem('refreshToken');
  if (!rt) return null;
  if (!refreshingPromise) {
    refreshingPromise = requestRefreshToken({ refreshToken: rt })
      .then((res) => {
        const data = res as unknown as { data?: { token?: string; refreshToken?: string } };
        if (!data?.data?.token) return null;
        localStorage.setItem('token', data.data.token);
        if (data.data.refreshToken) localStorage.setItem('refreshToken', data.data.refreshToken);
        return data.data.token;
      })
      .catch(() => null)
      .finally(() => {
        refreshingPromise = null;
      });
  }
  return refreshingPromise;
}

async function logoutAndRedirect() {
  try {
    await outLogin({ skipErrorHandler: true });
  } catch {}
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('currentUser');
  window.location.href = '/user/login';
}

export const errorConfig: RequestConfig = {
  errorConfig: {
    errorThrower: (res) => {
      const { success, data, errorCode, errorMessage, showType } =
        res as unknown as ResponseStructure;
      if (!success) {
        const error: any = new Error(errorMessage);
        error.name = 'BizError';
        error.info = { errorCode, errorMessage, showType, data };
        throw error;
      }
    },
    errorHandler: async (error: any, opts: any) => {
      if (opts?.skipErrorHandler) throw error;
      if (error?.response?.status === 401) {
        const responseCode = error?.response?.data?.code;
        if (responseCode === 40101) {
          Modal.confirm({
            title: '该账号在别处登录',
            content: '请检查是否泄漏密码，重新登录',
            onOk: async () => {
              await logoutAndRedirect();
            },
          });
          return;
        }
        const originalConfig = error?.config;
        if (isRetriedRequest(originalConfig)) {
          await logoutAndRedirect();
          return;
        }
        const token = await refreshAccessToken();
        if (token) {
          if (originalConfig?.url && isRefreshableRequest(originalConfig.url)) {
            originalConfig._retryAfterRefresh = true;
            originalConfig.headers = {
              ...originalConfig.headers,
              Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            };
            return umiRequest(originalConfig);
          }
          return;
        }
        await logoutAndRedirect();
        return;
      }
      if (error.name === 'BizError') {
        const errorInfo: ResponseStructure | undefined = error.info;
        if (errorInfo) {
          const { errorMessage, errorCode } = errorInfo;
          switch (errorInfo.showType) {
            case ErrorShowType.SILENT:
              break;
            case ErrorShowType.WARN_MESSAGE:
              message.warning(errorMessage);
              break;
            case ErrorShowType.ERROR_MESSAGE:
              message.error(errorMessage);
              break;
            case ErrorShowType.NOTIFICATION:
              notification.open({ title: errorCode, description: errorMessage });
              break;
            case ErrorShowType.REDIRECT:
              window.location.href = '/user/login';
              break;
            default:
              message.error(errorMessage);
          }
        }
      } else if (error.response) {
        const responseData = error.response.data as
          | { message?: string; code?: number; errmsg?: string }
          | undefined;
        message.error(responseData?.message || responseData?.errmsg || `Response status:${error.response.status}`);
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        message.error(getIntl().formatMessage({
          id: 'app.request.offline',
          defaultMessage: 'Network unavailable. Please check your connection and try again.',
        }));
      } else if (error.request) {
        message.error('None response! Please retry.');
      } else {
        message.error('Request error, please retry.');
      }
    },
  },
  requestInterceptors: [
    (config: RequestOptions) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        };
      }
      return config;
    },
  ],
  responseInterceptors: [],
};
