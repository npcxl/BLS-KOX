/**
 * Token 定时主动刷新
 *
 * 每 60 秒检测一次，如果 Access Token 将在 120 秒内过期，
 * 则提前调用 refreshSession() 刷新，避免用户操作时遇到 401。
 *
 * 这确保"长时间不操作后点击表格"场景下 Token 始终有效，
 * 不会出现"第一个表空数据"的问题。
 */

import { useEffect, useRef } from 'react';
import { tokenStore } from '@/auth/token-store';
import { getJwtExp } from '@/auth/jwt';
import { refreshSession } from '@/auth/refresh-manager';

/** Token 过期提前刷新的缓冲时间（秒） */
const REFRESH_BUFFER_SECONDS = 120;
/** 检测间隔（毫秒） */
const CHECK_INTERVAL_MS = 60_000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function checkAndRefresh() {
  const token = tokenStore.getAccessToken();
  if (!token) return;

  const exp = getJwtExp(token);
  if (!exp) return;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const remaining = exp - nowSeconds;

  // Token 在缓冲时间内过期 → 主动刷新
  if (remaining <= REFRESH_BUFFER_SECONDS) {
    refreshSession().catch(() => {});
  }
}

export function TokenRefreshGuard({ children }: { children: React.ReactNode }) {
  const startedRef = useRef(false);

  useEffect(() => {
    // 防止 StrictMode 双调用导致多个定时器
    if (startedRef.current) return;
    startedRef.current = true;

    // 立即检测一次
    checkAndRefresh();

    // 启动定时器
    refreshTimer = setInterval(checkAndRefresh, CHECK_INTERVAL_MS);

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      startedRef.current = false;
    };
  }, []);

  return <>{children}</>;
}
