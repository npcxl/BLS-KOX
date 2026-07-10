/**
 * Refresh Manager 测试：验证 Single Flight Refresh 行为
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let refreshCallCount = 0;

vi.mock('@/services/ant-design-pro/api', () => ({
  refreshToken: vi.fn().mockImplementation(() => {
    refreshCallCount++;
    return Promise.resolve({
      data: { token: `new-at-${refreshCallCount}`, refreshToken: `new-rt-${refreshCallCount}` },
    });
  }),
}));

vi.mock('@/services/system/dict', () => ({ clearDictCache: vi.fn() }));

import { tokenStore } from '@/auth/token-store';
import { refreshSession, isRefreshSkippedUrl } from '@/auth/refresh-manager';

beforeEach(() => {
  refreshCallCount = 0;
  tokenStore.clear();
});

describe('refreshSession - Single Flight', () => {
  it('only sends 1 refresh request when called concurrently', async () => {
    tokenStore.setTokenPair({ accessToken: 'expired-at', refreshToken: 'rt-valid' });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => refreshSession()),
    );

    expect(refreshCallCount).toBe(1);
    const first = results[0];
    for (const r of results) {
      expect(r?.accessToken).toBe(first?.accessToken);
    }
  });

  it('returns null when no refresh token', async () => {
    const result = await refreshSession();
    expect(result).toBeNull();
  });

  it('stores the new token pair on success', async () => {
    tokenStore.setTokenPair({ accessToken: 'expired-at', refreshToken: 'rt-valid' });
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
