import mysql from 'mysql2/promise';
import { env } from '../config/env';

console.log('[event-service:db] config loaded', {
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
  connectionLimit: env.db.connectionLimit || 5,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000,
  idleTimeout: 60_000,
  connectTimeout: 15_000,
  namedPlaceholders: true,
  timezone: '+08:00',
  dateStrings: true,
  charset: 'utf8mb4',
};

export const pool = mysql.createPool(commonDbConfig);

pool.on('connection', (connection) => {
  console.log('[event-service:db] new connection created, threadId=%d', connection.threadId);
  connection.on('error', (err) => {
    console.error('[event-service:db] connection %d error:', connection.threadId, err.message);
    if (isConnectionResetError(err)) {
      try { connection.destroy(); } catch { /* ignore */ }
    }
  });
});

pool.on('enqueue', () => {
  console.log('[event-service:db] waiting for available connection slot');
});

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
        console.warn(`[event-service:db] ${context} - connection reset, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export type QueryParams = Record<string, unknown> | unknown[];

export async function query<T>(sql: string, params?: QueryParams): Promise<T[]> {
  return withRetry(async () => {
    const [rows] = await pool.query(sql, params as any);
    return rows as T[];
  }, 'query');
}

export async function execute(sql: string, params?: QueryParams): Promise<mysql.ResultSetHeader> {
  return withRetry(async () => {
    const [result] = await pool.execute(sql, params as any);
    return result as mysql.ResultSetHeader;
  }, 'execute');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
