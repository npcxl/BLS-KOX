/**
 * Token Store 单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage（vi.mock 会在所有 import 之前执行）
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
});

// 静态导入（mock 已在上面设置好）
import { tokenStore } from '@/auth/token-store';

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
