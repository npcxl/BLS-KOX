import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { getIntl, request as umiRequest } from '@umijs/max';
import { message, notification, Modal } from 'antd';
import { tokenStore } from '@/auth/token-store';
import { handleAuthError, redirectToLogin } from '@/auth/auth-manager';
import { isRefreshSkippedUrl } from '@/auth/refresh-manager';

// 错误处理方案：错误类型
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
      // 调用方明确标记 skipErrorMessage → 不弹错误提示，但仍走 Refresh 流程
      const skipMessage =
        opts?.skipErrorHandler === true || opts?.skipErrorMessage === true;

      // HTTP 401 处理
      if (error?.response?.status === 401) {
        const responseCode = error?.response?.data?.code;

        // Refresh 相关的 401（skipAuthRefresh 标记的请求）→ 直接跳登录
        if (opts?.skipAuthRefresh || isRefreshSkippedUrl(error?.config?.url)) {
          await redirectToLogin();
          return;
        }

        // 会话失效（后端明确返回 40101）
        if (responseCode === 40101) {
          Modal.confirm({
            title: '当前会话已失效',
            content: '请重新登录',
            onOk: async () => {
              await redirectToLogin();
            },
          });
          return;
        }

        // 尝试 Refresh + Retry
        const originalConfig = error?.config;
        const retryResult = await handleAuthError(
          originalConfig,
          async (config) => {
            const url = config.url || '';
            const retryConfig: any = {
              method: config.method || 'GET',
              headers: config.headers,
              data: config.data,
              params: config.params,
              skipAuthRefresh: true,
              skipErrorMessage: true,
              _authRetried: true,
            };
            return umiRequest(url, retryConfig);
          },
        );

        if (retryResult !== undefined) {
          return retryResult;
        }

        // Refresh 失败 → 跳登录
        await redirectToLogin();
        return;
      }

      // 如果调用方不想要错误提示，到此结束
      if (skipMessage) return;

      // 业务错误
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
        message.error(
          responseData?.message ||
            responseData?.errmsg ||
            `Response status:${error.response.status}`,
        );
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        message.error(
          getIntl().formatMessage({
            id: 'app.request.offline',
            defaultMessage:
              'Network unavailable. Please check your connection and try again.',
          }),
        );
      } else if (error.request) {
        message.error('None response! Please retry.');
      } else {
        message.error('Request error, please retry.');
      }
    },
  },
  requestInterceptors: [
    (config: RequestOptions) => {
      const token = tokenStore.getAccessToken();
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        };
      }
      // 自动添加防重放请求头（Retry 时使用旧 headers 但这里会被覆盖）
      if (config.url) {
        const ts = String(Date.now());
        const nonce =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID().replace(/-/g, '')
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
        config.headers = {
          ...config.headers,
          'X-Timestamp': ts,
          'X-Nonce': nonce,
        };
      }
      return config;
    },
  ],
  responseInterceptors: [],
};
