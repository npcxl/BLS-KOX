/**
 * 阶段六：ApiKeyService 单元测试
 *
 * 覆盖：创建只返回一次明文、密文落库、key_hash 校验、状态/撤销/有效期、
 *      scope 判定、常量时间比较、跨租户不可见。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as any[],
  inserted: [] as any[],
}));

vi.mock('../../core/database', () => ({
  execute: async (sql: string, params: any) => {
    if (sql.includes('INSERT INTO sys_api_key')) {
      h.inserted.push(params);
      return { affectedRows: 1 };
    }
    if (sql.includes("SET status = '1', revoked_at = NOW()")) {
      const row = h.rows.find((r) => r.apiKeyId === params.id && r.tenantId === params.tid && r.deleted === 0 && !r.revokedAt);
      if (!row) return { affectedRows: 0 };
      row.status = '1';
      row.revokedAt = new Date().toISOString();
      return { affectedRows: 1 };
    }
    return { affectedRows: 1 };
  },
  queryOne: async (_sql: string, params: any) => h.rows.find((r) => r.keyId === params.keyId) ?? null,
  query: async () => h.rows,
}));
vi.mock('../../shared/utils/snowflake', () => ({ generateSnowflakeId: () => 'AK_ID_1' }));

import { apiKeyService, sha256Hex, scopesAllow, timingSafeEqualString } from '../api-key-service';
import { decryptSecret } from '../../shared/utils/secret-crypto';

const TENANT = 'T1';

beforeEach(() => {
  h.rows = [];
  h.inserted = [];
});

describe('ApiKeyService.create', () => {
  it('返回一次性明文，但数据库只保存密文与 hash', async () => {
    const created = await apiKeyService.create({ tenantId: TENANT, name: 'partner-a', scopes: ['read'] });

    expect(created.keyId).toHaveLength(32);
    expect(created.secret).toHaveLength(64);
    expect(created.apiKey).toBe(`${created.keyId}.${created.secret}`);

    const inserted = h.inserted[0];
    expect(inserted.encryptedSecret.startsWith('enc:v1:')).toBe(true);
    expect(inserted.encryptedSecret).not.toContain(created.secret);
    expect(decryptSecret(inserted.encryptedSecret)).toBe(created.secret);
    expect(inserted.keyHash).toBe(sha256Hex(created.apiKey));
    expect(inserted.keyHash).not.toContain(created.secret);
  });

  it('默认 scope 为 read，且可自定义', async () => {
    const a = await apiKeyService.create({ tenantId: TENANT, name: 'a', scopes: [] });
    expect(a.scopes).toEqual(['read']);
    const b = await apiKeyService.create({ tenantId: TENANT, name: 'b', scopes: ['read', 'write'] });
    expect(h.inserted[1].scopes).toBe('read,write');
  });
});

describe('ApiKeyService.resolve', () => {
  async function seed(overrides: Record<string, any> = {}) {
    const created = await apiKeyService.create({ tenantId: TENANT, name: 'partner', scopes: ['read', 'write'] });
    const inserted = h.inserted[h.inserted.length - 1];
    const row = {
      apiKeyId: 'AK_ID_1',
      tenantId: TENANT,
      name: 'partner',
      keyId: created.keyId,
      keyHash: inserted.keyHash,
      encryptedSecret: inserted.encryptedSecret,
      secretPreview: inserted.secretPreview,
      scopes: inserted.scopes,
      status: '0',
      expireAt: null,
      revokedAt: null,
      lastUsedAt: null,
      createdBy: null,
      createdAt: '2026-09-21 00:00:00',
      deleted: 0,
      ...overrides,
    };
    h.rows.push(row);
    return { created, row };
  }

  it('仅用 keyId 即可解析出 secret（用于 HMAC 校验）', async () => {
    const { created } = await seed();
    const resolved = await apiKeyService.resolve(created.keyId);
    expect(resolved?.secret).toBe(created.secret);
    expect(resolved?.record.tenantId).toBe(TENANT);
  });

  it('完整 Key（keyId.secret）通过 key_hash 校验', async () => {
    const { created } = await seed();
    const resolved = await apiKeyService.resolve(created.apiKey);
    expect(resolved?.secret).toBe(created.secret);
  });

  it('完整 Key 的 secret 错误 → 拒绝', async () => {
    const { created } = await seed();
    const bad = `${created.keyId}.${'0'.repeat(64)}`;
    expect(await apiKeyService.resolve(bad)).toBeNull();
  });

  it('未知 keyId → null', async () => {
    await seed();
    expect(await apiKeyService.resolve('deadbeef')).toBeNull();
  });

  it('已撤销 → null', async () => {
    const { created } = await seed({ revokedAt: '2026-09-21 00:00:00' });
    expect(await apiKeyService.resolve(created.keyId)).toBeNull();
  });

  it('已过期 → null', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const { created } = await seed({ expireAt: past });
    expect(await apiKeyService.resolve(created.keyId)).toBeNull();
  });

  it('未过期 → 可用', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const { created } = await seed({ expireAt: future });
    expect((await apiKeyService.resolve(created.keyId))?.secret).toBe(created.secret);
  });

  it('停用 / 已删除 → null', async () => {
    const a = await seed({ status: '1' });
    expect(await apiKeyService.resolve(a.created.keyId)).toBeNull();
    h.rows = [];
    h.inserted = [];
    const b = await seed({ deleted: 1 });
    expect(await apiKeyService.resolve(b.created.keyId)).toBeNull();
  });

  it('密文无法解密（密钥版本丢失）→ null，不抛错', async () => {
    const { created } = await seed({ encryptedSecret: 'enc:v1:v999:aaaa:bbbb:cccc' });
    expect(await apiKeyService.resolve(created.keyId)).toBeNull();
  });
});

describe('ApiKeyService.revoke / list（租户隔离）', () => {
  it('撤销仅对所属租户生效', async () => {
    const created = await apiKeyService.create({ tenantId: TENANT, name: 'a', scopes: ['read'] });
    h.rows.push({
      apiKeyId: 'AK_ID_1', tenantId: TENANT, name: 'a', keyId: created.keyId, keyHash: 'h',
      encryptedSecret: 'e', secretPreview: null, scopes: 'read', status: '0',
      expireAt: null, revokedAt: null, lastUsedAt: null, createdBy: null,
      createdAt: '2026-09-21 00:00:00', deleted: 0,
    });
    expect(await apiKeyService.revoke('OTHER_TENANT', 'AK_ID_1')).toBe(false);
    expect(await apiKeyService.revoke(TENANT, 'AK_ID_1')).toBe(true);
    expect(await apiKeyService.revoke(TENANT, 'AK_ID_1')).toBe(false);
  });

  it('list 不返回 keyHash / encryptedSecret', async () => {
    h.rows = [{
      apiKeyId: 'AK_ID_1', tenantId: TENANT, name: 'a', keyId: 'k', keyHash: 'SECRETISH',
      encryptedSecret: 'enc:v1:...', secretPreview: 'abcd****wxyz', scopes: 'read', status: '0',
      expireAt: null, revokedAt: null, lastUsedAt: null, createdBy: null,
      createdAt: '2026-09-21 00:00:00', deleted: 0,
    }];
    const list = await apiKeyService.list(TENANT);
    expect(list[0]).not.toHaveProperty('keyHash');
    expect(list[0]).not.toHaveProperty('encryptedSecret');
  });
});

describe('scope 与常量时间比较', () => {
  it('scopesAllow', () => {
    expect(scopesAllow(['read'], 'read')).toBe(true);
    expect(scopesAllow(['read'], 'write')).toBe(false);
    expect(scopesAllow(['*'], 'write')).toBe(true);
    expect(scopesAllow('read,write', 'write')).toBe(true);
    expect(scopesAllow('', 'read')).toBe(false);
  });

  it('timingSafeEqualString', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualString('', '')).toBe(true);
  });

  it('sha256Hex 稳定', () => {
    expect(sha256Hex('abc')).toHaveLength(64);
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
  });
});
