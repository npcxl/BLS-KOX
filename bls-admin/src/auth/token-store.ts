/**
 * 统一 Token 存储
 *
 * 禁止直接 localStorage.getItem / setItem('token') / ('refreshToken')，
 * 所有 Token 读写必须经过 TokenStore。
 */

import type { TokenPair } from './auth-types';

const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refreshToken';

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

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('currentUser');
  },
};
