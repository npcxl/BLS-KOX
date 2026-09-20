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

import {
  defineCrudModule,
  defineCrudConfig,
  CrudConfigError,
  extractIds,
  pickFields,
  normalizeStatus,
} from '../crud';
import { FakeDb } from './fake-db';
import Router from 'koa-router';

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
  {
    item_id: '1', tenant_id: 't1', item_name: 'a', status: '0', deleted: 0, dept_id: 'd1', create_by: 'u1',
    product_name: '苹果', price: 10, secret_key: 'sk-aaaa1111', category_id: 'c1', remark: null,
    create_time: '2026-01-01 00:00:00', update_time: '2026-01-01 00:00:00',
  },
  {
    item_id: '2', tenant_id: 't1', item_name: 'b', status: '0', deleted: 0, dept_id: 'd2', create_by: 'u2',
    product_name: '香蕉', price: 20, secret_key: 'sk-bbbb2222', category_id: 'c2', remark: null,
    create_time: '2026-01-02 00:00:00', update_time: '2026-01-02 00:00:00',
  },
  {
    item_id: '3', tenant_id: 't2', item_name: 'c', status: '0', deleted: 0, dept_id: 'd1', create_by: 'u9',
    product_name: '樱桃', price: 30, secret_key: 'sk-cccc3333', category_id: 'c1', remark: null,
    create_time: '2026-01-03 00:00:00', update_time: '2026-01-03 00:00:00',
  },
  {
    item_id: '4', tenant_id: 't1', item_name: 'd', status: '0', deleted: 1, dept_id: 'd1', create_by: 'u1',
    product_name: '已删除', price: 40, secret_key: 'sk-dddd4444', category_id: 'c1', remark: null,
    create_time: '2026-01-04 00:00:00', update_time: '2026-01-04 00:00:00',
  },
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

  it('未声明任何可写字段 → 启动阶段即失败（不注册不安全端点）', () => {
    expect(() => defineCrudModule({ prefix: '/nc', table: 'demo_item', pkField: 'item_id' }))
      .toThrow(CrudConfigError);
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

  it('onWrite 在写入成功后执行（此时数据已落库）', async () => {
    let rowsVisibleInHook = -1;
    const router = buildRouter({
      onWrite: () => {
        rowsVisibleInHook = h.db.rows('demo_item').filter((row: any) => row.item_name === '钩子').length;
      },
    });
    await call(router, 'post', '/demo/add', makeCtx({ request: { body: { itemName: '钩子' } } }));
    expect(rowsVisibleInHook).toBe(1);
  });

  it('edit 命中 0 行（404）时不执行 onWrite', async () => {
    const onWrite = vi.fn();
    const router = buildFieldsRouter({ onWrite });
    await expect(call(router, 'put', `${SF}/edit`, makeCtx({
      request: { body: { itemId: '999', price: 1 } },
    }))).rejects.toMatchObject({ status: 404 });
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

// ==================================================================
// 配置式 CRUD：fields / actions / createDefaults
// ==================================================================

/** fields 声明（标准单表模块的单一字段来源） */
const FIELD_DEFS: Record<string, any> = {
  product_name: { type: 'string', required: true, create: true, update: true, search: true, maxLength: 100, description: '商品名称' },
  category_id: { type: 'string', create: true, update: true, filter: true, nullable: true },
  price: { type: 'number', required: true, create: true, update: true, min: 0, max: 100000 },
  status: { type: 'enum', values: ['0', '1'], create: true, update: true, filter: true, status: true },
  secret_key: { type: 'string', create: true, update: true, select: false },
  remark: { type: 'string', create: true, update: true, nullable: true },
  create_time: { type: 'datetime', select: true },
  update_time: { type: 'datetime', select: true },
};

function fieldsCfg(extra: Record<string, any> = {}) {
  return {
    prefix: '/demo',
    table: 'demo_item',
    pkField: 'item_id',
    name: '商品',
    fields: FIELD_DEFS,
    createDefaults: { status: '0' },
    ...extra,
  };
}

function buildFieldsRouter(extra: Record<string, any> = {}): Router {
  return defineCrudModule(fieldsCfg(extra) as any);
}

/** 已注册端点清单：`method /path`（过滤 HEAD） */
function endpoints(router: Router): string[] {
  return (router as any).stack.map((layer: any) => {
    const methods = layer.methods.map((m: string) => m.toLowerCase()).filter((m: string) => m !== 'head');
    return `${methods.join(',')} ${layer.path}`;
  });
}

const SF = '/demo';

async function addRow(router: Router, body: Record<string, any>) {
  const ctx = makeCtx({ request: { body } });
  await call(router, 'post', `${SF}/add`, ctx);
  return ctx.body.data.itemId as string;
}

describe('配置式 CRUD - 端点生成与 actions 开关', () => {
  it('1. 只写 fields 配置即可生成六个端点', () => {
    expect(endpoints(buildFieldsRouter()).sort()).toEqual([
      'delete /demo/remove',
      'get /demo/:id',
      'get /demo/list',
      'post /demo/add',
      'put /demo/edit',
      'put /demo/status',
    ].sort());
  });

  it('9. actions.status=false 时不注册 /status', () => {
    const list = endpoints(buildFieldsRouter({ actions: { status: false } }));
    expect(list).not.toContain('put /demo/status');
    expect(list).toContain('put /demo/edit');
  });

  it('10. actions 关闭的端点一律不注册', () => {
    const router = buildFieldsRouter({
      actions: { list: false, detail: false, add: false, edit: false, remove: false },
    });
    expect(endpoints(router)).toEqual(['put /demo/status']);
    expect(endpoints(buildFieldsRouter({ actions: { detail: false } }))).not.toContain('get /demo/:id');
    expect(endpoints(buildFieldsRouter({ actions: { remove: false } }))).not.toContain('delete /demo/remove');
    expect(endpoints(buildFieldsRouter({ actions: { add: false } }))).not.toContain('post /demo/add');
  });

  it('10b. list=false 时不注册列表端点', () => {
    expect(endpoints(buildFieldsRouter({ actions: { list: false } }))).not.toContain('get /demo/list');
  });
});

describe('配置式 CRUD - 自动主键 / 租户 / 默认值', () => {
  it('2. add 自动生成主键并注入服务端租户', async () => {
    const router = buildFieldsRouter();
    const id = await addRow(router, { productName: '新商品', price: 12.5 });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(['1', '2', '3', '4']).not.toContain(id);

    const created = h.db.rows('demo_item').find((row: any) => row.item_id === id);
    expect(created.tenant_id).toBe('t1');
    expect(Number(created.deleted)).toBe(0);
    expect(created.product_name).toBe('新商品');
    expect(created.price).toBe(12.5);
  });

  it('3. createDefaults 生效（对象形式）', async () => {
    const router = buildFieldsRouter();
    const id = await addRow(router, { productName: '默认状态商品', price: 1 });
    expect(h.db.rows('demo_item').find((row: any) => row.item_id === id).status).toBe('0');
  });

  it('3b. createDefaults 生效（函数形式）且审计字段只能由服务端写入', async () => {
    const router = buildFieldsRouter({
      createDefaults: async (ctx: any) => ({ status: '1', create_by: ctx.state.user.userId }),
    });
    const id = await addRow(router, {
      productName: '函数默认值', price: 2, createBy: 'hacker', create_by: 'hacker',
    });
    const created = h.db.rows('demo_item').find((row: any) => row.item_id === id);
    expect(created.status).toBe('1');
    expect(created.create_by).toBe('u1');
  });

  it('3c. 字段级 default 也会写入', async () => {
    const router = defineCrudModule(fieldsCfg({
      fields: {
        ...FIELD_DEFS,
        remark: { type: 'string', create: true, update: true, nullable: true, default: '默认备注' },
      },
    }) as any);
    const id = await addRow(router, { productName: '默认备注商品', price: 3 });
    expect(h.db.rows('demo_item').find((row: any) => row.item_id === id).remark).toBe('默认备注');
  });

  it('16. 请求体 tenantId/tenant_id 无法覆盖服务端租户', async () => {
    const router = buildFieldsRouter();
    const id = await addRow(router, {
      productName: '越权租户', price: 1, tenantId: 't2', tenant_id: 't2', deleted: 1,
    });
    const created = h.db.rows('demo_item').find((row: any) => row.item_id === id);
    expect(created.tenant_id).toBe('t1');
    expect(Number(created.deleted)).toBe(0);
  });
});

describe('配置式 CRUD - fields 派生白名单 / 搜索 / 过滤 / 投影', () => {
  it('4. edit 自动从 fields 推导更新白名单', async () => {
    const router = buildFieldsRouter();
    await call(router, 'put', `${SF}/edit`, makeCtx({
      request: { body: { itemId: '1', productName: '改名', secretKey: 'sk-new', price: 99 } },
    }));
    const row = h.db.rows('demo_item').find((r: any) => r.item_id === '1');
    expect(row.product_name).toBe('改名');
    expect(row.secret_key).toBe('sk-new');
    expect(row.price).toBe(99);
  });

  it('4a. edit 缺少主键 → 400（业务字段为 partial）', async () => {
    const router = buildFieldsRouter();
    await expect(call(router, 'put', `${SF}/edit`, makeCtx({
      request: { body: { productName: '无主键' } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('4b. 只读字段（未声明 update）在 edit 中被忽略，全被忽略时返回 400', async () => {
    const router = buildFieldsRouter();
    await expect(call(router, 'put', `${SF}/edit`, makeCtx({
      request: { body: { itemId: '1', createTime: '2020-01-01 00:00:00', itemName: 'x' } },
    }))).rejects.toMatchObject({ status: 400 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').create_time).toBe('2026-01-01 00:00:00');
  });

  it('5. search:true 支持 keyword 模糊搜索', async () => {
    const router = buildFieldsRouter();
    const ctx = await call(router, 'get', `${SF}/list`, makeCtx({ query: { keyword: '苹果' } }));
    expect(ctx.body.total).toBe(1);
    expect(ctx.body.data[0].productName).toBe('苹果');
  });

  it('6. filter:true 支持精确筛选（snake 与 camel 均可）', async () => {
    const router = buildFieldsRouter();
    const bySnake = await call(router, 'get', `${SF}/list`, makeCtx({ query: { category_id: 'c2' } }));
    expect(bySnake.body.total).toBe(1);
    const byCamel = await call(router, 'get', `${SF}/list`, makeCtx({ query: { categoryId: 'c1' } }));
    expect(byCamel.body.total).toBe(1);
    const byStatus = await call(router, 'get', `${SF}/list`, makeCtx({ query: { status: '0' } }));
    expect(byStatus.body.total).toBe(2);
  });

  it('6b. 非白名单 query 参数被忽略', async () => {
    const router = buildFieldsRouter();
    const ctx = await call(router, 'get', `${SF}/list`, makeCtx({ query: { secretKey: 'sk-aaaa1111', evil: '1' } }));
    expect(ctx.body.total).toBe(2);
  });

  it('7. select:false 字段不出现在 list（且只返回声明字段+主键）', async () => {
    const router = buildFieldsRouter();
    const ctx = await call(router, 'get', `${SF}/list`, makeCtx());
    expect(ctx.body.data).toHaveLength(2);
    for (const row of ctx.body.data) {
      expect(row.secretKey).toBeUndefined();
      expect(row.secret_key).toBeUndefined();
      expect(row.tenantId).toBeUndefined();
      expect(row.deleted).toBeUndefined();
      expect(row.itemName).toBeUndefined();
      expect(row.itemId).toBeDefined();
    }
    expect(ctx.body.data[0].productName).toBeDefined();
  });

  it('8. select:false 字段不出现在 detail', async () => {
    const router = buildFieldsRouter();
    const ctx = await call(router, 'get', `${SF}/:id`, makeCtx({ params: { id: '1' } }));
    expect(ctx.body.data.secretKey).toBeUndefined();
    expect(ctx.body.data.productName).toBe('苹果');
    expect(ctx.body.data.itemId).toBe('1');
  });
});

describe('配置式 CRUD - 自动 Zod 校验', () => {
  it('11. required 字段缺失 → 400（含字段路径）', async () => {
    const router = buildFieldsRouter();
    const err: any = await call(router, 'post', `${SF}/add`, makeCtx({ request: { body: { price: 1 } } }))
      .catch((e) => e);
    expect(err.status).toBe(400);
    expect(JSON.stringify(err.details)).toContain('productName');
  });

  it('11b. 字符串 maxLength 生效', async () => {
    const router = buildFieldsRouter();
    await expect(call(router, 'post', `${SF}/add`, makeCtx({
      request: { body: { productName: 'x'.repeat(101), price: 1 } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('12. enum 只接受声明值', async () => {
    const router = buildFieldsRouter();
    await expect(call(router, 'post', `${SF}/add`, makeCtx({
      request: { body: { productName: '枚举', price: 1, status: '9' } },
    }))).rejects.toMatchObject({ status: 400 });
    const ok = makeCtx({ request: { body: { productName: '枚举', price: 1, status: '1' } } });
    await call(router, 'post', `${SF}/add`, ok);
    expect(ok.body.code).toBe(200);
  });

  it('13. number 类型与 min/max 生效', async () => {
    const router = buildFieldsRouter();
    for (const price of [-1, 100001, 'abc', null]) {
      await expect(call(router, 'post', `${SF}/add`, makeCtx({
        request: { body: { productName: '价格校验', price } },
      }))).rejects.toMatchObject({ status: 400 });
    }
  });

  it('13b. integer / boolean / datetime / json 类型校验', async () => {
    const router = defineCrudModule({
      prefix: '/types',
      table: 'demo_item',
      pkField: 'item_id',
      fields: {
        qty: { type: 'integer', create: true, update: true, min: 0, max: 10 },
        enabled: { type: 'boolean', create: true, update: true },
        happen_at: { type: 'datetime', create: true, update: true },
        payload: { type: 'json', create: true, update: true },
      },
      actions: { list: false, detail: false, edit: false, remove: false, status: false },
    } as any);

    const bad = [
      { qty: 1.5 }, { qty: 11 }, { enabled: 'yes' },
      { happen_at: 'not-a-date' }, { payload: 123 },
    ];
    for (const body of bad) {
      await expect(call(router, 'post', '/types/add', makeCtx({ request: { body } })))
        .rejects.toMatchObject({ status: 400 });
    }
    const ok = makeCtx({
      request: { body: { qty: 3, enabled: true, happen_at: '2026-09-20 10:00:00', payload: { a: 1 } } },
    });
    await call(router, 'post', '/types/add', ok);
    expect(ok.body.code).toBe(200);
  });

  it('13c. nullable 与 optional 区分：可显式 null，不可为空字段传 null', async () => {
    const router = buildFieldsRouter();
    const ok = makeCtx({ request: { body: { productName: '可空', price: 1, remark: null, categoryId: null } } });
    await call(router, 'post', `${SF}/add`, ok);
    expect(ok.body.code).toBe(200);
    // price 未声明 nullable → null 被拒绝
    await expect(call(router, 'post', `${SF}/add`, makeCtx({
      request: { body: { productName: '不可空', price: null } },
    }))).rejects.toMatchObject({ status: 400 });
  });

  it('unknownFields=reject 时拒绝未声明字段；默认 ignore 安全忽略', async () => {
    const reject = buildFieldsRouter({ unknownFields: 'reject' });
    const err: any = await call(reject, 'post', `${SF}/add`, makeCtx({
      request: { body: { productName: 'x', price: 1, evilColumn: 'boom' } },
    })).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).toContain('evilColumn');

    const ignore = buildFieldsRouter();
    const ctx = makeCtx({ request: { body: { productName: 'y', price: 1, evilColumn: 'boom' } } });
    await call(ignore, 'post', `${SF}/add`, ctx);
    const created = h.db.rows('demo_item').find((r: any) => r.item_id === ctx.body.data.itemId);
    expect(created.evil_column).toBeUndefined();
  });
});

describe('配置式 CRUD - 状态端点', () => {
  it('status 使用 fields 声明的枚举值并套用租户/软删除', async () => {
    const router = buildFieldsRouter();
    await call(router, 'put', `${SF}/status`, makeCtx({ request: { body: { itemId: '1', status: '1' } } }));
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').status).toBe('1');

    await expect(call(router, 'put', `${SF}/status`, makeCtx({
      request: { body: { itemId: '1', status: '2' } },
    }))).rejects.toMatchObject({ status: 400 });
    // 软删除数据
    await expect(call(router, 'put', `${SF}/status`, makeCtx({
      request: { body: { itemId: '4', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });
  });
});

describe('配置式 CRUD - 租户隔离 / 软删除 / Data Scope', () => {
  it('17. 跨租户 list/detail/edit/remove/status 全部被阻止', async () => {
    const router = buildFieldsRouter();
    const list = await call(router, 'get', `${SF}/list`, makeCtx());
    expect(list.body.data.map((row: any) => row.itemId).sort()).toEqual(['1', '2']);

    await expect(call(router, 'get', `${SF}/:id`, makeCtx({ params: { id: '3' } })))
      .rejects.toMatchObject({ status: 404 });
    await expect(call(router, 'put', `${SF}/edit`, makeCtx({
      request: { body: { itemId: '3', productName: 'hacked' } },
    }))).rejects.toMatchObject({ status: 404 });
    await expect(call(router, 'delete', `${SF}/remove`, makeCtx({
      request: { body: { ids: ['3'] } },
    }))).rejects.toMatchObject({ status: 404 });
    await expect(call(router, 'put', `${SF}/status`, makeCtx({
      request: { body: { itemId: '3', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });

    const row = h.db.rows('demo_item').find((r: any) => r.item_id === '3');
    expect(row.product_name).toBe('樱桃');
    expect(Number(row.deleted)).toBe(0);
    expect(row.status).toBe('0');
  });

  it('18. 软删除数据不可查询/编辑/删除/改状态', async () => {
    const router = buildFieldsRouter();
    const list = await call(router, 'get', `${SF}/list`, makeCtx());
    expect(list.body.data.some((row: any) => row.itemId === '4')).toBe(false);
    await expect(call(router, 'get', `${SF}/:id`, makeCtx({ params: { id: '4' } })))
      .rejects.toMatchObject({ status: 404 });
    await expect(call(router, 'put', `${SF}/edit`, makeCtx({
      request: { body: { itemId: '4', productName: 'x' } },
    }))).rejects.toMatchObject({ status: 404 });
    await expect(call(router, 'delete', `${SF}/remove`, makeCtx({
      request: { body: { ids: ['4'] } },
    }))).rejects.toMatchObject({ status: 404 });
    await expect(call(router, 'put', `${SF}/status`, makeCtx({
      request: { body: { itemId: '4', status: '1' } },
    }))).rejects.toMatchObject({ status: 404 });
  });

  it('19. Data Scope 在事务内外均生效', async () => {
    const deptUser = () => makeCtx({
      state: { user: { userId: 'u1', tenantId: 't1', deptId: 'd1', roles: [{ dataScope: 'DEPT' }] } },
    });

    // 非事务
    const plain = buildFieldsRouter({ dataScope: {} });
    const list = await call(plain, 'get', `${SF}/list`, deptUser());
    expect(list.body.data.map((row: any) => row.itemId)).toEqual(['1']);

    // 事务内（写操作）
    const tx = buildFieldsRouter({ dataScope: {}, transactional: true });
    await expect(call(tx, 'put', `${SF}/edit`, (() => {
      const ctx = deptUser();
      ctx.request.body = { itemId: '2', productName: 'out-of-scope' };
      return ctx;
    })())).rejects.toMatchObject({ status: 404 });
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '2').product_name).toBe('香蕉');

    const inScope = deptUser();
    inScope.request.body = { itemId: '1', productName: 'in-scope' };
    await call(tx, 'put', `${SF}/edit`, inScope);
    expect(h.db.rows('demo_item').find((r: any) => r.item_id === '1').product_name).toBe('in-scope');

    // 批量删除在事务内同样 fail-closed
    await expect(call(tx, 'delete', `${SF}/remove`, (() => {
      const ctx = deptUser();
      ctx.request.body = { ids: ['1', '2'] };
      return ctx;
    })())).rejects.toMatchObject({ status: 404 });
  });

  it('19b. 事务提交后才执行回调（fields 配置）', async () => {
    const onCommitted = vi.fn();
    const router = buildFieldsRouter({ transactional: true, onTransactionCommitted: onCommitted });
    await call(router, 'post', `${SF}/add`, makeCtx({ request: { body: { productName: '事务', price: 1 } } }));
    expect(h.db.commitCount).toBeGreaterThan(0);
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });
});

describe('配置式 CRUD - 配置校验与向后兼容', () => {
  it('14. 非法表名在启动阶段失败', () => {
    expect(() => defineCrudConfig({
      table: 'demo-item; drop table x',
      pkField: 'item_id',
      fields: FIELD_DEFS,
    } as any)).toThrow(CrudConfigError);
  });

  it('15. 非法字段名在启动阶段失败', () => {
    expect(() => defineCrudConfig({
      table: 'demo_item',
      pkField: 'item_id',
      fields: { 'bad-name': { type: 'string', create: true } },
    } as any)).toThrow(/bad-name/);
  });

  it('22. 配置错误信息包含模块名、表名与字段名', () => {
    let message = '';
    try {
      defineCrudConfig({
        table: 'demo_item',
        pkField: 'item_id',
        name: '商品',
        fields: { price: { type: 'number', create: true, update: true, values: ['a'] } },
      } as any);
    } catch (error: any) {
      message = error.message;
    }
    expect(message).toContain('商品');
    expect(message).toContain('demo_item');
    expect(message).toContain('price');
    expect(message).toContain('values');
  });

  it('14b. 其他启动校验：pkField / statusField / 无 create 字段 / 空 fields', () => {
    const base = { table: 'demo_item', fields: FIELD_DEFS } as any;
    expect(() => defineCrudConfig({ ...base, pkField: '1bad' } as any)).toThrow(/pkField/);
    expect(() => defineCrudConfig({
      table: 'demo_item', pkField: 'item_id',
      fields: { name: { type: 'string', create: true } },
    } as any)).toThrow(/statusField/);
    expect(() => defineCrudConfig({
      table: 'demo_item', pkField: 'item_id',
      fields: { create_time: { type: 'datetime', select: true } },
      actions: { status: false },
    } as any)).toThrow(/create 字段/);
    expect(() => defineCrudConfig({ table: 'demo_item', pkField: 'item_id', fields: {} } as any)).toThrow(/fields/);
  });

  it('14c. createDefaults 引用未声明字段会启动失败', () => {
    expect(() => defineCrudConfig({
      table: 'demo_item', pkField: 'item_id', fields: FIELD_DEFS,
      createDefaults: { not_declared: 1 },
    } as any)).toThrow(/not_declared/);
  });

  it('14d. 使用 fields 时旧数组引用未声明字段会启动失败', () => {
    expect(() => defineCrudConfig({
      table: 'demo_item', pkField: 'item_id', fields: FIELD_DEFS,
      createFields: ['ghost_column'],
    } as any)).toThrow(/ghost_column/);
  });

  it('20. 旧数组式配置继续正常运行（无 fields）', async () => {
    const legacy = buildRouter();
    expect(endpoints(legacy).sort()).toEqual([
      'delete /demo/remove',
      'get /demo/:id',
      'get /demo/list',
      'post /demo/add',
      'put /demo/edit',
      'put /demo/status',
    ].sort());
    const ctx = await call(legacy, 'get', '/demo/list', makeCtx());
    expect(ctx.body.total).toBe(2);
    expect(ctx.body.data[0].itemName).toBeDefined();
  });

  it('20b. fields 与旧数组同时存在时，显式数组优先', async () => {
    const router = buildFieldsRouter({ createFields: ['product_name'], updateFields: ['price'] });
    // createDefaults 中的 status 仍会写入，但客户端不能提交 price
    const ctx = makeCtx({ request: { body: { productName: '仅名称', price: 5 } } });
    await call(router, 'post', `${SF}/add`, ctx);
    const created = h.db.rows('demo_item').find((r: any) => r.item_id === ctx.body.data.itemId);
    expect(created.product_name).toBe('仅名称');
    expect(created.price).toBeUndefined();
    expect(created.status).toBe('0');
  });

  it('21. 混合模式：自定义 Router 优先匹配，CRUD 兜底', async () => {
    const custom = new Router({ prefix: '/demo' });
    custom.get('/list', async (ctx: any) => {
      ctx.body = { code: 200, message: 'custom-list', data: [] };
    });

    const crud = buildFieldsRouter();
    const parent = new Router();
    parent.use(custom.routes(), custom.allowedMethods());
    parent.use(crud.routes(), crud.allowedMethods());
    const dispatch = parent.routes();

    // 被覆盖的端点 → 走自定义 Router
    const overridden: any = {
      method: 'GET', path: '/demo/list', params: {}, query: {}, headers: {},
      request: { body: undefined }, state: { user: { userId: 'u1', tenantId: 't1' } },
      status: 404, body: undefined, set: () => undefined, get: () => '',
    };
    await dispatch(overridden, async () => undefined);
    expect(overridden.body.message).toBe('custom-list');

    // 未被覆盖的端点 → 走 CRUD 兜底
    const fallback: any = {
      method: 'GET', path: '/demo/:id', params: {}, query: {}, headers: {},
      request: { body: undefined }, state: { user: { userId: 'u1', tenantId: 't1' } },
      status: 404, body: undefined, set: () => undefined, get: () => '',
    };
    // 手动注入 params（koa-router 会从 path 解析，这里显式替换为具体路径）
    fallback.path = '/demo/1';
    await dispatch(fallback, async () => undefined);
    expect(fallback.body.code).toBe(200);
    expect(fallback.body.data.itemId).toBe('1');
  });
});
