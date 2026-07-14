/**
 * 统一状态存储
 *
 * 禁止直接 localStorage.setItem / getItem，
 * 所有持久化状态读写必须经过此模块。
 *
 * 分层：
 *   - 服务端状态（currentUser）：通过 initialState 同步，localStorage 仅作持久化缓存
 *   - 客户端状态（token、rememberUsername）：纯 localStorage
 */

import type { TokenPair } from './auth-types';

const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refreshToken';
const CURRENT_USER_KEY = 'currentUser';
const LAST_TENANT_KEY = 'lastTenantId';
const REMEMBER_USERNAME_KEY = 'rememberLoginUsername';

// ============ Token ============

export const tokenStore = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },

  setTokenPair(pair: TokenPair): void {
    localStorage.setItem(ACCESS_KEY, pair.accessToken);
    localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  },

  // ============ Current User ============

  getCurrentUser<T = Record<string, unknown>>(): T | null {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: Record<string, unknown>): void {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  },

  // ============ 租户 ============

  getLastTenantId(): string | null {
    return localStorage.getItem(LAST_TENANT_KEY);
  },

  setLastTenantId(tenantId: string): void {
    localStorage.setItem(LAST_TENANT_KEY, tenantId);
  },

  // ============ 记住用户名 ============

  getRememberedUsername(): string | null {
    return localStorage.getItem(REMEMBER_USERNAME_KEY);
  },

  setRememberedUsername(username: string): void {
    localStorage.setItem(REMEMBER_USERNAME_KEY, username);
  },

  clearRememberedUsername(): void {
    localStorage.removeItem(REMEMBER_USERNAME_KEY);
  },

  // ============ 清理 ============

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(LAST_TENANT_KEY);
    localStorage.removeItem(REMEMBER_USERNAME_KEY);
  },
};
