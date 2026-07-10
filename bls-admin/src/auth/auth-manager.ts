/**
 * 统一认证管理器
 *
 * 职责：
 *   - ensureValidSession: 应用启动时恢复 Session
 *   - handleAuthError:    处理请求层 401（Refresh + Retry）
 *   - resetSession:       统一清理所有登录态缓存
 *   - redirectToLogin:    跳转登录页
 */

import type { AuthState } from './auth-types';
import { tokenStore } from './token-store';
import { isJwtExpired } from './jwt';
import { refreshSession, isRefreshSkippedUrl } from './refresh-manager';
import { authEvents } from './auth-events';
import { clearDictCache } from '@/services/system/dict';

let loginPath = '/user/login';

export function setLoginPath(path: string): void {
  loginPath = path;
}

/**
 * 应用启动：确保 Session 有效
 *
 * @returns 'valid' | 'anonymous' | 'expired'
 */
export async function ensureValidSession(): Promise<AuthState> {
  const accessToken = tokenStore.getAccessToken();
  const refreshToken = tokenStore.getRefreshToken();

  // 没有任何 Token → 匿名
  if (!accessToken && !refreshToken) {
    return 'anonymous';
  }

  // Access Token 有效 → 直接通过
  if (accessToken && !isJwtExpired(accessToken)) {
    return 'valid';
  }

  // Access Token 过期但没有 Refresh Token → 上报已过期
  if (!refreshToken) {
    return 'expired';
  }

  // 尝试刷新
  const refreshed = await refreshSession();
  return refreshed ? 'valid' : 'expired';
}

/**
 * 请求层 401 处理：Refresh + Retry
 *
 * @param originalRequest - 原始请求配置（axios/umi 风格）
 * @returns 如果 Refresh 成功并 Retry，返回新的 response；否则返回 undefined
 */
export async function handleAuthError(
  originalConfig: any,
  requestFn?: (config: any) => Promise<any>,
): Promise<any | undefined> {
  // 已 Retry 过 → 不再尝试
  if (originalConfig?._authRetried) {
    return undefined;
  }

  // login / refresh / public → 不刷新
  if (isRefreshSkippedUrl(originalConfig?.url)) {
    return undefined;
  }

  // 明确标记 skipAuthRefresh → 不刷新
  if (originalConfig?.skipAuthRefresh) {
    return undefined;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    return undefined;
  }

  // Retry 原请求（最多一次）
  originalConfig._authRetried = true;

  // 更新 Authorization header
  const token = refreshed.accessToken;
  originalConfig.headers = {
    ...originalConfig.headers,
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  };

  // 删除旧的防重放头，让 request interceptor 重新生成
  delete originalConfig.headers?.['X-Timestamp'];
  delete originalConfig.headers?.['X-Nonce'];
  delete originalConfig.headers?.['X-Signature'];

  if (requestFn) {
    return requestFn(originalConfig);
  }
  return undefined;
}

/**
 * 统一清理登录态
 */
export function resetSession(): void {
  tokenStore.clear();
  clearDictCache();
  authEvents.emit('logout');
}

/**
 * 跳转登录页
 */
export function redirectToLogin(): void {
  resetSession();
  const { pathname, search, hash } = window.location;
  const encoded = encodeURIComponent(pathname + search + hash);
  window.location.href = `${loginPath}?redirect=${encoded}`;
}
