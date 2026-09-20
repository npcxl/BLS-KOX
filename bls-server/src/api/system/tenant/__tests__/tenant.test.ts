/**
 * tenant 租户模块测试：软删除过滤、平台租户保护、关联数据策略、public-list 最小字段、域名唯一
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tenantId: '000000' as string | null,
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

const T = 'sys_tenant';

beforeEach(() => {
  h.tenantId = '000000';
  const db = new FakeDb();
  db.seed(T, [
    { tenant_id: '000000', tenant_name: '平台租户', domain_name: 'platform.example.com', status: '0', contact_user: 'admin', deleted: 0 },
    { tenant_id: '100000', tenant_name: '默认租户', domain_name: 'demo.example.com', status: '0', contact_user: 'tester', deleted: 0 },
    { tenant_id: '100001', tenant_name: '已删除租户', domain_name: null, status: '0', contact_user: null, deleted: 1 },
    { tenant_id: '100002', tenant_name: '空租户', domain_name: null, status: '0', contact_user: null, deleted: 0 },
  ]);
  db.seed('sys_user', [
    { user_id: 'U1', tenant_id: '100000', username: 'admin', deleted: 0 },
  ]);
  db.seed('sys_role', [
    { role_id: 'R1', tenant_id: '100000', role_name: '租户管理员', deleted: 0 },
  ]);
  db.seed('sys_page_column_config', []);
  h.db = db;
});

describe('tenant 列表', () => {
  it('list 过滤逻辑删除的租户', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/tenant/list', ctx);
    const ids = ctx.body.data.map((r: any) => r.tenant_id);
    expect(ids).not.toContain('100001');
    expect(ids).toContain('100000');
  });

  it('public-list 只返回最小字段且过滤已删除', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/tenant/public-list', ctx);
    const ids = ctx.body.data.map((r: any) => r.tenant_id);
    expect(ids).not.toContain('100001');
    for (const row of ctx.body.data) {
      expect(Object.keys(row).sort()).toEqual(['domain_name', 'tenant_id', 'tenant_name']);
    }
  });

  it('详情不存在 → 404', async () => {
    await expect(call(router, 'get', '/system/tenant/:tenantId', makeCtx({ params: { tenantId: 'nope' } })))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('tenant 删除策略', () => {
  it('禁止删除平台租户', async () => {
    await expect(call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['000000'] } },
    }))).rejects.toMatchObject({ status: 403 });
    expect(h.db.rows(T).find((r: any) => r.tenant_id === '000000').deleted).toBe(0);
  });

  it('存在关联用户/角色时拒绝删除（409）', async () => {
    await expect(call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['100000'] } },
    }))).rejects.toMatchObject({ status: 409 });
    expect(h.db.rows(T).find((r: any) => r.tenant_id === '100000').deleted).toBe(0);
  });

  it('无关联数据时逻辑删除（不物理删除）', async () => {
    await call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['100002'] } },
    }));
    expect(h.db.rows(T)).toHaveLength(4);
    expect(h.db.rows(T).find((r: any) => r.tenant_id === '100002').deleted).toBe(1);
  });

  it('不存在 → 404', async () => {
    await expect(call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['nope'] } },
    }))).rejects.toMatchObject({ status: 404 });
  });
});

describe('tenant 状态切换', () => {
  it('禁止停用平台租户', async () => {
    await expect(call(router, 'put', '/system/tenant/status', makeCtx({
      request: { body: { tenantId: '000000', status: '1' } },
    }))).rejects.toMatchObject({ status: 403 });
  });

  it('仍有用户/角色时拒绝停用（409）', async () => {
    await expect(call(router, 'put', '/system/tenant/status', makeCtx({
      request: { body: { tenantId: '100000', status: '1' } },
    }))).rejects.toMatchObject({ status: 409 });
  });

  it('无关联数据时可停用', async () => {
    await call(router, 'put', '/system/tenant/status', makeCtx({
      request: { body: { tenantId: '100002', status: '1' } },
    }));
    expect(h.db.rows(T).find((r: any) => r.tenant_id === '100002').status).toBe('1');
  });

  it('status 非法 → 400', async () => {
    await expect(call(router, 'put', '/system/tenant/status', makeCtx({
      request: { body: { tenantId: '100002', status: '9' } },
    }))).rejects.toMatchObject({ status: 400 });
  });
});

describe('tenant 参数与唯一性', () => {
  it('缺少 tenantName → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({ request: { body: { domainName: 'x.com' } } })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('域名冲突 → 409', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      request: { body: { tenantName: '新租户', domainName: 'demo.example.com' } },
    }))).rejects.toMatchObject({ status: 409 });
  });

  it('新增成功返回 tenantId 且 tenantId 由服务端生成', async () => {
    const ctx = makeCtx({
      request: { body: { tenantName: '新租户', domainName: 'new.example.com', tenantId: 'HACK' } },
    });
    await call(router, 'post', '/system/tenant/add', ctx);
    expect(ctx.body.data.tenantId).not.toBe('HACK');
    const created = h.db.rows(T).find((r: any) => r.tenant_id === ctx.body.data.tenantId);
    expect(created.tenant_name).toBe('新租户');
  });

  it('编辑不存在的租户 → 404', async () => {
    await expect(call(router, 'put', '/system/tenant/edit', makeCtx({
      request: { body: { tenantId: 'nope', tenantName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });
});
