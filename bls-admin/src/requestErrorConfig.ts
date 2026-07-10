import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { getIntl, request as umiRequest } from '@umijs/max';
import { message, notification, Modal } from 'antd';
import { tokenStore } from '@/auth/token-store';
import { isJwtExpired } from '@/auth/jwt';
import { refreshSession, isRefreshSkippedUrl } from '@/auth/refresh-manager';
import { redirectToLogin } from '@/auth/auth-manager';

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

/**
 * 确保请求携带有效的 Access Token
 *
 * 核心策略：在请求发出前主动检测 Token 是否过期，
 * 如果过期则先刷新再发送，避免 401 竞态导致"第一个表空数据"问题。
 *
 * 此函数用于 requestInterceptors，支持 async。
 */
function attachAuthHeaders(config: RequestOptions): RequestOptions {
  const token = tokenStore.getAccessToken();

  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    };
  }

  // 自动添加防重放请求头
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
}

/**
 * 发送前主动刷新过期 Token（异步拦截器）
 */
async function ensureFreshToken(config: RequestOptions): Promise<RequestOptions> {
  const token = tokenStore.getAccessToken();

  // 没有 Token → 无需刷新
  if (!token) {
    return attachAuthHeaders(config);
  }

  // Token 有效 → 无需刷新
  if (!isJwtExpired(token)) {
    return attachAuthHeaders(config);
  }

  // Token 过期但属于跳过刷新的端点 → 不刷新
  if (isRefreshSkippedUrl(config.url)) {
    return attachAuthHeaders(config);
  }

  // Token 过期 → 先刷新再发送
  const refreshed = await refreshSession();
  if (!refreshed) {
    // 刷新失败 → 仍带旧 Token 发请求，让服务端返回 401，errorHandler 处理
    return attachAuthHeaders(config);
  }

  // 刷新成功 → 用新 Token
  config.headers = {
    ...config.headers,
    Authorization: `Bearer ${refreshed.accessToken}`,
  };

  // 仍添加防重放头
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
      // 调用方明确标记 skipErrorMessage → 不弹错误提示
      const skipMessage =
        opts?.skipErrorHandler === true || opts?.skipErrorMessage === true;

      // HTTP 401 处理（兜底：只有请求拦截器刷新失败或服务端主动吊销时才到这里）
      if (error?.response?.status === 401) {
        const responseCode = error?.response?.data?.code;

        // skipAuthRefresh 标记的请求 → 直接跳登录
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

        // 已 Retry 过 → 不再尝试，跳登录
        if (error?.config?._authRetried) {
          await redirectToLogin();
          return;
        }

        // 尝试 Refresh + Retry（兜底：拦截器刷新失败时才来到这里）
        const originalConfig = error?.config;
        const refreshed = await refreshSession();
        if (!refreshed) {
          await redirectToLogin();
          return;
        }

        // Retry 原请求（最多一次）
        originalConfig._authRetried = true;
        originalConfig.headers = {
          ...originalConfig.headers,
          Authorization: `Bearer ${refreshed.accessToken}`,
        };

        // 删除旧的防重放头，让 umiRequest 重新生成
        delete originalConfig.headers?.['X-Timestamp'];
        delete originalConfig.headers?.['X-Nonce'];
        delete originalConfig.headers?.['X-Signature'];

        const url = originalConfig.url || '';
        const retryConfig: any = {
          method: originalConfig.method || 'GET',
          headers: originalConfig.headers,
          data: originalConfig.data,
          params: originalConfig.params,
          skipAuthRefresh: true,
          skipErrorMessage: true,
          _authRetried: true,
        };

        try {
          const retryResult = await umiRequest(url, retryConfig);
          return retryResult;
        } catch {
          await redirectToLogin();
          return;
        }
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
    // 主动刷新：请求发送前检测 Token 过期并先刷新
    async (config: RequestOptions) => {
      return ensureFreshToken(config);
    },
  ],
  responseInterceptors: [],
};
