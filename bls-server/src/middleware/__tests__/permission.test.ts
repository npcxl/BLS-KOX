/**
 * 阶段二：授权模型测试
 *
 * 断言：
 *  - 平台租户不再自动绕过权限，只有明确的平台超级管理员身份才绕过
 *  - 普通平台租户用户必须拥有权限码
 *  - 普通租户用户必须拥有权限码
 *  - 跨租户访问会被记录
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  logs: [] as any[],
}));

vi.mock('../../core/security-audit', () => ({
  writeSecurityLog: async (input: any) => { h.logs.push(input); },
  actorFromCtx: () => ({ tenantId: '000000', userId: null, username: null, clientIp: null, userAgent: null, requestId: null }),
  SecurityEventType: { CROSS_TENANT_ACCESS: 'CROSS_TENANT_ACCESS', PERMISSION_DENIED: 'PERMISSION_DENIED' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
}));

import { hasPerm, isPlatformSuperAdmin } from '../permission';

function ctxWith(user: any, extra: Record<string, any> = {}): any {
  return {
    state: { user },
    query: {}, params: {}, request: { body: undefined },
    path: '/api/demo', method: 'POST',
    ...extra,
  };
}

const next = async () => { /* noop */ };

const PLATFORM_SUPER_ADMIN = {
  userId: 'u1', username: 'superadmin', tenantId: '000000', isAdmin: '1',
  perms: [], permissions: [], roles: [{ roleKey: 'admin' }],
};

const PLATFORM_NORMAL_USER = {
  userId: 'u2', username: 'operator', tenantId: '000000', isAdmin: '0',
  perms: ['system:user:list'], permissions: ['system:user:list'], roles: [{ roleKey: 'operator' }],
};

const TENANT_USER = {
  userId: 'u3', username: 'tenant-admin', tenantId: '100000', isAdmin: '1',
  perms: ['system:user:list'], permissions: ['system:user:list'], roles: [{ roleKey: 'tenant_admin' }],
};

beforeEach(() => { h.logs = []; });

describe('isPlatformSuperAdmin', () => {
  it('平台租户 + isAdmin + admin 角色 → true', () => {
    expect(isPlatformSuperAdmin(PLATFORM_SUPER_ADMIN)).toBe(true);
  });

  it('平台租户 + isAdmin + * 权限 → true', () => {
    expect(isPlatformSuperAdmin({ ...PLATFORM_SUPER_ADMIN, roles: [], perms: ['*'] })).toBe(true);
  });

  it('平台租户普通用户 → false', () => {
    expect(isPlatformSuperAdmin(PLATFORM_NORMAL_USER)).toBe(false);
  });

  it('普通租户 + isAdmin + admin 角色 → false（角色标识不足以跨出平台租户）', () => {
    expect(isPlatformSuperAdmin(TENANT_USER)).toBe(false);
  });

  it('缺少 isAdmin 标记 → false', () => {
    expect(isPlatformSuperAdmin({ ...PLATFORM_SUPER_ADMIN, isAdmin: '0' })).toBe(false);
  });
});

describe('hasPerm', () => {
  it('未登录 → 401', async () => {
    await expect(hasPerm('system:user:list')(ctxWith(undefined), next))
      .rejects.toMatchObject({ status: 401 });
  });

  it('平台超级管理员可以访问任意权限码', async () => {
    await expect(hasPerm('any:perm:here')(ctxWith(PLATFORM_SUPER_ADMIN), next)).resolves.toBeUndefined();
  });

  it('平台租户普通用户不能绕过权限（阶段二修复）', async () => {
    await expect(hasPerm('system:tenant:list')(ctxWith(PLATFORM_NORMAL_USER), next))
      .rejects.toMatchObject({ status: 403 });
  });

  it('平台租户普通用户拥有该权限码时放行', async () => {
    await expect(hasPerm('system:user:list')(ctxWith(PLATFORM_NORMAL_USER), next)).resolves.toBeUndefined();
  });

  it('普通租户用户缺少权限码 → 403', async () => {
    await expect(hasPerm('system:role:assignMenu')(ctxWith(TENANT_USER), next))
      .rejects.toMatchObject({ status: 403 });
  });

  it('普通租户用户拥有权限码 → 放行', async () => {
    await expect(hasPerm('system:user:list')(ctxWith(TENANT_USER), next)).resolves.toBeUndefined();
  });

  it('权限拒绝会写入 PERMISSION_DENIED 安全日志', async () => {
    await hasPerm('system:role:assignMenu')(ctxWith(TENANT_USER), next).catch(() => undefined);
    expect(h.logs.some((l) => l.eventType === 'PERMISSION_DENIED')).toBe(true);
  });

  it('跨租户请求会记录 CROSS_TENANT_ACCESS', async () => {
    const ctx = ctxWith(TENANT_USER, { query: { tenantId: '000000' } });
    await hasPerm('system:user:list')(ctx, next);
    expect(h.logs.some((l) => l.eventType === 'CROSS_TENANT_ACCESS')).toBe(true);
  });

  it('同租户请求不记录 CROSS_TENANT_ACCESS', async () => {
    const ctx = ctxWith(TENANT_USER, { query: { tenantId: '100000' } });
    await hasPerm('system:user:list')(ctx, next);
    expect(h.logs.some((l) => l.eventType === 'CROSS_TENANT_ACCESS')).toBe(false);
  });
});
