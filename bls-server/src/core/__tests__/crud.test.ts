/**
 * CRUD 工厂独立测试
 *
 * 覆盖：
 *  a. 正常 CRUD
 *  b. GET /:id
 *  c. 普通租户不能读写其他租户（跨租户修改/删除/详情被阻止）
 *  d. 请求体 tenantId 不能覆盖服务端租户
 *  e. 已软删除数据不可查询、编辑、再次删除或改状态
 *  f. 非白名单字段不能写入
 *  g. Data Scope 真正生效
 *  h. 批量删除
 *  i. 事务成功、回滚及提交后回调
 *  j. 资源不存在返回 404
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tenantId: 't1' as string | null,
  db: null as any,
}));

vi.mock('../database', () => ({
  getDb: async () => h.db,
}));

vi.mock('../../middleware/tenant', () => ({
  getCurrentTenantId: () => h.tenantId,
  requireTenantId: () => {
    if (!h.tenantId) throw new Error('缺少租户上下文，禁止写操作');
    return h.tenantId;
  },
}));

vi.mock('../../middleware/auth', () => ({
  jwtAuth: () => async (_ctx: any, next: any) => next(),
}));

vi.mock('../../middleware/permission', () => ({
  hasPerm: () => async (_ctx: any, next: any) => next(),
}));

import { defineCrudModule, extractIds, pickFields, normalizeStatus } from '../crud';
import { FakeDb } from './fake-db';
import type Router from 'koa-router';

// ====== 测试脚手架 ======

function makeCtx(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    query: {},
    request: { body: undefined },
    state: { user: { userId: 'u1', tenantId: 't1', username: 'tester', roles: [{ dataScope: 'TENANT' }] } },
    status: 200,
    body: undefined,
    headers: {},
    ip: '127.0.0.1',
    path: '/demo',
    method: 'GET',
    get: () => '',
    set: () => undefined,
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

async function call(router: Router, method: string, fullPath: string, ctx: any): Promise<any> {
  const layer: any = (router as any).stack.find(
    (l: any) => l.path === fullPath && l.methods.map((m: string) => m.toLowerCase()).includes(method),
  );
  if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${fullPath}`);
  await compose(layer.stack)(ctx);
  return ctx;
}

const ROWS = [
  { item_id: '1', tenant_id: 't1', item_name: 'a', status: '0', deleted: 0, dept_id: 'd1', create_by: 'u1' },
  { item_id: '2', tenant_id: 't1', item_name: 'b', status: '0', deleted: 0, dept_id: 'd2', create_by: 'u2' },
  { item_id: '3', tenant_id: 't2', item_name: 'c', status: '0', deleted: 0, dept_id: 'd1', create_by: 'u9' },
  { item_id: '4', tenant_id: 't1', item_name: 'd', status: '0', deleted: 1, dept_id: 'd1', create_by: 'u1' },
];

function buildRouter(extra: Record<string, any> = {}): Router {
  return defineCrudModule({
    prefix: '/demo',
    table: 'demo_item',
    pkField: 'item_id',
    searchFields: ['item_name'],
    filterFields: ['status'],
    createFields: ['item_name', 'status', 'remark', 'dept_id', 'amount'],
    updateFields: ['item_name', 'status', 'remark', 'dept_id', 'amount'],
    ...extra,
  });
}

beforeEach(() => {
  h.tenantId = 't1';
  const db = new FakeDb();
  db.seed('demo_item', ROWS);
  db.seed('sys_dept', [
    { dept_id: 'd1', parent_id: '000000', tenant_id: 't1', deleted: 0 },
    { dept_id: 'd1-child', parent_id: 'd1', tenant_id: 't1', deleted: 0 },
  ]);
  h.db = db;
});

// ====== 工具函数 ======

describe('CRUD 工厂 - 工具函数', () => {
  it('extractIds 支持 { ids } 对象', () => {
    expect(extractIds({ ids: ['1', '2'] }, {})).toEqual(['1', '2']);
  });

  it('extractIds 支持 query 中的逗号分隔', () => {
    expect(extractIds(undefined, { ids: '1,2' })).toEqual(['1', '2']);
  });

  it('extractIds 支持裸数组（兼容 Java 旧格式）', () => {
    expect(extractIds(['1'], {})).toEqual(['1']);
  });

  it('extractIds 缺失时返回空数组', () => {
    expect(extractIds({}, {})).toEqual([]);
  });

  it('pickFields 忽略未知字段并统一为 snake_case', () => {
    const out = pickFields({ itemName: 'x', evilColumn: '1', tenantId: 't2' }, ['item_name']);
    expect(out).toEqual({ item_name: 'x' });
  });

  it('normalizeStatus 拒绝非法状态', () => {
    expect(normalizeStatus('1')).toBe('1');
    expect(() => normalizeStatus('00')).toThrow();
    expect(() => normalizeStatus(undefined)).toThrow();
  });
});

// ====== a. 正常 CRUD ======

describe('a. 正常 CRUD', () => {
  it('list 只返回当前租户、未删除数据', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/list', makeCtx());
    expect(ctx.body.code).toBe(200);
    expect(ctx.body.total).toBe(2);
    expect(ctx.body.data.map((r: any) => r.itemId).sort()).toEqual(['1', '2']);
    // 响应字段 camelCase
    expect(ctx.body.data[0]).toHaveProperty('itemName');
  });

  it('list 分页 pageSize 上限 100', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/list', makeCtx({ query: { pageNum: '1', pageSize: '9999' } }));
    expect(ctx.body.data.length).toBeLessThanOrEqual(100);
  });

  it('list 忽略未知 query 参数（不生成任意列条件）', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/list', makeCtx({ query: { evilColumn: 'x' } }));
    expect(ctx.body.code).toBe(200);
    expect(ctx.body.total).toBe(2);
  });

  it('list 支持白名单精确过滤', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/list', makeCtx({ query: { status: '0' } }));
    expect(ctx.body.total).toBe(2);
  });

  it('add 写入成功后返回主键', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'post', '/demo/add', makeCtx({
      request: { body: { itemName: 'new', status: '0' } },
    }));
    expect(ctx.body.code).toBe(200);
    expect(typeof ctx.body.data.itemId).toBe('string');
    const rows = h.db.rows('demo_item');
    expect(rows.some((r: any) => r.item_name === 'new')).toBe(true);
  });

  it('edit 修改成功', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '1', itemName: 'changed' } },
    }));
    expect(ctx.body.code).toBe(200);
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').item_name).toBe('changed');
  });

  it('remove 软删除（deleted=1）', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'delete', '/demo/remove', makeCtx({
      request: { body: { ids: ['1'] } },
    }));
    expect(ctx.body.code).toBe(200);
    const row = h.db.rows('demo_item').find((r: any) => r.item_id === '1');
    expect(Number(row.deleted)).toBe(1);
    expect(h.db.rows('demo_item')).toHaveLength(4);
  });

  it('status 修改状态', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'put', '/demo/status', makeCtx({
      request: { body: { itemId: '1', status: '1' } },
    }));
    expect(ctx.body.code).toBe(200);
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').status).toBe('1');
  });
});

// ====== b. GET /:id ======

describe('b. GET /:id 详情', () => {
  it('返回当前租户未删除数据的详情', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/:id', makeCtx({ params: { id: '1' } }));
    expect(ctx.body.code).toBe(200);
    expect(ctx.body.data.itemId).toBe('1');
  });

  it('跨租户详情返回 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'get', '/demo/:id', makeCtx({ params: { id: '3' } })))
      .rejects.toMatchObject({ status: 404 });
  });

  it('软删除数据详情返回 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'get', '/demo/:id', makeCtx({ params: { id: '4' } })))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ====== c. 跨租户写操作被阻止 ======

describe('c. 跨租户修改/删除/状态被阻止', () => {
  it('edit 其他租户记录 → 404 且数据未被修改', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '3', itemName: 'hacked' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '3').item_name).toBe('c');
  });

  it('remove 其他租户记录 → 404 且数据未被删除', async () => {
    const router = buildRouter();
    await expect(call(router, 'delete', '/demo/remove', makeCtx({
      request: { body: { ids: ['3'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(Number(h.db.rows('demo_item').find((r: any) => r.item_id === '3').deleted)).toBe(0);
  });

  it('status 其他租户记录 → 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/status', makeCtx({
      request: { body: { itemId: '3', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '3').status).toBe('0');
  });

  it('混合批量删除包含跨租户 ID → 404，当前租户数据也不会被误删', async () => {
    const router = buildRouter();
    await expect(call(router, 'delete', '/demo/remove', makeCtx({
      request: { body: { ids: ['1', '3'] } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').filter((r: any) => Number(r.deleted) === 1).map((r: any) => r.item_id)).toEqual(['4']);
  });
});

// ====== d. 请求体 tenantId 不可覆盖服务端租户 ======

describe('d. 租户写入 fail-closed', () => {
  it('add 请求体 tenantId 被忽略，写入服务端租户', async () => {
    const router = buildRouter();
    await call(router, 'post', '/demo/add', makeCtx({
      request: { body: { itemName: 'evil', tenantId: 't2', tenant_id: 't2' } },
    }));
    const created = h.db.rows('demo_item').find((r: any) => r.item_name === 'evil');
    expect(created.tenant_id).toBe('t1');
  });

  it('edit 请求体 tenantId 被忽略，不会迁移租户', async () => {
    const router = buildRouter();
    await call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '1', itemName: 'x', tenantId: 't2' } },
    }));
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').tenant_id).toBe('t1');
  });

  it('缺少租户上下文时写入被拒绝', async () => {
    h.tenantId = null;
    const router = buildRouter();
    await expect(call(router, 'post', '/demo/add', makeCtx({
      request: { body: { itemName: 'no-tenant' } },
    }))).rejects.toThrow();
    expect(h.db.rows('demo_item').some((r: any) => r.item_name === 'no-tenant')).toBe(false);
  });
});

// ====== e. 软删除数据不可操作 ======

describe('e. 软删除数据不可查询/编辑/删除/改状态', () => {
  it('list 不返回软删除数据', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/list', makeCtx());
    expect(ctx.body.data.some((r: any) => r.itemId === '4')).toBe(false);
  });

  it('edit 软删除数据 → 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '4', itemName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('remove 软删除数据（重复删除）→ 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'delete', '/demo/remove', makeCtx({
      request: { body: { ids: ['4'] } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('status 软删除数据 → 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/status', makeCtx({
      request: { body: { itemId: '4', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '4').status).toBe('0');
  });
});

// ====== f. 字段白名单 ======

describe('f. 非白名单字段不能写入', () => {
  it('add 过滤未授权字段与系统字段', async () => {
    const router = buildRouter();
    await call(router, 'post', '/demo/add', makeCtx({
      request: { body: { itemName: 'n', evilColumn: 'boom', createBy: 'hacker', deleted: 1, createTime: '2000-01-01' } },
    }));
    const created = h.db.rows('demo_item').find((r: any) => r.item_name === 'n');
    expect(created).toBeDefined();
    expect(created.evil_column).toBeUndefined();
    expect(created.create_by).toBeUndefined();
    expect(Number(created.deleted)).toBe(0);
    expect(created.create_time).toBeUndefined();
  });

  it('edit 不能改 deleted / create_by / 主键', async () => {
    const router = buildRouter();
    await call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '1', itemName: 'ok', deleted: 1, createBy: 'x', evilColumn: 'y' } },
    }));
    const row = h.db.rows('demo_item').find((r: any) => r.item_id === '1');
    expect(Number(row.deleted)).toBe(0);
    expect(row.create_by).toBe('u1');
    expect(row.evil_column).toBeUndefined();
    expect(row.item_name).toBe('ok');
  });

  it('edit 全部字段被过滤 → 400', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '1', deleted: 1, tenantId: 't2' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('未配置 createFields → 拒绝写入', async () => {
    const router = defineCrudModule({ prefix: '/nc', table: 'demo_item', pkField: 'item_id' });
    await expect(call(router, 'post', '/nc/add', makeCtx({ request: { body: { item_name: 'x' } } })))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ====== g. Data Scope ======

describe('g. Data Scope 真正生效', () => {
  const deptUser = () => makeCtx({
    state: {
      user: {
        userId: 'u1', tenantId: 't1', username: 'dept-user',
        deptId: 'd1', roles: [{ dataScope: 'DEPT' }],
      },
    },
  });

  it('list 只返回部门范围内数据', async () => {
    const router = buildRouter({ dataScope: {} });
    const ctx = await call(router, 'get', '/demo/list', deptUser());
    expect(ctx.body.data.map((r: any) => r.itemId)).toEqual(['1']);
  });

  it('edit 部门范围外数据 → 404', async () => {
    const router = buildRouter({ dataScope: {} });
    const ctx = deptUser();
    ctx.request.body = { itemId: '2', itemName: 'out-of-scope' };
    await expect(call(router, 'put', '/demo/edit', ctx)).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '2').item_name).toBe('b');
  });

  it('edit 部门范围内数据成功', async () => {
    const router = buildRouter({ dataScope: {} });
    const ctx = deptUser();
    ctx.request.body = { itemId: '1', itemName: 'in-scope' };
    const res = await call(router, 'put', '/demo/edit', ctx);
    expect(res.body.code).toBe(200);
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').item_name).toBe('in-scope');
  });

  it('remove 部门范围外数据 → 404', async () => {
    const router = buildRouter({ dataScope: {} });
    const ctx = deptUser();
    ctx.request.body = { ids: ['2'] };
    await expect(call(router, 'delete', '/demo/remove', ctx)).rejects.toMatchObject({ status: 404 });
  });

  it('未配置 dataScope 时不应用数据权限', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'get', '/demo/list', deptUser());
    expect(ctx.body.total).toBe(2);
  });
});

// ====== h. 批量删除 ======

describe('h. 批量删除', () => {
  it('批量软删除同租户数据', async () => {
    const router = buildRouter();
    const ctx = await call(router, 'delete', '/demo/remove', makeCtx({
      request: { body: { ids: ['1', '2'] } },
    }));
    expect(ctx.body.code).toBe(200);
    expect(ctx.body.data.deleted).toBe(2);
    expect(h.db.rows('demo_item').filter((r: any) => Number(r.deleted) === 1).map((r: any) => r.item_id).sort())
      .toEqual(['1', '2', '4']);
  });

  it('硬删除模式（softDelete:false）真正删除行', async () => {
    const router = buildRouter({ softDelete: false });
    await call(router, 'delete', '/demo/remove', makeCtx({ request: { body: { ids: ['1'] } } }));
    expect(h.db.rows('demo_item').some((r: any) => r.item_id === '1')).toBe(false);
  });
});

// ====== i. 事务 ======

describe('i. 事务成功、回滚与提交后回调', () => {
  it('事务提交后执行 onWrite / onTransactionCommitted', async () => {
    const onWrite = vi.fn();
    const onCommitted = vi.fn();
    const router = buildRouter({ transactional: true, onWrite, onTransactionCommitted: onCommitted });
    await call(router, 'post', '/demo/add', makeCtx({ request: { body: { itemName: 'tx-ok' } } }));
    expect(h.db.transactionCount).toBe(1);
    expect(h.db.commitCount).toBe(1);
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it('事务回滚时不执行回调，且数据不落库', async () => {
    const onWrite = vi.fn();
    const onCommitted = vi.fn();
    const router = buildRouter({
      transactional: true,
      onWrite,
      onTransactionCommitted: onCommitted,
      createFields: ['item_id', 'item_name', 'status'],
    });
    await call(router, 'post', '/demo/add', makeCtx({
      request: { body: { itemId: '1', itemName: 'duplicate-pk' } },
    })).catch(() => undefined);
    // 主键冲突 → insert 抛错 → 回滚
    expect(h.db.rollbackCount).toBe(1);
    expect(h.db.commitCount).toBe(0);
    expect(onWrite).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').item_name).toBe('a');
  });

  it('事务内 edit 仍带租户与软删除条件（不会丢条件）', async () => {
    const router = buildRouter({ transactional: true });
    // 跨租户在事务内依旧 404
    await expect(call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '3', itemName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '3').item_name).toBe('c');
    // 软删除记录同样 404
    await expect(call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '4', itemName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('写操作失败时不触发 onWrite（非事务模式）', async () => {
    const onWrite = vi.fn();
    const router = buildRouter({ onWrite });
    await call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: '999', itemName: 'x' } },
    })).catch(() => undefined);
    expect(onWrite).not.toHaveBeenCalled();
  });
});

// ====== j. 404 ======

describe('j. 资源不存在返回 404', () => {
  it('edit 不存在的记录 → 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/edit', makeCtx({
      request: { body: { itemId: 'not-exist', itemName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('remove 不存在的记录 → 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'delete', '/demo/remove', makeCtx({
      request: { body: { ids: ['not-exist'] } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('status 不存在的记录 → 404', async () => {
    const router = buildRouter();
    await expect(call(router, 'put', '/demo/status', makeCtx({
      request: { body: { itemId: 'not-exist', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('缺少 ids → 400', async () => {
    const router = buildRouter();
    await expect(call(router, 'delete', '/demo/remove', makeCtx({ request: { body: {} } })))
      .rejects.toMatchObject({ status: 400 });
  });
});
