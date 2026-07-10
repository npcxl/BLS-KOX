/**
 * Token Store 单元测试
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { TokenStore } from '@/auth/token-store';

// Mock localStorage
const store = new Map<string, string>();

let tokenStore: TokenStore;

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  const mod = await import('@/auth/token-store');
  tokenStore = mod.tokenStore;
});

beforeEach(() => {
  store.clear();
});

describe('tokenStore', () => {
  it('getAccessToken returns null when not set', () => {
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  it('getRefreshToken returns null when not set', () => {
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('setTokenPair stores both tokens', () => {
    tokenStore.setTokenPair({
      accessToken: 'at-123',
      refreshToken: 'rt-456',
    });
    expect(tokenStore.getAccessToken()).toBe('at-123');
    expect(tokenStore.getRefreshToken()).toBe('rt-456');
  });

  it('clear removes all tokens', () => {
    tokenStore.setTokenPair({
      accessToken: 'at-123',
      refreshToken: 'rt-456',
    });
    tokenStore.clear();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('clear also removes currentUser', () => {
    store.set('currentUser', '{"name":"test"}');
    tokenStore.clear();
    expect(store.has('currentUser')).toBe(false);
  });
});
