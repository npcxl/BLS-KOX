import { describe, expect, it } from 'vitest';
import access from './access';

describe('access', () => {
  it('should return canAdmin true when user has admin access', () => {
    const initialState = {
      currentUser: {
        userId: '1',
        username: 'admin',
        nickname: 'Admin User',
        tenantId: '000000',
        isAdmin: '1' as const,
        roles: [],
        perms: [],
        menus: [],
        access: 'admin',
      },
    };

    const result = access(initialState);

    expect(result.canAdmin).toBe(true);
  });

  it('should return canAdmin false when user has non-admin access', () => {
    const initialState = {
      currentUser: {
        userId: '2',
        username: 'user',
        nickname: 'Regular User',
        tenantId: '000000',
        isAdmin: '0' as const,
        roles: [],
        perms: [],
        menus: [],
        access: 'user',
      },
    };

    const result = access(initialState);

    expect(result.canAdmin).toBe(false);
  });

  it('should return canAdmin false when user access is undefined', () => {
    const initialState = {
      currentUser: {
        userId: '3',
        username: 'guest',
        nickname: 'Guest User',
        tenantId: '000000',
        isAdmin: '0' as const,
        roles: [],
        perms: [],
        menus: [],
      },
    };

    const result = access(initialState);

    expect(result.canAdmin).toBe(false);
  });

  it('should return canAdmin false when currentUser is undefined', () => {
    const initialState = {
      currentUser: undefined,
    };

    const result = access(initialState);

    expect(result.canAdmin).toBeFalsy();
  });

  it('should return canAdmin false when initialState is undefined', () => {
    const result = access(undefined);

    expect(result.canAdmin).toBeFalsy();
  });
});
