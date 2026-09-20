/**
 * dict 字典模块测试：跨租户隔离、dictTypeId 归属校验、级联逻辑删除、平台字典回退
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

import router from '../index';
import { FakeDb } from '../../../../core/__tests__/fake-db';
import { makeCtx, callRoute as call } from '../../../../core/__tests__/test-kit';

const TT = 'sys_dict_type', TD = 'sys_dict_data';

beforeEach(() => {
  h.tenantId = 't1';
  const db = new FakeDb();
  db.seed(TT, [
    { dict_type_id: 'DT_T1', dict_name: '状态', dict_type: 'sys_status', status: '0', tenant_id: 't1', deleted: 0 },
    { dict_type_id: 'DT_T2', dict_name: '状态(t2)', dict_type: 'sys_status', status: '0', tenant_id: 't2', deleted: 0 },
    { dict_type_id: 'DT_PLATFORM', dict_name: '平台状态', dict_type: 'sys_platform_only', status: '0', tenant_id: '000000', deleted: 0 },
  ]);
  db.seed(TD, [
    { dict_data_id: 'DD1', dict_type_id: 'DT_T1', dict_label: '启用', dict_value: '0', dict_sort: 1, tag: 'green', status: '0', tenant_id: 't1', deleted: 0, remark: 'own' },
    { dict_data_id: 'DD2', dict_type_id: 'DT_T2', dict_label: '启用(t2)', dict_value: '0', dict_sort: 1, tag: 'blue', status: '0', tenant_id: 't2', deleted: 0, remark: 'other' },
    { dict_data_id: 'DD3', dict_type_id: 'DT_PLATFORM', dict_label: '平台值', dict_value: '1', dict_sort: 1, tag: 'cyan', status: '0', tenant_id: '000000', deleted: 0, remark: 'platform' },
  ]);
  h.db = db;
});

describe('dict 类型租户隔离', () => {
  it('list 只返回当前租户类型', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/dict/type/list', ctx);
    expect(ctx.body.data.map((r: any) => r.dict_type_id)).toEqual(['DT_T1']);
  });

  it('edit 跨租户类型 → 404 且数据未变', async () => {
    await expect(call(router, 'put', '/system/dict/type/edit', makeCtx({
      request: { body: { dictTypeId: 'DT_T2', dictName: 'hacked' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(TT).find((r: any) => r.dict_type_id === 'DT_T2').dict_name).toBe('状态(t2)');
  });

  it('remove 跨租户类型 → 404 且其字典数据未被删除', async () => {
    await expect(call(router, 'delete', '/system/dict/type/remove', makeCtx({
      request: { body: { ids: ['DT_T2'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(TT).find((r: any) => r.dict_type_id === 'DT_T2').deleted).toBe(0);
    expect(h.db.rows(TD).find((r: any) => r.dict_data_id === 'DD2').deleted).toBe(0);
  });

  it('同租户 dictType 重复 → 409', async () => {
    await expect(call(router, 'post', '/system/dict/type/add', makeCtx({
      request: { body: { dictName: '重复', dictType: 'sys_status' } },
    }))).rejects.toMatchObject({ status: 409 });
  });

  it('其他租户已存在同名 dictType 时本租户仍可创建', async () => {
    const ctx = makeCtx({ request: { body: { dictName: '新类型', dictType: 'brand_new' } } });
    await call(router, 'post', '/system/dict/type/add', ctx);
    const created = h.db.rows(TT).find((r: any) => r.dict_type_id === ctx.body.data.dictTypeId);
    expect(created.tenant_id).toBe('t1');
  });

  it('删除类型级联逻辑删除本租户字典数据（事务）', async () => {
    await call(router, 'delete', '/system/dict/type/remove', makeCtx({
      request: { body: { ids: ['DT_T1'] } },
    }));
    expect(h.db.transactionCount).toBe(1);
    expect(h.db.rows(TT).find((r: any) => r.dict_type_id === 'DT_T1').deleted).toBe(1);
    expect(h.db.rows(TD).find((r: any) => r.dict_data_id === 'DD1').deleted).toBe(1);
    // 其他租户数据不受影响
    expect(h.db.rows(TD).find((r: any) => r.dict_data_id === 'DD2').deleted).toBe(0);
  });
});

describe('dict 数据租户隔离', () => {
  it('list 只返回当前租户数据', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/dict/data/list', ctx);
    expect(ctx.body.data.map((r: any) => r.dict_data_id)).toEqual(['DD1']);
  });

  it('add 使用其他租户 dictTypeId → 404', async () => {
    await expect(call(router, 'post', '/system/dict/data/add', makeCtx({
      request: { body: { dictTypeId: 'DT_T2', dictLabel: 'x', dictValue: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('add 使用本租户 dictTypeId → 成功且租户来自服务端', async () => {
    const ctx = makeCtx({
      request: { body: { dictTypeId: 'DT_T1', dictLabel: '停用', dictValue: '1', tenantId: 't2' } },
    });
    await call(router, 'post', '/system/dict/data/add', ctx);
    const created = h.db.rows(TD).find((r: any) => r.dict_data_id === ctx.body.data.dictDataId);
    expect(created.tenant_id).toBe('t1');
  });

  it('edit 跨租户数据 → 404', async () => {
    await expect(call(router, 'put', '/system/dict/data/edit', makeCtx({
      request: { body: { dictDataId: 'DD2', dictLabel: 'hacked' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(TD).find((r: any) => r.dict_data_id === 'DD2').dict_label).toBe('启用(t2)');
  });

  it('remove 跨租户数据 → 404', async () => {
    await expect(call(router, 'delete', '/system/dict/data/remove', makeCtx({
      request: { body: { ids: ['DD2'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows(TD).find((r: any) => r.dict_data_id === 'DD2').deleted).toBe(0);
  });
});

describe('dict /data/type 租户来源安全', () => {
  it('当前租户无该 dict_type 时回退平台字典，且只返回必要字段', async () => {
    const ctx = makeCtx({ query: { dictType: 'sys_platform_only' } });
    await call(router, 'get', '/system/dict/data/type', ctx);
    expect(ctx.body.data.map((r: any) => r.dict_data_id)).toEqual(['DD3']);
    expect(ctx.body.data[0]).not.toHaveProperty('remark');
    expect(ctx.body.data[0]).toHaveProperty('dict_label');
  });

  it('优先使用当前租户自己的字典类型', async () => {
    const ctx = makeCtx({ query: { dictType: 'sys_status' } });
    await call(router, 'get', '/system/dict/data/type', ctx);
    expect(ctx.body.data.map((r: any) => r.dict_data_id)).toEqual(['DD1']);
  });

  it('不会读取其他租户的字典数据', async () => {
    h.tenantId = 't3';
    const ctx = makeCtx({ query: { dictType: 'sys_status' } });
    await call(router, 'get', '/system/dict/data/type', ctx);
    expect(ctx.body.data).toEqual([]);
  });

  it('缺少 dictType → 400', async () => {
    await expect(call(router, 'get', '/system/dict/data/type', makeCtx()))
      .rejects.toMatchObject({ status: 400 });
  });
});
