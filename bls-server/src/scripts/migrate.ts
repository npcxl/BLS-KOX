/**
 * Migration 工具 (v2)
 *
 * 特性:
 *   - 每个迁移文件在单个事务内执行（原子性）
 *   - Checksum 漂移检测（文件内容被改过会报警）
 *   - 使用 mysql2 multipleStatements 执行完整 SQL，不 split(';')
 *   - 幂等部署：已执行的迁移不会被重复执行
 *
 * 用法:
 *   npm run db:migrate up       — 执行未应用的迁移
 *   npm run db:migrate status   — 查看状态 (含 drift 检测)
 *   npm run db:migrate rollback — 回滚最后一个迁移（需 .rollback.sql）
 */
import mysql from 'mysql2/promise';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { env } from '../config/env';

const { host, port, user, password, database } = env.db;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function getPool() {
  return mysql.createPool({
    host, port, user, password, database,
    connectionLimit: 1,
    multipleStatements: true,
  });
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** 确保 sys_migrations 表存在（独立 DDL，不在事务中） */
async function ensureTable(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sys_migrations (
      version          VARCHAR(64)  NOT NULL,
      checksum         VARCHAR(64)  NOT NULL,
      executed_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_time_ms INT         NOT NULL DEFAULT 0,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getExecuted(pool: mysql.Pool): Promise<Map<string, { checksum: string }>> {
  const [rows] = await pool.query('SELECT version, checksum FROM sys_migrations ORDER BY version');
  return new Map((rows as any[]).map(r => [r.version, r]));
}

/**
 * 执行一个迁移文件（在事务中，原子执行）
 * @returns error message if failed, null if success
 */
async function applyOne(
  conn: mysql.PoolConnection,
  filename: string,
  sql: string,
): Promise<string | null> {
  const checksum = sha256(sql);
  const start = Date.now();
  try {
    await conn.beginTransaction();
    await conn.query(sql);
    await conn.commit();
    const ms = Date.now() - start;
    await conn.query(
      'INSERT INTO sys_migrations (version,checksum,execution_time_ms) VALUES (?,?,?)',
      [filename, checksum, ms],
    );
    console.log(`  ✅ ${filename} (${ms}ms)`);
    return null;
  } catch (err: any) {
    await conn.rollback().catch(() => {});
    return `❌ ${filename}: ${err.message}`;
  }
}

/** 检查已执行的迁移文件是否发生内容漂移 */
function checkDrift(
  filename: string,
  storedChecksum: string,
  currentSql: string,
): boolean {
  const current = sha256(currentSql);
  if (current !== storedChecksum) {
    console.warn(
      `  ⚠️  DRIFT: ${filename} — checksum 不匹配!\n` +
      `       已记录: ${storedChecksum.slice(0, 12)}…\n` +
      `       当前值: ${current.slice(0, 12)}…`,
    );
    return true;
  }
  return false;
}

async function runUp(pool: mysql.Pool) {
  await ensureTable(pool);
  const done = await getExecuted(pool);
  if (!existsSync(MIGRATIONS_DIR)) { console.log('No migrations dir.'); return; }
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  // 先检查 drift
  let driftCount = 0;
  for (const f of files) {
    if (!done.has(f)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    if (checkDrift(f, done.get(f)!.checksum, sql)) driftCount++;
  }

  if (driftCount > 0) {
    console.warn(`\n⚠️  检测到 ${driftCount} 个迁移文件发生漂移。`);
    console.warn('建议检查文件变更是否符合预期后重新执行。\n');
  }

  // 执行未应用的迁移（每个文件一个事务）
  const conn = await pool.getConnection();
  let applied = 0;
  let failed = 0;
  try {
    for (const f of files) {
      if (done.has(f)) { console.log(`  ⏭ ${f} (already applied)`); continue; }
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
      console.log(`  ▶ ${f} ...`);
      const err = await applyOne(conn, f, sql);
      if (err) { console.error(err); failed++; } else { applied++; }
    }
  } finally {
    conn.release();
  }

  console.log(`\n✅ ${applied} applied, ${failed} failed, ${files.length - applied - failed} skipped.`);
}

async function runStatus(pool: mysql.Pool) {
  await ensureTable(pool);
  const done = await getExecuted(pool);
  if (!existsSync(MIGRATIONS_DIR)) return;
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  let driftCount = 0;
  for (const f of files) {
    if (!done.has(f)) {
      console.log(`  ⬜ ${f} (pending)`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    if (checkDrift(f, done.get(f)!.checksum, sql)) {
      console.log(`  ⚠️  ${f}`);
      driftCount++;
    } else {
      console.log(`  ✅ ${f}`);
    }
  }

  if (driftCount > 0) {
    console.warn(`\n⚠️  ${driftCount} 个迁移文件存在漂移。`);
  }
}

async function runRollback(pool: mysql.Pool) {
  await ensureTable(pool);
  const [rows] = await pool.query(
    'SELECT version FROM sys_migrations ORDER BY version DESC LIMIT 1',
  );
  const last = (rows as any[])[0];
  if (!last) { console.log('No migrations to roll back.'); return; }

  // .rollback.sql 与 .sql 同名，仅后缀不同
  const rf = join(MIGRATIONS_DIR, last.version.replace(/\.sql$/, '.rollback.sql'));
  if (!existsSync(rf)) {
    console.log(`No rollback file: ${rf}`);
    return;
  }

  console.log(`◀  ${last.version} ...`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(readFileSync(rf, 'utf-8'));
    await conn.query('DELETE FROM sys_migrations WHERE version = ?', [last.version]);
    await conn.commit();
    console.log(`✅ Rolled back ${last.version}`);
  } catch (err: any) {
    await conn.rollback().catch(() => {});
    console.error(`❌ Rollback failed: ${err.message}`);
  } finally {
    conn.release();
  }
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const pool = await getPool();
  try {
    if (cmd === 'up') await runUp(pool);
    else if (cmd === 'status') await runStatus(pool);
    else if (cmd === 'rollback') await runRollback(pool);
    else console.log('Usage: migrate up|status|rollback');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
