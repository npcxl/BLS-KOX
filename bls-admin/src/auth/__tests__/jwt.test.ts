/**
 * JWT 工具函数测试
 */
import { describe, it, expect } from 'vitest';
import { decodeJwtPayload, getJwtExp, isJwtExpired } from '@/auth/jwt';

// 构建一个简单的 JWT token
function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('fake-signature');
  return `${header}.${body}.${sig}`;
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const token = makeToken({ sub: 'user1', name: 'test' });
    const payload = decodeJwtPayload(token);
    expect(payload).toEqual({ sub: 'user1', name: 'test' });
  });

  it('returns null for invalid token', () => {
    expect(decodeJwtPayload('invalid')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });

  it('returns null for token without 3 parts', () => {
    expect(decodeJwtPayload('header.payload')).toBeNull();
  });
});

describe('getJwtExp', () => {
  it('returns exp from payload', () => {
    const token = makeToken({ exp: 2000000000 });
    expect(getJwtExp(token)).toBe(2000000000);
  });

  it('returns null when no exp field', () => {
    const token = makeToken({ sub: 'user1' });
    expect(getJwtExp(token)).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('returns false for future token', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = makeToken({ exp: future });
    expect(isJwtExpired(token)).toBe(false);
  });

  it('returns true for expired token', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = makeToken({ exp: past });
    expect(isJwtExpired(token)).toBe(true);
  });

  it('returns true for token expiring within 30s buffer', () => {
    const soon = Math.floor(Date.now() / 1000) + 10;
    const token = makeToken({ exp: soon });
    expect(isJwtExpired(token)).toBe(true);
  });
});
