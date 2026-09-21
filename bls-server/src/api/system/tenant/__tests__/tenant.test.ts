/**
 * tenant 租户模块测试（阶段一）
 *
 * 覆盖：软删除过滤、平台租户保护、事务化 provisioning、Idempotency-Key、
 *      域名规范化与唯一性、expireTime 校验、异步 offboarding、停用撤销会话、
 *      public-list 按 Host 查询。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tenantId: '000000' as string | null,
  domain: 'demo.example.com' as string,
  db: null as any,
  redisStore: new Map<string, string>(),
  revokedTenants: [] as string[],
  enqueued: [] as any[],
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
vi.mock('../../../../shared/utils/redis', () => ({
  getRedisClient: () => ({
    set: async (k: string, v: string, ...args: any[]) => {
      const nx = args.some((a) => String(a).toUpperCase() === 'NX');
      if (nx && h.redisStore.has(k)) return null;
      h.redisStore.set(k, v);
      return 'OK';
    },
    get: async (k: string) => h.redisStore.get(k) ?? null,
    del: async (k: string) => { h.redisStore.delete(k); return 1; },
  }),
}));
vi.mock('../../../../security/session/session-center', () => ({
  sessionCenter: {
    revokeAllForTenant: async (tid: string) => { h.revokedTenants.push(tid); return 0; },
    revokeAll: async () => {},
    validate: async () => true,
    create: async () => {},
    revoke: async () => {},
    list: async () => [],
  },
}));
vi.mock('../../../../queue/queue', () => ({
  enqueue: async (p: any) => { h.enqueued.push(p); return { jobId: 'job-1', ...p }; },
}));
vi.mock('../../../../shared/utils/request-meta', () => ({
  buildRequestMeta: async () => ({
    domainName: h.domain, loginIp: null, userAgent: null, requestId: null, loginType: 'password',
  }),
}));
vi.mock('../../../../core/security-audit', () => ({
  writeSecurityLog: async () => {},
  actorFromCtx: () => ({
    tenantId: '000000', userId: null, username: null, clientIp: null, userAgent: null, requestId: null,
  }),
  SecurityEventType: { PERM_CHANGE: 'PERM_CHANGE' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
}));

import router from '../index';
import { FakeDb } from '../../../../core/__tests__/fake-db';
import { makeCtx, callRoute as call } from '../../../../core/__tests__/test-kit';

const T = 'sys_tenant';
const IDEM = 'idem-key-1';

beforeEach(() => {
  h.tenantId = '000000';
  h.domain = 'demo.example.com';
  h.redisStore = new Map();
  h.revokedTenants = [];
  h.enqueued = [];

  const db = new FakeDb();
  db.seed(T, [
    { tenant_id: '000000', tenant_name: '平台租户', domain_name: 'platform.example.com', package_id: 'P001', status: '0', offboard_status: 'none', deleted: 0 },
    { tenant_id: '100000', tenant_name: '默认租户', domain_name: 'demo.example.com', package_id: 'P100', status: '0', offboard_status: 'none', deleted: 0 },
    { tenant_id: '100001', tenant_name: '已删除租户', domain_name: null, package_id: 'P100', status: '0', offboard_status: 'none', deleted: 1 },
    { tenant_id: '100002', tenant_name: '空租户', domain_name: null, package_id: 'P100', status: '0', offboard_status: 'none', deleted: 0 },
    { tenant_id: '100003', tenant_name: '注销中租户', domain_name: null, package_id: 'P100', status: '1', offboard_status: 'pending', deleted: 0 },
  ]);
  db.seed('sys_user', [
    { user_id: 'U1', tenant_id: '100000', username: 'admin', password: 'x', password_algorithm: 'argon2id', nickname: 'admin', deleted: 0 },
  ]);
  db.seed('sys_role', [
    { role_id: 'R1', tenant_id: '100000', role_name: '租户管理员', role_key: 'tenant_admin', deleted: 0 },
  ]);
  db.seed('sys_user_role', []);
  db.seed('sys_role_menu', []);
  db.seed('sys_package', [
    { package_id: 'P001', package_name: '平台版', status: '0' },
    { package_id: 'P100', package_name: '标准版', status: '0' },
    { package_id: 'P999', package_name: '停用套餐', status: '1' },
  ]);
  db.seed('sys_package_menu', [
    { package_id: 'P100', menu_id: 'M1' },
    { package_id: 'P100', menu_id: 'M2' },
  ]);
  db.seed('sys_config', [
    { config_id: 'C1', tenant_id: '000000', config_key: 'sys.app.name', config_value: 'KOX', config_name: '系统名称', config_type: 'sys', status: '0', deleted: 0 },
    { config_id: 'C2', tenant_id: '000000', config_key: 'sys.user.defaultPassword', config_value: '123456', config_name: '默认密码', config_type: 'sys', status: '0', deleted: 0 },
  ]);
  db.seed('sys_theme_config', []);
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

  it('public-list 只返回当前 Host 的租户，且字段最小化', async () => {
    const ctx = makeCtx();
    await call(router, 'get', '/system/tenant/public-list', ctx);
    const rows = ctx.body.data;
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe('100000');
    expect(Object.keys(rows[0]).sort()).toEqual(['domain_name', 'tenant_id', 'tenant_name']);
  });

  it('public-list 不再泄露全部租户（未知域名返回空）', async () => {
    h.domain = 'unknown.example.com';
    const ctx = makeCtx();
    await call(router, 'get', '/system/tenant/public-list', ctx);
    expect(ctx.body.data).toEqual([]);
  });

  it('详情不存在 → 404', async () => {
    await expect(call(router, 'get', '/system/tenant/:tenantId', makeCtx({ params: { tenantId: 'nope' } })))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('tenant 删除策略（异步 offboarding）', () => {
  it('禁止删除平台租户', async () => {
    await expect(call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['000000'] } },
    }))).rejects.toMatchObject({ status: 403 });
  });

  it('有关联用户/角色时也进入 offboarding，且不物理删除数据', async () => {
    await call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['100000'] } },
    }));
    const row = h.db.rows(T).find((r: any) => r.tenant_id === '100000');
    expect(row.deleted).toBe(0);
    expect(row.status).toBe('1');
    expect(row.offboard_status).toBe('pending');
    // 用户数据没有被删除
    expect(h.db.rows('sys_user').filter((u: any) => u.tenant_id === '100000')).toHaveLength(1);
    // 已投递 offboarding 任务
    expect(h.enqueued.map((j) => j.jobType)).toContain('tenant.offboard');
    // 已吊销该租户全部会话
    expect(h.revokedTenants).toContain('100000');
  });

  it('已在 offboarding 的租户重复删除 → 409', async () => {
    await expect(call(router, 'delete', '/system/tenant/remove', makeCtx({
      request: { body: { ids: ['100003'] } },
    }))).rejects.toMatchObject({ status: 409 });
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

  it('停用不再要求先删除用户和角色，并立即吊销该租户全部会话', async () => {
    const ctx = makeCtx({ request: { body: { tenantId: '100000', status: '1' } } });
    await call(router, 'put', '/system/tenant/status', ctx);
    expect(h.db.rows(T).find((r: any) => r.tenant_id === '100000').status).toBe('1');
    expect(h.revokedTenants).toContain('100000');
    expect(ctx.body.data.revokedUsers).toBe(0);
  });

  it('恢复租户不会自动恢复旧会话', async () => {
    const ctx = makeCtx({ request: { body: { tenantId: '100002', status: '0' } } });
    await call(router, 'put', '/system/tenant/status', ctx);
    expect(h.db.rows(T).find((r: any) => r.tenant_id === '100002').status).toBe('0');
    expect(h.revokedTenants).toHaveLength(0);
  });

  it('status 非法 → 400', async () => {
    await expect(call(router, 'put', '/system/tenant/status', makeCtx({
      request: { body: { tenantId: '100002', status: '9' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('offboarding 中的租户不能切换状态 → 409', async () => {
    await expect(call(router, 'put', '/system/tenant/status', makeCtx({
      request: { body: { tenantId: '100003', status: '0' } },
    }))).rejects.toMatchObject({ status: 409 });
  });
});

describe('tenant provisioning', () => {
  const body = {
    tenantName: '新租户',
    domainName: 'New.Example.COM',
    packageId: 'P100',
    adminUsername: 'boss',
    adminPassword: '123456',
  };

  it('缺少 tenantName → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM }, request: { body: { domainName: 'x.com', packageId: 'P100' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('缺少 packageId → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM }, request: { body: { tenantName: 'x' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('缺少 Idempotency-Key → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({ request: { body } })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('套餐不存在 → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM }, request: { body: { ...body, packageId: 'NOPE' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('套餐已停用 → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM }, request: { body: { ...body, packageId: 'P999' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('域名冲突 → 409', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM },
      request: { body: { ...body, domainName: 'demo.example.com' } },
    }))).rejects.toMatchObject({ status: 409 });
  });

  it('expireTime 非法 → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM },
      request: { body: { ...body, expireTime: '2026-02-31' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('域名格式非法 → 400', async () => {
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': IDEM },
      request: { body: { ...body, domainName: 'not a domain!!' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('provisioning 一次性创建租户/角色/用户/角色菜单/用户角色/配置，并规范化域名', async () => {
    const ctx = makeCtx({ headers: { 'idempotency-key': IDEM }, request: { body } });
    await call(router, 'post', '/system/tenant/add', ctx);

    const result = ctx.body.data;
    expect(result.tenantId).toBeTruthy();
    expect(result.tenantId).not.toBe('HACK');
    expect(result.domainName).toBe('new.example.com');

    const tenant = h.db.rows(T).find((r: any) => r.tenant_id === result.tenantId);
    expect(tenant.tenant_name).toBe('新租户');
    expect(tenant.status).toBe('0');
    expect(tenant.offboard_status).toBe('none');

    // 默认管理员角色 + 套餐菜单授权
    const role = h.db.rows('sys_role').find((r: any) => r.role_id === result.adminRoleId);
    expect(role.role_key).toBe('tenant_admin');
    expect(role.tenant_id).toBe(result.tenantId);
    expect(h.db.rows('sys_role_menu').filter((rm: any) => rm.role_id === result.adminRoleId)).toHaveLength(2);

    // 默认管理员用户（Argon2id）
    const user = h.db.rows('sys_user').find((u: any) => u.user_id === result.adminUserId);
    expect(user.username).toBe('boss');
    expect(user.password_algorithm).toBe('argon2id');
    expect(user.password.startsWith('$argon2')).toBe(true);
    expect(user.is_admin).toBe('1');
    expect(h.db.rows('sys_user_role').some((ur: any) => ur.user_id === result.adminUserId && ur.role_id === result.adminRoleId)).toBe(true);

    // 租户级默认配置（从平台复制）
    expect(h.db.rows('sys_config').filter((c: any) => c.tenant_id === result.tenantId)).toHaveLength(2);
    // 默认主题
    expect(h.db.rows('sys_theme_config').filter((t: any) => t.tenant_id === result.tenantId)).toHaveLength(1);
  });

  it('相同 Idempotency-Key 重复提交只创建一次租户', async () => {
    const ctx1 = makeCtx({ headers: { 'idempotency-key': IDEM }, request: { body } });
    await call(router, 'post', '/system/tenant/add', ctx1);
    const created = h.db.rows(T).filter((r: any) => r.tenant_name === '新租户').length;
    expect(created).toBe(1);

    const ctx2 = makeCtx({ headers: { 'idempotency-key': IDEM }, request: { body } });
    await call(router, 'post', '/system/tenant/add', ctx2);
    expect(ctx2.body.data.tenantId).toBe(ctx1.body.data.tenantId);
    expect(ctx2.body.data.idempotent).toBe(true);
    expect(h.db.rows(T).filter((r: any) => r.tenant_name === '新租户')).toHaveLength(1);
  });

  it('provisioning 失败时整体回滚，不留下半个租户', async () => {
    // adminUsername 与既有租户内用户不冲突，但故意让角色菜单插入抛错
    const original = h.db.insertInto.bind(h.db);
    h.db.insertInto = (table: string) => {
      if (table === 'sys_role_menu') throw new Error('boom');
      return original(table);
    };
    await expect(call(router, 'post', '/system/tenant/add', makeCtx({
      headers: { 'idempotency-key': 'idem-rollback' }, request: { body },
    }))).rejects.toBeTruthy();
    h.db.insertInto = original;

    expect(h.db.rows(T).filter((r: any) => r.tenant_name === '新租户')).toHaveLength(0);
    expect(h.db.rows('sys_user').filter((u: any) => u.username === 'boss')).toHaveLength(0);
    expect(h.db.transactionCount).toBeGreaterThan(0);
    expect(h.db.rollbackCount).toBeGreaterThan(0);
  });

  it('编辑不存在的租户 → 404', async () => {
    await expect(call(router, 'put', '/system/tenant/edit', makeCtx({
      request: { body: { tenantId: 'nope', tenantName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('编辑套餐为停用套餐 → 400', async () => {
    await expect(call(router, 'put', '/system/tenant/edit', makeCtx({
      request: { body: { tenantId: '100002', packageId: 'P999' } },
    }))).rejects.toMatchObject({ status: 400 });
  });
});
