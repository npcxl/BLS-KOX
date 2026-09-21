/**
 * 阶段四：PasswordResetService 单元测试
 *
 * 覆盖：只存 hash、单次使用、有效期语义（由 SQL 条件保证）、令牌失效。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  inserted: [] as any[],
  updates: [] as any[],
  consumeAffected: 1,
  consumedRow: { tenantId: 'T1', userId: 'U1' } as any,
}));

vi.mock('../../core/database', () => ({
  execute: async (sql: string, params: any) => {
    h.updates.push({ sql, params });
    if (sql.includes('SET used = 1, used_time = NOW()') && sql.includes('token_hash')) {
      return { affectedRows: h.consumeAffected };
    }
    if (sql.includes('INSERT INTO sys_password_reset_token')) {
      h.inserted.push(params);
      return { affectedRows: 1 };
    }
    return { affectedRows: 1 };
  },
  queryOne: async () => h.consumedRow,
}));
vi.mock('../../shared/utils/snowflake', () => ({ generateSnowflakeId: () => 'TOKEN_ID_1' }));
vi.mock('../../core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { passwordResetService, hashResetToken } from '../password-reset-service';

beforeEach(() => {
  h.inserted = [];
  h.updates = [];
  h.consumeAffected = 1;
  h.consumedRow = { tenantId: 'T1', userId: 'U1' };
});

describe('PasswordResetService', () => {
  it('issue 返回明文令牌，但数据库只保存 SHA-256', async () => {
    const raw = await passwordResetService.issue({ tenantId: 'T1', userId: 'U1' });
    expect(raw).toBeTruthy();
    expect(raw.length).toBeGreaterThan(20);

    const inserted = h.inserted[0];
    expect(inserted.tokenHash).toBe(hashResetToken(raw));
    expect(JSON.stringify(inserted)).not.toContain(raw);
    expect(inserted.tokenHash).not.toBe(raw);
  });

  it('issue 使用默认 30 分钟有效期（reset_password）', async () => {
    await passwordResetService.issue({ tenantId: 'T1', userId: 'U1' });
    const expireTime: Date = h.inserted[0].expireTime;
    const minutes = (expireTime.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('consume 成功返回租户与用户', async () => {
    const raw = await passwordResetService.issue({ tenantId: 'T1', userId: 'U1' });
    const consumed = await passwordResetService.consume(raw);
    expect(consumed).toEqual({ tenantId: 'T1', userId: 'U1' });
  });

  it('consume 使用条件 UPDATE（单次使用 + 有效期），并携带 token hash', async () => {
    const raw = await passwordResetService.issue({ tenantId: 'T1', userId: 'U1' });
    await passwordResetService.consume(raw);
    const consumeSql = h.updates.find((u) => u.sql.includes('used = 1, used_time = NOW()') && u.sql.includes('token_hash'));
    expect(consumeSql).toBeTruthy();
    expect(consumeSql.sql).toContain('used = 0');
    expect(consumeSql.sql).toContain('expire_time > NOW()');
    expect(consumeSql.params.tokenHash).toBe(hashResetToken(raw));
  });

  it('令牌已被使用 / 过期 → consume 返回 null', async () => {
    h.consumeAffected = 0;
    const consumed = await passwordResetService.consume('some-token-value');
    expect(consumed).toBeNull();
  });

  it('空令牌 → null（不查库）', async () => {
    expect(await passwordResetService.consume('')).toBeNull();
  });

  it('purpose 不匹配时不会命中（consume 传入不同 purpose）', async () => {
    await passwordResetService.consume('token-x', 'invite');
    const consumeSql = h.updates.find((u) => u.sql.includes('used = 0'));
    expect(consumeSql.params.purpose).toBe('invite');
  });

  it('invalidateForUser 使该用户全部未消费令牌失效', async () => {
    await passwordResetService.invalidateForUser('U1');
    const sql = h.updates.find((u) => u.sql.includes('WHERE user_id = :userId AND used = 0'));
    expect(sql).toBeTruthy();
    expect(sql.params).toEqual({ userId: 'U1' });
  });
});
