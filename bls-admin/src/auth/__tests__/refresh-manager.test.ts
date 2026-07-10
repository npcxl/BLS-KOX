/**
 * Refresh Manager 测试：验证 Single Flight Refresh 行为
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
});

// Mock refresh API
let refreshCallCount = 0;
vi.mock('@/services/ant-design-pro/api', () => ({
  refreshToken: vi.fn().mockImplementation(() => {
    refreshCallCount++;
    return Promise.resolve({
      data: {
        token: `new-at-${refreshCallCount}`,
        refreshToken: `new-rt-${refreshCallCount}`,
      },
    });
  }),
}));

// Mock dict cache
vi.mock('@/services/system/dict', () => ({
  clearDictCache: vi.fn(),
}));

const { refreshSession, isRefreshSkippedUrl } = await import('@/auth/refresh-manager');
const { tokenStore } = await import('@/auth/token-store');

describe('refreshSession - Single Flight', () => {
  beforeEach(() => {
    refreshCallCount = 0;
    // 清除模块级 refreshPromise 状态
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
  });
  it('only sends 1 refresh request when called concurrently', async () => {
    // 设置 refresh token
    tokenStore.setTokenPair({
      accessToken: 'expired-at',
      refreshToken: 'rt-valid',
    });

    refreshCallCount = 0;

    // 同时发起 10 个 refresh
    const results = await Promise.all(
      Array.from({ length: 10 }, () => refreshSession()),
    );

    // 只调用了 1 次 API
    expect(refreshCallCount).toBe(1);

    // 所有调用返回相同结果
    const first = results[0];
    for (const r of results) {
      expect(r).toEqual(first);
    }
  });

  it('returns null when no refresh token', async () => {
    tokenStore.clear();
    const result = await refreshSession();
    expect(result).toBeNull();
  });

  it('stores the new token pair on success', async () => {
    tokenStore.setTokenPair({
      accessToken: 'expired-at',
      refreshToken: 'rt-valid',
    });

    refreshCallCount = 0;

    const result = await refreshSession();
    expect(result).not.toBeNull();
    expect(tokenStore.getAccessToken()).toBe(result?.accessToken);
    expect(tokenStore.getRefreshToken()).toBe(result?.refreshToken);
  });
});

describe('isRefreshSkippedUrl', () => {
  it('skips login endpoint', () => {
    expect(isRefreshSkippedUrl('/api/auth/login')).toBe(true);
  });

  it('skips refresh endpoint', () => {
    expect(isRefreshSkippedUrl('/api/auth/refresh')).toBe(true);
  });

  it('skips public config endpoint', () => {
    expect(isRefreshSkippedUrl('/api/system/config/public-theme')).toBe(true);
    expect(isRefreshSkippedUrl('/api/system/config/public-system')).toBe(true);
  });

  it('skips public tenant endpoint', () => {
    expect(isRefreshSkippedUrl('/api/system/tenant/public-list')).toBe(true);
  });

  it('does not skip normal API', () => {
    expect(isRefreshSkippedUrl('/api/auth/profile')).toBe(false);
    expect(isRefreshSkippedUrl('/api/system/config/current')).toBe(false);
  });
});
