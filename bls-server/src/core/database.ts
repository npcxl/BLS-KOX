import mysql from 'mysql2/promise';
import { createPool as createMysqlPool } from 'mysql2';
import { env } from '../config/env';
import { dbQueryDurationSeconds, dbQueryErrorsTotal } from '../observability/metrics';

console.log('[db] config loaded', {
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
});

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
  charset: 'utf8mb4',
};

export const pool = mysql.createPool(commonDbConfig);

// ========== 连接池事件监听 ==========
pool.on('connection', (connection) => {
  console.log('[db] new connection created, threadId=%d', connection.threadId);

  // 连接级错误检测：自动销毁已断开的连接
  connection.on('error', (err) => {
    console.error('[db] connection %d error:', connection.threadId, err.message);
    if (isConnectionResetError(err)) {
      try {
        connection.destroy();
      } catch (_) {
        // ignore
      }
    }
  });
});
pool.on('acquire', (connection) => {
  console.log('[db] connection %d acquired', connection.threadId);
});
pool.on('release', (connection) => {
  console.log('[db] connection %d released', connection.threadId);
});
pool.on('enqueue', () => {
  console.log('[db] waiting for available connection slot');
});

/**
 * Kysely 专用 Pool
 */
const kyselyPool = createMysqlPool(commonDbConfig);

// 连接创建时，给每个连接添加错误处理
kyselyPool.on('connection', (connection) => {
  console.log('[db:kysely] new connection created, threadId=%d', connection.threadId);

  connection.on('error', (err) => {
    console.error('[db:kysely] connection %d error:', connection.threadId, err.message);
    // ECONNRESET 等致命错误：销毁连接，pool 会自动创建新连接替换
    if (isConnectionResetError(err)) {
      try {
        connection.destroy();
      } catch (_) {
        // ignore
      }
    }
  });
});

// 全局 pool 错误处理
kyselyPool.on('error', (err) => {
  console.error('[db:kysely] pool error:', err.message);
});

kyselyPool.on('acquire', (connection) => {
  console.log('[db:kysely] connection %d acquired', connection.threadId);
});
kyselyPool.on('release', (connection) => {
  console.log('[db:kysely] connection %d released', connection.threadId);
});
kyselyPool.on('enqueue', () => {
  console.log('[db:kysely] waiting for available connection slot');
});

// ========== 连接错误检测（ECONNRESET 等） ==========
/** P5: 统一 DB 操作观测包装 */
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

      // 拦截 execute / executeTakeFirst / executeTakeFirstOrThrow，添加重试 + 指标
      if (typeof prop === 'string' && executeRetryMethods.has(prop)) {
        return (...args: any[]) => {
          const op = prop === 'executeTakeFirst' ? 'kysely_execute_take_first'
            : prop === 'executeTakeFirstOrThrow' ? 'kysely_execute_take_first_or_throw'
            : 'kysely_execute';
          return observeDbOperation(op, () =>
            withRetry(() => original.apply(target, args), `kysely.${prop}`)
          );
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
          pool: kyselyPool,
        }),
      });
      return wrapKyselyInstance(rawDb);
    });
  }

  return dbPromise;
}

/** Graceful Shutdown：关闭所有数据库连接池 */
export async function closeDatabase(): Promise<void> {
  const results = await Promise.allSettled([
    (async () => { await pool.end(); })(),
    (async () => { await new Promise<void>((resolve, reject) => { (kyselyPool as any).end((err?: Error) => { if (err) reject(err); else resolve(); }); }); })(),
  ]);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error('[db] close pool errors:', failures.map((r: any) => r.reason?.message).join(', '));
  }
}

export type QueryParams = Record<string, unknown> | unknown[];

export async function query<T>(
  sql: string,
  params?: QueryParams,
): Promise<T[]> {
  return observeDbOperation('query', () =>
    withRetry(async () => {
      const [rows] = await pool.query(sql, params as any);
      return rows as T[];
    }, 'query')
  );
}

export async function queryOne<T>(
  sql: string,
  params?: QueryParams,
): Promise<T | null> {
  return observeDbOperation('query_one', () =>
    withRetry(async () => {
      const [rows] = await pool.query(sql, params as any);
      return (rows as T[])[0] ?? null;
    }, 'queryOne')
  );
}

export async function execute(
  sql: string,
  params?: QueryParams,
): Promise<mysql.ResultSetHeader> {
  return observeDbOperation('execute', () =>
    withRetry(async () => {
      const [result] = await pool.execute(sql, params as any);
      return result as mysql.ResultSetHeader;
    }, 'execute')
  );
}

export async function transaction<T>(
  runner: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  return observeDbOperation('transaction', () =>
    withRetry(async () => {
      const conn = await pool.getConnection();
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