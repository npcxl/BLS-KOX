import mysql from 'mysql2/promise';
import { createPool as createMysqlPool } from 'mysql2';
import { env } from '../config/env';
import { dbQueryDurationSeconds, dbQueryErrorsTotal } from '../observability/metrics';
import { writeSqlError } from './sql-audit';

/**
 * 懒加载连接池（阶段七）
 *
 * 重要：**模块加载时不再创建连接池**。仅 import 本模块（例如单元测试通过
 * service → database 的间接依赖）不会建立任何 MySQL 连接；只有在真正执行
 * query/execute/transaction/getDb 时才创建。
 *
 * 这保证 `npm run test`（单元测试）不需要、也不会连接真实 MySQL。
 */

const commonDbConfig = {
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,

  connectionLimit: env.db.connectionLimit || 10,
  waitForConnections: true,
  queueLimit: 0,

  // TCP keep-alive，防止中间网络设备断开空闲连接
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000, // 30s 后开始发送 keep-alive 探测包

  // 连接空闲 60s 后释放，避免占用过久
  idleTimeout: 60_000,
  // 连接超时设置
  connectTimeout: 15_000,

  namedPlaceholders: true,
  timezone: '+08:00',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  charset: 'utf8mb4',
};

function isConnectionResetError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('ECONNRESET') ||
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ETIMEDOUT') ||
    err.message.includes('PROTOCOL_CONNECTION_LOST') ||
    err.message.includes('Connection lost')
  );
}

function attachPoolEvents(pool: any, tag: string): void {
  pool.on('connection', (connection: any) => {
    console.log('[%s] new connection created, threadId=%d', tag, connection.threadId);
    connection.on('error', (err: Error) => {
      console.error('[%s] connection %d error:', tag, connection.threadId, err.message);
      if (isConnectionResetError(err)) {
        try { connection.destroy(); } catch { /* ignore */ }
      }
    });
  });
  pool.on('error', (err: Error) => {
    console.error('[%s] pool error:', tag, err.message);
  });
  pool.on('enqueue', () => {
    console.log('[%s] waiting for available connection slot', tag);
  });
}

let poolInstance: mysql.Pool | null = null;
/** mysql2（回调版）的 Pool 与 mysql2/promise 的 Pool 类型不兼容，这里保持宽松类型 */
let kyselyPoolInstance: any = null;

/** 获取（并按需创建）原生 mysql2 连接池 */
export function getPool(): mysql.Pool {
  if (!poolInstance) {
    console.log('[db] config loaded', {
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      database: env.db.database,
      connectionLimit: env.db.connectionLimit,
    });
    poolInstance = mysql.createPool(commonDbConfig);
    attachPoolEvents(poolInstance, 'db');
  }
  return poolInstance;
}

/** Kysely 专用 Pool */
function getKyselyPool(): any {
  if (!kyselyPoolInstance) {
    kyselyPoolInstance = createMysqlPool(commonDbConfig);
    attachPoolEvents(kyselyPoolInstance, 'db:kysely');
  }
  return kyselyPoolInstance;
}

/**
 * 兼容旧代码的 `pool` 导出。
 * 通过 Proxy 转发到懒创建的真实连接池，任何属性访问都会触发按需创建。
 */
export const pool: any = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    const real: any = getPool();
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/** 统一 DB 操作观测包装 */
async function observeDbOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const end = dbQueryDurationSeconds.startTimer({ operation });
  try {
    return await fn();
  } catch (error) {
    dbQueryErrorsTotal.inc({ operation });
    throw error;
  } finally {
    end();
  }
}

/**
 * 带重试的查询执行
 * 遇到 ECONNRESET 等连接错误时自动重试（最多 3 次）
 */
async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (isConnectionResetError(err) && attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 1000);
        console.warn(
          `[db] ${context} - connection reset on attempt ${attempt + 1}, retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

/**
 * 为 Kysely QueryBuilder 的 execute 系列方法添加自动重试
 */
const executeRetryMethods = new Set([
  'execute',
  'executeTakeFirst',
  'executeTakeFirstOrThrow',
]);

function wrapKyselyInstance(db: any): any {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // 拦截所有 QueryBuilder 工厂方法，返回包装后的 builder
      if (
        typeof prop === 'string' &&
        ['selectFrom', 'selectNoFrom', 'insertInto', 'updateTable', 'deleteFrom', 'replaceInto', 'with', 'withRecursive', 'withSchema'].includes(prop)
      ) {
        return (...args: any[]) => {
          const builder = original.apply(target, args);
          return wrapQueryBuilder(builder);
        };
      }

      // 原始值直接返回
      if (typeof original !== 'function') {
        return original;
      }

      return (...args: any[]) => {
        const result = original.apply(target, args);
        // 如果是 Promise（如 transaction），递归包装
        if (result && typeof result.then === 'function') {
          return result;
        }
        return result;
      };
    },
  });
}

function wrapQueryBuilder(builder: any): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // 拦截 execute / executeTakeFirst / executeTakeFirstOrThrow，添加重试 + 指标 + SQL 错误审计
      if (typeof prop === 'string' && executeRetryMethods.has(prop)) {
        return (...args: any[]) => {
          const op = prop === 'executeTakeFirst' ? 'kysely_execute_take_first'
            : prop === 'executeTakeFirstOrThrow' ? 'kysely_execute_take_first_or_throw'
            : 'kysely_execute';
          return observeDbOperation(op, () =>
            withRetry(() => original.apply(target, args), `kysely.${prop}`)
          ).catch((error: unknown) => {
            // Kysely 路径报错也接入 SQL 审计（尽力提取 SQL 文本，失败不阻塞）
            try {
              const compiled = (target as any).compile?.() as { sql?: string } | undefined;
              writeSqlError('kysely', compiled?.sql ?? '(kysely query)', error);
            } catch (_) {
              writeSqlError('kysely', '(kysely query)', error);
            }
            throw error;
          });
        };
      }

      // 其他方法（.where, .orderBy 等）返回的可能是 builder，继续包装
      if (typeof original === 'function') {
        return (...args: any[]) => {
          const result = original.apply(target, args);
          // 方法返回 builder 自身或另一个 builder 时，继续包装
          if (result && typeof result === 'object') {
            return wrapQueryBuilder(result);
          }
          return result;
        };
      }

      return original;
    },
  });
}

/**
 * Kysely 单例
 * 解决 CommonJS 项目 import Kysely 报错的问题
 */
let dbPromise: Promise<any> | null = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = import('kysely').then(({ Kysely, MysqlDialect }) => {
      const rawDb = new Kysely<Record<string, any>>({
        dialect: new MysqlDialect({
          pool: getKyselyPool(),
        }),
      });
      return wrapKyselyInstance(rawDb);
    });
  }

  return dbPromise;
}

export type QueryParams = Record<string, unknown> | unknown[];

export async function query<T>(
  sql: string,
  params?: QueryParams,
): Promise<T[]> {
  try {
    return await observeDbOperation('query', () =>
      withRetry(async () => {
        const [rows] = await getPool().query(sql, params as any);
        return rows as T[];
      }, 'query')
    );
  } catch (error) {
    writeSqlError('query', sql, error);
    throw error;
  }
}

export async function queryOne<T>(
  sql: string,
  params?: QueryParams,
): Promise<T | null> {
  try {
    return await observeDbOperation('query_one', () =>
      withRetry(async () => {
        const [rows] = await getPool().query(sql, params as any);
        return (rows as T[])[0] ?? null;
      }, 'queryOne')
    );
  } catch (error) {
    writeSqlError('query_one', sql, error);
    throw error;
  }
}

export async function execute(
  sql: string,
  params?: QueryParams,
): Promise<mysql.ResultSetHeader> {
  try {
    return await observeDbOperation('execute', () =>
      withRetry(async () => {
        const [result] = await getPool().execute(sql, params as any);
        return result as mysql.ResultSetHeader;
      }, 'execute')
    );
  } catch (error) {
    writeSqlError('execute', sql, error);
    throw error;
  }
}

export async function transaction<T>(
  runner: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  return observeDbOperation('transaction', () =>
    withRetry(async () => {
      const conn = await getPool().getConnection();
      try {
        await conn.beginTransaction();
        const result = await runner(conn);
        await conn.commit();
        return result;
      } catch (error) {
        try { await conn.rollback(); } catch (rollbackError) { console.error('[db] rollback failed', rollbackError); }
        throw error;
      } finally {
        conn.release();
      }
    }, 'transaction')
  );
}

/** Graceful Shutdown：关闭所有数据库连接池（未创建过则直接返回） */
export async function closeDatabase(): Promise<void> {
  const results = await Promise.allSettled([
    (async () => { if (poolInstance) await poolInstance.end(); })(),
    (async () => {
      if (kyselyPoolInstance) {
        await new Promise<void>((resolve, reject) => {
          (kyselyPoolInstance as any).end((err?: Error) => { if (err) reject(err); else resolve(); });
        });
      }
    })(),
  ]);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error('[db] close pool errors:', failures.map((r: any) => r.reason?.message).join(', '));
  }
  poolInstance = null;
  kyselyPoolInstance = null;
  dbPromise = null;
}
