/**
 * 阶段一：租户生命周期校验 + provisioning 参数规范化测试
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/database', () => ({ getDb: async () => ({}), queryOne: async () => null }));
vi.mock('../../shared/utils/redis', () => ({ getRedisClient: () => null }));

import { isTenantExpired, assertTenantUsable, assertUserUsable, type TenantAuthRow } from '../tenant-lifecycle';
import { normalizeDomainName, normalizeExpireTime } from '../../api/system/tenant/provisioning';

const base: TenantAuthRow = {
  tenantId: '100000',
  tenantName: '默认租户',
  domainName: 'demo.example.com',
  packageId: 'P100',
  status: '0',
  deleted: 0,
  offboardStatus: 'none',
  expireTime: null,
};

describe('isTenantExpired', () => {
  it('expire_time 为空表示永不过期', () => {
    expect(isTenantExpired(null)).toBe(false);
    expect(isTenantExpired(undefined)).toBe(false);
    expect(isTenantExpired('')).toBe(false);
  });

  it('未来时间未过期', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    expect(isTenantExpired(future)).toBe(false);
  });

  it('过去时间已过期', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    expect(isTenantExpired(past)).toBe(true);
  });

  it('非法时间按已过期处理（fail-closed）', () => {
    expect(isTenantExpired('not-a-date')).toBe(true);
  });
});

describe('assertTenantUsable', () => {
  it('正常租户通过', () => {
    expect(assertTenantUsable(base).tenantId).toBe('100000');
  });

  it('已删除租户 → 401', () => {
    expect(() => assertTenantUsable({ ...base, deleted: 1 })).toThrow(/租户/);
  });

  it('停用租户 → 401', () => {
    expect(() => assertTenantUsable({ ...base, status: '1' })).toThrow(/停用/);
  });

  it('offboarding 租户 → 401', () => {
    expect(() => assertTenantUsable({ ...base, offboardStatus: 'pending' })).toThrow(/停用/);
  });

  it('过期租户 → 401', () => {
    const past = new Date(Date.now() - 1000).toISOString().slice(0, 19).replace('T', ' ');
    expect(() => assertTenantUsable({ ...base, expireTime: past })).toThrow(/过期/);
  });

  it('租户不存在 → 401', () => {
    expect(() => assertTenantUsable(null)).toThrow();
  });
});

describe('assertUserUsable', () => {
  it('正常用户通过', () => {
    expect(() => assertUserUsable({ deleted: 0, status: '0' })).not.toThrow();
  });
  it('已删除用户 → 401', () => {
    expect(() => assertUserUsable({ deleted: 1, status: '0' })).toThrow();
  });
  it('停用用户 → 401', () => {
    expect(() => assertUserUsable({ deleted: 0, status: '1' })).toThrow(/停用/);
  });
});

describe('normalizeDomainName', () => {
  it('小写化并去除协议/端口/路径', () => {
    expect(normalizeDomainName('HTTPS://Demo.Example.COM:8443/path')).toBe('demo.example.com');
  });

  it('允许 localhost', () => {
    expect(normalizeDomainName('localhost')).toBe('localhost');
  });

  it('空值返回 null', () => {
    expect(normalizeDomainName('')).toBeNull();
    expect(normalizeDomainName(null)).toBeNull();
    expect(normalizeDomainName(undefined)).toBeNull();
  });

  it('非法域名抛 400', () => {
    expect(() => normalizeDomainName('not a domain!!')).toThrow();
    expect(() => normalizeDomainName('a_b.example.com')).toThrow();
  });
});

describe('normalizeExpireTime', () => {
  it('纯日期补全为当日 23:59:59', () => {
    expect(normalizeExpireTime('2030-01-02')).toBe('2030-01-02 23:59:59');
  });

  it('支持 T 分隔', () => {
    expect(normalizeExpireTime('2030-01-02T03:04')).toBe('2030-01-02 03:04:00');
  });

  it('拒绝不存在的日期', () => {
    expect(() => normalizeExpireTime('2026-02-31')).toThrow();
  });

  it('拒绝格式错误', () => {
    expect(() => normalizeExpireTime('2030/01/02')).toThrow();
  });

  it('空值返回 null', () => {
    expect(normalizeExpireTime(null)).toBeNull();
    expect(normalizeExpireTime('')).toBeNull();
  });
});
