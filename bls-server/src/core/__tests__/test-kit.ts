/**
 * 路由测试工具：直接调用 koa-router 中间件链，配合 FakeDb 做安全语义断言。
 *
 * 注意：各测试文件仍需在顶层自行声明 vi.mock（vitest 要求提升到模块作用域）。
 */
import { FakeDb, type Row } from './fake-db';

export function makeCtx(overrides: Record<string, any> = {}): any {
  const ctx: any = {
    params: {},
    query: {},
    request: { body: undefined },
    state: { user: { userId: 'u1', tenantId: 't1', username: 'tester' } },
    status: 200,
    body: undefined,
    headers: {},
    ip: '127.0.0.1',
    path: '/',
    method: 'GET',
    set: () => undefined,
    ...overrides,
  };
  // 与 Koa 一致：headers 大小写不敏感
  ctx.get = (name: string) => {
    const key = String(name).toLowerCase();
    return ctx.headers?.[key] ?? '';
  };
  return ctx;
}

export function compose(middlewares: any[]) {
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

/** 调用路由并返回 ctx（抛错的场景请用 await expect(...).rejects） */
export async function callRoute(router: any, method: string, fullPath: string, ctx: any): Promise<any> {
  const layer: any = (router.stack ?? []).find(
    (l: any) => l.path === fullPath && l.methods.map((m: string) => m.toLowerCase()).includes(method),
  );
  if (!layer) {
    const registered = (router.stack ?? []).map((l: any) => `${l.methods.join('/')} ${l.path}`).join(', ');
    throw new Error(`route not found: ${method.toUpperCase()} ${fullPath}; registered: ${registered}`);
  }
  await compose(layer.stack)(ctx);
  return ctx;
}

export function seedDb(tables: Record<string, Row[]>): FakeDb {
  const db = new FakeDb();
  for (const [table, rows] of Object.entries(tables)) db.seed(table, rows);
  return db;
}
