import { describe, it, expect } from 'vitest';
import { pickAllowed, USER_PROFILE_FIELDS, USER_EDIT_FIELDS, FORBIDDEN_FIELDS } from '../shared/utils/mass-assignment';

describe('Mass Assignment', () => {
  it('profile 过滤 isAdmin', () => {
    const body = { nickname: 'test', isAdmin: '1', tenantId: 'bad' };
    const result = pickAllowed(body, USER_PROFILE_FIELDS);
    expect(result).toEqual({ nickname: 'test' });
    expect(result).not.toHaveProperty('isAdmin');
    expect(result).not.toHaveProperty('tenantId');
  });

  it('profile 过滤 userId', () => {
    const body = { nickname: 'test', userId: 'hacked' };
    const result = pickAllowed(body, USER_PROFILE_FIELDS);
    expect(result).not.toHaveProperty('userId');
  });

  it('profile 合法字段通过', () => {
    const body = { nickname: 'newNick', email: 'a@b.com', phone: '123' };
    const result = pickAllowed(body, USER_PROFILE_FIELDS);
    expect(result.nickname).toBe('newNick');
  });

  it('edit 不允许 isAdmin', () => {
    const body = { nickname: 'x', isAdmin: '1' };
    const result = pickAllowed(body, USER_EDIT_FIELDS);
    expect(result).not.toHaveProperty('isAdmin');
  });

  it('edit 不允许 deleted', () => {
    const body = { nickname: 'x', deleted: 0 };
    const result = pickAllowed(body, USER_EDIT_FIELDS);
    expect(result).not.toHaveProperty('deleted');
  });

  it('非法字段全过滤后为空对象', () => {
    const body = { tenantId: 'bad', isAdmin: '1', perms: ['*'] };
    const result = pickAllowed(body, USER_PROFILE_FIELDS);
    expect(Object.keys(result).length).toBe(0);
  });
});
