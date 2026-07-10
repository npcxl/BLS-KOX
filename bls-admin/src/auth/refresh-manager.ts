/**
 * Single Flight Refresh 管理器
 *
 * 硬性要求：
 *   - 同时 N 个接口 401 → 只能有 1 个 /auth/refresh
 *   - 其他 N-1 个等待同一个 Promise
 *   - Refresh 成功后各请求自己重试一次
 *
 * 禁止：
 *   - N 个 401 → N 个 Refresh（会触发 Refresh Rotation Reuse Detection）
 */

import { refreshToken as requestRefreshToken } from '@/services/ant-design-pro/api';
import type { TokenPair } from './auth-types';
import { tokenStore } from './token-store';
import { authEvents } from './auth-events';

let refreshPromise: Promise<TokenPair | null> | null = null;

function doRefresh(): Promise<TokenPair | null> {
  const rt = tokenStore.getRefreshToken();
  if (!rt) {
    return Promise.resolve(null);
  }

  return requestRefreshToken(
    { refreshToken: rt },
    { skipAuthRefresh: true, skipErrorMessage: true },
  )
    .then((res) => {
      const data = res as unknown as { data?: { token?: string; refreshToken?: string } };
      if (!data?.data?.token) return null;
      const pair: TokenPair = {
        accessToken: data.data.token,
        refreshToken: data.data.refreshToken ?? rt,
      };
      tokenStore.setTokenPair(pair);
      authEvents.emit('token-refreshed', pair);
      return pair;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
}

/**
 * Single Flight Refresh：同一时刻只存在一个 Refresh 请求
 */
export async function refreshSession(): Promise<TokenPair | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefresh();
  return refreshPromise;
}

/**
 * 判断 URL 是否应该跳过 Refresh（login / refresh 自身 / public endpoint）
 */
export function isRefreshSkippedUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/system/config/public-') ||
    url.includes('/api/system/tenant/public-')
  );
}
