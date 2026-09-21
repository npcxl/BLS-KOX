/**
 * storage 存储配置模块测试
 *
 * 覆盖：雪花主键与返回、密钥脱敏、编辑保留原密钥、默认配置唯一性、租户隔离、参数校验
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tenantId: 't1' as string | null,
  db: null as any,
}));

vi.mock('../../../../core/database', () => ({ getDb: async () => h.db }));
vi.mock('../../../../middleware/tenant', () => ({
  getCurrentTenantId: () => h.tenantId,
  requireTenantId: () => {
    if (!h.tenantId) throw new Error('缺少租户上下文，禁止写操作');
    return h.tenantId;
  },
}));
vi.mock('../../../../middleware/auth', () => ({ jwtAuth: () => async (_ctx: any, next: any) => next() }));
vi.mock('../../../../middleware/permission', () => ({ hasPerm: () => async (_ctx: any, next: any) => next() }));
vi.mock('../../../../distributed/lock', () => ({ createDistributedLock: () => ({ acquire: async () => ({ status: 'unavailable' }) }) }));
vi.mock('../../../../shared/utils/redis', () => ({ getRedisClient: () => null }));

import router from '../index';
import { FakeDb } from '../../../../core/__tests__/fake-db';
import { makeCtx, callRoute as call } from '../../../../core/__tests__/test-kit';

const T = 'sys_storage_config';

function rows() {
  return [
    {
      storage_id: 'S1', tenant_id: 't1', storage_name: 'MinIO', storage_type: 'minio',
      endpoint: 'minio', access_key: 'AKIA1234567890ABCD', secret_key: 'secret-key-abcdefgh',
      is_default: 1, status: '0', deleted: 0,
    },
    {
      storage_id: 'S2', tenant_id: 't1', storage_name: 'OSS', storage_type: 'aliyun_oss',
      endpoint: 'oss', access_key: 'AKIA0000000000WXYZ', secret_key: 'other-key-12345678',
      is_default: 0, status: '0', deleted: 0,
    },
    {
      storage_id: 'S3', tenant_id: 't2', storage_name: 'OtherTenant', storage_type: 'minio',
      endpoint: 'minio', access_key: 'OTHERKEY12345678', secret_key: 'other-tenant-secret',
      is_default: 1, status: '0', deleted: 0,
    },
  ];
}

beforeEach(() => {
  h.tenantId = 't1';
  const db = new FakeDb();
  db.seed(T, rows());
  db.seed('sys_file', []);
  h.db = db;
});

describe('storage 新增', () => {
  it('生成雪花主键并返回 storageId，租户来自服务端', async () => {
    const ctx = makeCtx({
      request: { body: { storageName: '新存储', storageType: 'minio', endpoint: 'e', tenantId: 't2' } },
    });
    await call(router, 'post', '/system/storage/add', ctx);
    expect(ctx.body.code).toBe(200);
    expect(typeof ctx.body.data.storageId).toBe('string');
    const created = h.db.rows(T).find((r: any) => r.storage_id === ctx.body.data.storageId);
    expect(created.tenant_id).toBe('t1');
    expect(Number(created.deleted)).toBe(0);
  });

  it('缺少 storageName → 400', async () => {
    await expect(call(router, 'post', '/system/storage/add', makeCtx({
      request: { body: { storageType: 'minio' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('configJson 非法 JSON → 400', async () => {
    await expect(call(router, 'post', '/system/storage/add', makeCtx({
      request: { body: { storageName: 'x', storageType: 'minio', configJson: 'not-json' } },
    }))).rejects.toMatchObject({ status: 400 });
  });
});

describe('storage 密钥脱敏', () => {
  it('list 不返回完整 accessKey/secretKey', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/storage/list', ctx);
    expect(ctx.body.data).toHaveLength(2);
    for (const row of ctx.body.data) {
      expect(row.access_key).toContain('****');
      expect(row.secret_key).toContain('****');
      expect(row.access_key).not.toBe('AKIA1234567890ABCD');
      expect(row.secret_key).not.toBe('secret-key-abcdefgh');
    }
  });

  it('详情同样脱敏', async () => {
    const ctx = makeCtx({ params: { storageId: 'S1' } });
    await call(router, 'get', '/system/storage/:storageId', ctx);
    expect(ctx.body.data.secret_key).toContain('****');
  });

  it('详情跨租户 → 404', async () => {
    await expect(call(router, 'get', '/system/storage/:storageId', makeCtx({ params: { storageId: 'S3' } })))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('storage 编辑', () => {
  it('传入脱敏 secretKey 时保留原密钥', async () => {
    const listCtx = makeCtx();
    await call(router, 'get', '/system/storage/list', listCtx);
    const masked = listCtx.body.data.find((r: any) => r.storage_id === 'S1');

    const ctx = makeCtx({
      request: { body: { storageId: 'S1', storageName: 'MinIO 改名', secretKey: masked.secret_key, accessKey: masked.access_key } },
    });
    await call(router, 'put', '/system/storage/edit', ctx);

    const row = h.db.rows(T).find((r: any) => r.storage_id === 'S1');
    expect(row.secret_key).toBe('secret-key-abcdefgh');
    expect(row.access_key).toBe('AKIA1234567890ABCD');
    expect(row.storage_name).toBe('MinIO 改名');
  });

  it('未传 secretKey 时保留原密钥', async () => {
    await call(router, 'put', '/system/storage/edit', makeCtx({
      request: { body: { storageId: 'S1', storageName: '仅改名' } },
    }));
    const row = h.db.rows(T).find((r: any) => r.storage_id === 'S1');
    expect(row.secret_key).toBe('secret-key-abcdefgh');
  });

  it('传入新 secretKey 时更新（以密文落库，不存明文）', async () => {
    await call(router, 'put', '/system/storage/edit', makeCtx({
      request: { body: { storageId: 'S1', secretKey: 'brand-new-secret' } },
    }));
    const stored = h.db.rows(T).find((r: any) => r.storage_id === 'S1').secret_key;
    expect(stored).not.toBe('brand-new-secret');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('brand-new-secret');
  });

  it('跨租户编辑 → 404 且数据未变', async () => {
    await expect(call(router, 'put', '/system/storage/edit', makeCtx({
      request: { body: { storageId: 'S3', storageName: 'hacked' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(T).find((r: any) => r.storage_id === 'S3').storage_name).toBe('OtherTenant');
  });

  it('不存在的记录 → 404', async () => {
    await expect(call(router, 'put', '/system/storage/edit', makeCtx({
      request: { body: { storageId: 'nope', storageName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });
});

describe('storage 默认配置唯一性', () => {
  it('编辑设为默认时同租户其他配置被取消默认，其他租户不受影响', async () => {
    await call(router, 'put', '/system/storage/edit', makeCtx({
      request: { body: { storageId: 'S2', isDefault: '1' } },
    }));
    const all = h.db.rows(T);
    expect(Number(all.find((r: any) => r.storage_id === 'S1').is_default)).toBe(0);
    expect(Number(all.find((r: any) => r.storage_id === 'S2').is_default)).toBe(1);
    // 其他租户的默认标记保持不变
    expect(Number(all.find((r: any) => r.storage_id === 'S3').is_default)).toBe(1);
  });

  it('新增设为默认时取消同租户既有默认', async () => {
    const ctx = makeCtx({
      request: { body: { storageName: '新默认', storageType: 'local', isDefault: true } },
    });
    await call(router, 'post', '/system/storage/add', ctx);
    const all = h.db.rows(T).filter((r: any) => r.tenant_id === 't1');
    expect(all.filter((r: any) => Number(r.is_default) === 1)).toHaveLength(1);
    expect(all.find((r: any) => Number(r.is_default) === 1).storage_name).toBe('新默认');
  });
});

describe('storage 删除', () => {
  it('逻辑删除当前租户配置', async () => {
    await call(router, 'delete', '/system/storage/remove', makeCtx({ request: { body: { ids: ['S1'] } } }));
    expect(h.db.rows(T).find((r: any) => r.storage_id === 'S1').deleted).toBe(1);
    expect(h.db.rows(T)).toHaveLength(3);
  });

  it('删除跨租户 ID → 404 且不删除', async () => {
    await expect(call(router, 'delete', '/system/storage/remove', makeCtx({
      request: { body: { ids: ['S3'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(T).find((r: any) => r.storage_id === 'S3').deleted).toBe(0);
  });

  it('混合租户 ID → 整体拒绝，当前租户数据也不被删除', async () => {
    await expect(call(router, 'delete', '/system/storage/remove', makeCtx({
      request: { body: { ids: ['S1', 'S3'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(T).find((r: any) => r.storage_id === 'S1').deleted).toBe(0);
  });

  it('缺少 ids → 400', async () => {
    await expect(call(router, 'delete', '/system/storage/remove', makeCtx({ request: { body: {} } })))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('storage 列表租户隔离', () => {
  it('只返回当前租户数据', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/storage/list', ctx);
    expect(ctx.body.data.map((r: any) => r.storage_id).sort()).toEqual(['S1', 'S2']);
  });

  it('t2 视角只看到自己的数据', async () => {
    h.tenantId = 't2';
    const ctx = makeCtx();
    await call(router, 'get', '/system/storage/list', ctx);
    expect(ctx.body.data.map((r: any) => r.storage_id)).toEqual(['S3']);
  });
});
