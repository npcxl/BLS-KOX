import mysql from 'mysql2/promise';
import { createPool as createMysqlPool } from 'mysql2';
import { env } from '../config/env';

console.log('[db] config loaded', {
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
});

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  namedPlaceholders: true,
  timezone: '+08:00',
  dateStrings: true,
});

/**
 * Kysely 专用 Pool
 */
const kyselyPool = createMysqlPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  namedPlaceholders: true,
  timezone: '+08:00',
  dateStrings: true,
});

/**
 * Kysely 单例
 * 解决 CommonJS 项目 import Kysely 报错的问题
 */
let dbPromise: Promise<any> | null = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = import('kysely').then(({ Kysely, MysqlDialect }) => {
      return new Kysely<Record<string, any>>({
        dialect: new MysqlDialect({
          pool: kyselyPool,
        }),
      });
    });
  }

  return dbPromise;
}

export type QueryParams = Record<string, unknown> | unknown[];

export async function query<T>(
  sql: string,
  params?: QueryParams,
): Promise<T[]> {
  const [rows] = await pool.query(sql, params as any);
  return rows as T[];
}

export async function queryOne<T>(
  sql: string,
  params?: QueryParams,
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params?: QueryParams,
): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params as any);
  return result as mysql.ResultSetHeader;
}

export async function transaction<T>(
  runner: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const result = await runner(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}