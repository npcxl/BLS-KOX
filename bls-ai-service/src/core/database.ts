import mysql from 'mysql2/promise';
import { logger } from './logger';

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kox',
      connectionLimit: 5,
      waitForConnections: true,
      queueLimit: 10,
    });
    logger.info('MySQL pool created for ai-service');
  }
  return pool;
}

export async function getDb() {
  const p = getDbPool();
  const { Kysely, MysqlDialect } = await import('kysely');
  return new Kysely<any>({
    dialect: new MysqlDialect({ pool: p }),
  });
}
