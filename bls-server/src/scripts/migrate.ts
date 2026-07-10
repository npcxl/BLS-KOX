/**
 * Migration 工具
 *   npm run db:migrate up/status/rollback
 */
import mysql from 'mysql2/promise';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { env } from '../config/env';

const { host, port, user, password, database } = env.db;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function getPool() {
  return mysql.createPool({ host, port, user, password, database, connectionLimit: 1, multipleStatements: true });
}

function sha256(content: string): string { return createHash('sha256').update(content).digest('hex'); }

async function ensureTable(pool: mysql.Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS sys_migrations (
    version varchar(64) NOT NULL, checksum varchar(64) NOT NULL,
    executed_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms int NOT NULL DEFAULT '0', PRIMARY KEY (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function getExecuted(pool: mysql.Pool) {
  const [rows] = await pool.query('SELECT * FROM sys_migrations ORDER BY version');
  return new Map((rows as any[]).map(r => [r.version, r]));
}

async function runUp(pool: mysql.Pool) {
  await ensureTable(pool);
  const done = await getExecuted(pool);
  if (!existsSync(MIGRATIONS_DIR)) { console.log('No migrations dir.'); return; }
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  let n = 0;
  for (const f of files) {
    if (done.has(f)) { console.log(`  ⏭ ${f}`); continue; }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    const stmts = sql.split(';').filter(s => s.trim());
    console.log(`  ▶ ${f} ...`);
    const start = Date.now();
    for (const s of stmts) await pool.query(s);
    const ms = Date.now() - start;
    await pool.query('INSERT INTO sys_migrations (version,checksum,executed_at,execution_time_ms) VALUES (?,?,NOW(),?)', [f, sha256(sql), ms]);
    console.log(`  ✅ ${f} (${ms}ms)`); n++;
  }
  console.log(`\n✅ ${n} migrations applied.`);
}

async function runStatus(pool: mysql.Pool) {
  await ensureTable(pool);
  const done = await getExecuted(pool);
  if (!existsSync(MIGRATIONS_DIR)) return;
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) console.log(done.has(f) ? `  ✅ ${f}` : `  ⬜ ${f}`);
}

async function runRollback(pool: mysql.Pool) {
  await ensureTable(pool);
  const [rows] = await pool.query('SELECT version FROM sys_migrations ORDER BY version DESC LIMIT 1');
  const last = (rows as any[])[0];
  if (!last) { console.log('No migrations.'); return; }
  const rf = join(MIGRATIONS_DIR, last.version.replace('.sql', '.rollback.sql'));
  if (!existsSync(rf)) { console.log(`No rollback: ${last.version}`); return; }
  console.log(`◀  ${last.version} ...`);
  await pool.query(readFileSync(rf, 'utf-8'));
  await pool.query('DELETE FROM sys_migrations WHERE version = ?', [last.version]);
  console.log(`✅ Rolled back ${last.version}`);
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const pool = await getPool();
  try {
    if (cmd === 'up') await runUp(pool);
    else if (cmd === 'status') await runStatus(pool);
    else if (cmd === 'rollback') await runRollback(pool);
    else console.log('Usage: migrate up|status|rollback');
  } finally { await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
