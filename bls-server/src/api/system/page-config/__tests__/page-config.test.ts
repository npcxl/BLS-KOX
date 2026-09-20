/**
 * page-config 安全与租户隔离测试
 *
 * 覆盖：未认证访问、权限校验、跨租户读取/删除、参数校验、事务与逻辑删除
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  authed: true,
  perms: [] as string[],
  tenantId: 't1' as string | null,
  db: null as any,
}));

vi.mock('../../../../core/database', () => ({
  getDb: async () => h.db,
}));

vi.mock('../../../../middleware/tenant', () => ({
  getCurrentTenantId: () => h.tenantId,
  requireTenantId: () => {
    if (!h.tenantId) throw new Error('缺少租户上下文，禁止写操作');
    return h.tenantId;
  },
}));

vi.mock('../../../../middleware/auth', () => ({
  jwtAuth: () => async (_ctx: any, next: any) => {
    if (!h.authed) {
      const err: any = new Error('未登录或登录已过期');
      err.status = 401;
      throw err;
    }
    return next();
  },
}));

vi.mock('../../../../middleware/permission', () => ({
  hasPerm: (perm: string) => async (_ctx: any, next: any) => {
    if (!h.perms.includes(perm)) {
      const err: any = new Error('无访问权限');
      err.status = 403;
      throw err;
    }
    return next();
  },
}));

import router from '../index';
import { FakeDb } from '../../../../core/__tests__/fake-db';

function makeCtx(overrides: Record<string, any> = {}): any {
  return {
    params: {}, query: {}, request: { body: undefined },
    state: { user: { userId: 'u1', tenantId: 't1' } },
    status: 200, body: undefined, headers: {}, ip: '127.0.0.1',
    path: '/system/page-config', method: 'GET',
    get: () => '', set: () => undefined,
    ...overrides,
  };
}

function compose(middlewares: any[]) {
  return async (ctx: any): Promise<void> => {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      const fn = middlewares[i];
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    };
    await dispatch(0);
  };
}

async function call(method: string, fullPath: string, ctx: any): Promise<any> {
  const layer: any = (router as any).stack.find(
    (l: any) => l.path === fullPath && l.methods.map((m: string) => m.toLowerCase()).includes(method),
  );
  if (!layer) throw new Error(`route not found: ${method} ${fullPath}`);
  await compose(layer.stack)(ctx);
  return ctx;
}

const PAGE_ROWS = [
  { page_config_id: 'PC1', page_code: 'system_user', page_name: '用户管理', enabled: 1, sort: 1, tenant_id: 't1', remark: null, deleted: 0 },
  { page_config_id: 'PC2', page_code: 'system_user', page_name: '用户管理(t2)', enabled: 1, sort: 1, tenant_id: 't2', remark: null, deleted: 0 },
];
const COLUMNS = [
  { column_id: 'C1', page_code: 'system_user', data_index: 'username', title: '用户名', order_num: 1, tenant_id: 't1', deleted: 0 },
  { column_id: 'C2', page_code: 'system_user', data_index: 'username', title: '用户名(t2)', order_num: 1, tenant_id: 't2', deleted: 0 },
];

beforeEach(() => {
  h.authed = true;
  h.perms = ['system:pageconfig:list', 'system:pageconfig:edit', 'system:pageconfig:remove'];
  h.tenantId = 't1';
  const db = new FakeDb();
  db.seed('sys_page_config', PAGE_ROWS);
  db.seed('sys_page_column_config', COLUMNS);
  h.db = db;
});

describe('page-config 鉴权', () => {
  it('未认证访问 list → 401', async () => {
    h.authed = false;
    await expect(call('get', '/system/page-config/list', makeCtx()))
      .rejects.toMatchObject({ status: 401 });
  });

  it('未认证访问 save → 401', async () => {
    h.authed = false;
    await expect(call('post', '/system/page-config/save', makeCtx({ request: { body: {} } })))
      .rejects.toMatchObject({ status: 401 });
  });

  it('未认证访问 delete → 401', async () => {
    h.authed = false;
    await expect(call('delete', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'system_user' } })))
      .rejects.toMatchObject({ status: 401 });
  });

  it('登录但缺少 system:pageconfig:list → 403', async () => {
    h.perms = [];
    await expect(call('get', '/system/page-config/list', makeCtx()))
      .rejects.toMatchObject({ status: 403 });
  });

  it('登录但缺少 system:pageconfig:edit → 403（save）', async () => {
    h.perms = ['system:pageconfig:list'];
    await expect(call('post', '/system/page-config/save', makeCtx({
      request: { body: { page: { pageCode: 'p', pageName: 'P' }, columns: [] } },
    }))).rejects.toMatchObject({ status: 403 });
  });

  it('登录但缺少 system:pageconfig:remove → 403（delete）', async () => {
    h.perms = ['system:pageconfig:list', 'system:pageconfig:edit'];
    await expect(call('delete', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'system_user' } })))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('page-config 租户隔离', () => {
  it('list 只返回当前租户配置', async () => {
    const ctx = await call('get', '/system/page-config/list', makeCtx());
    expect(ctx.body.data.map((r: any) => r.page_config_id)).toEqual(['PC1']);
  });

  it('读取页面配置限定租户', async () => {
    const ctx = await call('get', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'system_user' } }));
    expect(ctx.body.data.page_config_id).toBe('PC1');
  });

  it('读取列配置限定租户', async () => {
    const ctx = await call('get', '/system/page-config/page/:pageCode/columns', makeCtx({ params: { pageCode: 'system_user' } }));
    expect(ctx.body.data.map((r: any) => r.column_id)).toEqual(['C1']);
  });

  it('t2 删除同名 pageCode 时只影响自己的配置，t1 数据保持不变', async () => {
    h.tenantId = 't2';
    await call('delete', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'system_user' } }));
    expect(h.db.rows('sys_page_config').find((r: any) => r.page_config_id === 'PC1').deleted).toBe(0);
    expect(h.db.rows('sys_page_config').find((r: any) => r.page_config_id === 'PC2').deleted).toBe(1);
    // t1 的列配置不受影响
    expect(h.db.rows('sys_page_column_config').find((r: any) => r.column_id === 'C1').deleted).toBe(0);
  });

  it('t2 删除仅属于 t1 的页面配置 → 404', async () => {
    h.db.rows('sys_page_config').push({
      page_config_id: 'PC_ONLY_T1', page_code: 'only_t1', page_name: '仅t1', enabled: 1,
      sort: 2, tenant_id: 't1', remark: null, deleted: 0,
    });
    h.tenantId = 't2';
    await expect(call('delete', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'only_t1' } })))
      .rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('sys_page_config').find((r: any) => r.page_config_id === 'PC_ONLY_T1').deleted).toBe(0);
  });

  it('save 不会更新其他租户的同名 pageCode 配置', async () => {
    h.tenantId = 't1';
    await call('post', '/system/page-config/save', makeCtx({
      request: { body: { page: { pageCode: 'system_user', pageName: '改名', sort: 9 }, columns: [] } },
    }));
    const t1 = h.db.rows('sys_page_config').find((r: any) => r.page_config_id === 'PC1');
    const t2 = h.db.rows('sys_page_config').find((r: any) => r.page_config_id === 'PC2');
    expect(t1.page_name).toBe('改名');
    expect(t1.sort).toBe(9);
    expect(t2.page_name).toBe('用户管理(t2)');
    expect(t2.sort).toBe(1);
  });
});

describe('page-config 参数校验', () => {
  it('缺少 pageCode → 400', async () => {
    await expect(call('post', '/system/page-config/save', makeCtx({
      request: { body: { page: { pageName: 'x' }, columns: [] } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('空 pageCode → 400', async () => {
    await expect(call('post', '/system/page-config/save', makeCtx({
      request: { body: { page: { pageCode: '   ', pageName: 'x' }, columns: [] } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('重复 dataIndex → 400', async () => {
    await expect(call('post', '/system/page-config/save', makeCtx({
      request: { body: {
        page: { pageCode: 'p', pageName: 'P' },
        columns: [
          { dataIndex: 'username', title: 'A' },
          { dataIndex: 'username', title: 'B' },
        ],
      } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('非法 orderNum → 400', async () => {
    await expect(call('post', '/system/page-config/save', makeCtx({
      request: { body: {
        page: { pageCode: 'p', pageName: 'P' },
        columns: [{ dataIndex: 'username', title: 'A', orderNum: -1 }],
      } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('缺少 dataIndex → 400', async () => {
    await expect(call('post', '/system/page-config/save', makeCtx({
      request: { body: {
        page: { pageCode: 'p', pageName: 'P' },
        columns: [{ title: 'A' }],
      } },
    }))).rejects.toMatchObject({ status: 400 });
  });
});

describe('page-config 事务与逻辑删除', () => {
  it('save page + columns 在同一事务内完成', async () => {
    await call('post', '/system/page-config/save', makeCtx({
      request: { body: {
        page: { pageCode: 'new_page', pageName: '新页面', enabled: true, sort: 3 },
        columns: [{ dataIndex: 'a', title: 'A' }, { dataIndex: 'b', title: 'B', orderNum: 5 }],
      } },
    }));
    expect(h.db.transactionCount).toBe(1);
    const page = h.db.rows('sys_page_config').find((r: any) => r.page_code === 'new_page');
    expect(page.tenant_id).toBe('t1');
    const cols = h.db.rows('sys_page_column_config').filter((r: any) => r.page_code === 'new_page' && Number(r.deleted) === 0);
    expect(cols).toHaveLength(2);
    expect(cols.map((c: any) => c.tenant_id)).toEqual(['t1', 't1']);
  });

  it('save 使用逻辑删除替换旧列', async () => {
    await call('post', '/system/page-config/save', makeCtx({
      request: { body: {
        page: { pageCode: 'system_user', pageName: '用户管理' },
        columns: [{ columnId: 'C1', dataIndex: 'username', title: '用户名' }],
      } },
    }));
    const c1 = h.db.rows('sys_page_column_config').find((r: any) => r.column_id === 'C1');
    expect(Number(c1.deleted)).toBe(0);
    // 其他租户的列不受影响
    const c2 = h.db.rows('sys_page_column_config').find((r: any) => r.column_id === 'C2');
    expect(Number(c2.deleted)).toBe(0);
  });

  it('delete 使用逻辑删除（不物理删除）', async () => {
    await call('delete', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'system_user' } }));
    const rows = h.db.rows('sys_page_config');
    expect(rows.find((r: any) => r.page_config_id === 'PC1').deleted).toBe(1);
    expect(rows).toHaveLength(2);
    const cols = h.db.rows('sys_page_column_config');
    expect(cols.find((r: any) => r.column_id === 'C1').deleted).toBe(1);
    expect(cols.find((r: any) => r.column_id === 'C2').deleted).toBe(0);
  });

  it('删除不存在的页面 → 404', async () => {
    await expect(call('delete', '/system/page-config/page/:pageCode', makeCtx({ params: { pageCode: 'not-exist' } })))
      .rejects.toMatchObject({ status: 404 });
  });
});
