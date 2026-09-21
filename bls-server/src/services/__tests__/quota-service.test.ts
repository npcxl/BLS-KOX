/**
 * 阶段三：QuotaService 单元测试
 *
 * 覆盖：不限配额、正常消费、超额拒绝、幂等键、归还、Redis 不可用 fail-closed、
 *      并发消费不突破配额。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  usage: new Map<string, number>(),
  quota: {} as Record<string, { limit: number; period: string }>,
  redis: null as any,
}));

vi.mock('../../core/database', () => ({
  queryOne: async (sql: string, params: any) => (h as any).queryOne(sql, params),
  query: async (sql: string, params: any) => (h as any).query(sql, params),
  execute: async (sql: string, params: any) => (h as any).execute(sql, params),
}));
vi.mock('../../shared/utils/redis', () => ({ getRedisClient: () => h.redis }));
vi.mock('../../shared/utils/snowflake', () => ({ generateSnowflakeId: () => String(Math.random()).slice(2, 12) }));

import { quotaService } from '../quota-service';
import { QUOTA_KEYS } from '../../shared/constants/entitlements';

const TENANT = 'T1';

(h as any).queryOne = async (sql: string, params: any) => {
  if (sql.includes('sys_package_quota')) {
    const def = h.quota[params.qk];
    return def ? { quotaKey: params.qk, quotaLimit: def.limit, period: def.period } : null;
  }
  if (sql.includes('SELECT used FROM sys_tenant_quota_usage')) {
    const v = h.usage.get(`${params.tid}::${params.qk}::${params.pk}`);
    return v === undefined ? null : { used: v };
  }
  if (sql.includes('package_id AS packageId')) return { packageId: 'P100' };
  return null;
};

(h as any).query = async () => [];

(h as any).execute = async (sql: string, params: any) => {
  const key = `${params.tid}::${params.qk}::${params.pk}`;
  if (sql.includes('INSERT IGNORE')) return { affectedRows: 1 };
  if (sql.includes('used = used + :delta')) {
    const used = h.usage.get(key) ?? 0;
    const unlimited = Number(params.unlimited) === 1;
    if (!unlimited && used + Number(params.delta) > Number(params.limit)) return { affectedRows: 0 };
    h.usage.set(key, used + Number(params.delta));
    return { affectedRows: 1 };
  }
  if (sql.includes('GREATEST(used - :delta, 0)')) {
    const used = h.usage.get(key) ?? 0;
    h.usage.set(key, Math.max(used - Number(params.delta), 0));
    return { affectedRows: 1 };
  }
  return { affectedRows: 0 };
};

/** 极简 Redis 替身（仅 NX set / del） */
class FakeRedis {
  store = new Map<string, string>();
  async set(k: string, v: string, ...args: any[]) {
    const nx = args.some((a) => String(a).toUpperCase() === 'NX');
    if (nx && this.store.has(k)) return null;
    this.store.set(k, v);
    return 'OK';
  }
  async del(k: string) { this.store.delete(k); return 1; }
}

beforeEach(() => {
  h.usage = new Map();
  h.quota = { [QUOTA_KEYS.MAX_USERS]: { limit: 2, period: 'total' } };
  h.redis = new FakeRedis();
});

describe('QuotaService', () => {
  it('未定义配额 → 不限，消费总是成功', async () => {
    const state = await quotaService.consume(TENANT, QUOTA_KEYS.MAX_WEBHOOKS, 999);
    expect(state.unlimited).toBe(true);
    expect(state.limit).toBeNull();
  });

  it('未超额 → 成功并累计用量', async () => {
    const s1 = await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1);
    expect(s1.used).toBe(1);
    expect(s1.remaining).toBe(1);
    const s2 = await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1);
    expect(s2.used).toBe(2);
    expect(s2.remaining).toBe(0);
  });

  it('超额 → QuotaExceededError(409/40905)', async () => {
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 2);
    await expect(quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1))
      .rejects.toMatchObject({ status: 409, code: 40905 });
    // 失败不改变用量
    const state = await quotaService.getState(TENANT, QUOTA_KEYS.MAX_USERS);
    expect(state.used).toBe(2);
  });

  it('并发消费不会突破配额', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(2);
    const state = await quotaService.getState(TENANT, QUOTA_KEYS.MAX_USERS);
    expect(state.used).toBe(2);
  });

  it('幂等键：相同 key 只消费一次', async () => {
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1, { idempotencyKey: 'k1' });
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1, { idempotencyKey: 'k1' });
    const state = await quotaService.getState(TENANT, QUOTA_KEYS.MAX_USERS);
    expect(state.used).toBe(1);
  });

  it('幂等命中不重复消费（相同 key 第二次直接返回当前状态）', async () => {
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 2, { idempotencyKey: 'k2' });
    const state = await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 2, { idempotencyKey: 'k2' });
    expect(state.used).toBe(2);
  });

  it('超额失败时释放幂等键，归还后可用同一 key 重试', async () => {
    // 先用尽配额
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 2);
    // 该请求超额 → 失败，同时释放其幂等键
    await expect(quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1, { idempotencyKey: 'k2b' }))
      .rejects.toMatchObject({ code: 40905 });
    // 归还 1 个额度后，同一幂等键可以再次尝试并成功
    await quotaService.release(TENANT, QUOTA_KEYS.MAX_USERS, 1);
    const state = await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1, { idempotencyKey: 'k2b' });
    expect(state.used).toBe(2);
  });

  it('Redis 不可用 + 幂等键 → 503（fail-closed）', async () => {
    h.redis = null;
    await expect(quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1, { idempotencyKey: 'k3' }))
      .rejects.toMatchObject({ status: 503 });
  });

  it('release 归还配额且不会小于 0', async () => {
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 2);
    await quotaService.release(TENANT, QUOTA_KEYS.MAX_USERS, 1);
    expect((await quotaService.getState(TENANT, QUOTA_KEYS.MAX_USERS)).used).toBe(1);
    await quotaService.release(TENANT, QUOTA_KEYS.MAX_USERS, 99);
    expect((await quotaService.getState(TENANT, QUOTA_KEYS.MAX_USERS)).used).toBe(0);
  });

  it('assertWithinLimit 在超限时抛错', async () => {
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 2);
    await expect(quotaService.assertWithinLimit(TENANT, QUOTA_KEYS.MAX_USERS, 1))
      .rejects.toMatchObject({ code: 40905 });
  });

  it('降级场景：limit 变小后无法再新增，但已有用量保留', async () => {
    h.quota[QUOTA_KEYS.MAX_USERS] = { limit: 10, period: 'total' };
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 8);
    h.quota[QUOTA_KEYS.MAX_USERS] = { limit: 5, period: 'total' }; // 降级
    await expect(quotaService.consume(TENANT, QUOTA_KEYS.MAX_USERS, 1))
      .rejects.toMatchObject({ code: 40905 });
    expect((await quotaService.getState(TENANT, QUOTA_KEYS.MAX_USERS)).used).toBe(8);
  });

  it('monthly 配额使用 YYYY-MM 周期键', async () => {
    h.quota[QUOTA_KEYS.MAX_AI_TOKENS_MONTHLY] = { limit: 100, period: 'monthly' };
    await quotaService.consume(TENANT, QUOTA_KEYS.MAX_AI_TOKENS_MONTHLY, 50);
    const now = new Date();
    const pk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(h.usage.get(`${TENANT}::${QUOTA_KEYS.MAX_AI_TOKENS_MONTHLY}::${pk}`)).toBe(50);
  });
});
