/**
 * Database Backup Script
 *
 * 用法:
 *   npm run db:backup                    → 全量备份到 backups/
 *   npm run db:backup -- --compress      → 备份并 gzip 压缩
 *   npm run db:backup -- -t users,tokens → 仅备份指定表
 *
 * 输出: backups/bls_YYYYMMDD_HHmmss.sql[.gz]
 */
import { execSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { env } from '../config/env';

const BACKUP_DIR = join(__dirname, '..', '..', 'backups');
const { host, port, user, password, database } = env.db;

// 生成时间戳文件名
const now = new Date();
const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);

const args = process.argv.slice(2);
const compress = args.includes('--compress') || args.includes('-z');
const tablesArg = args.includes('-t') ? args[args.indexOf('-t') + 1] : '';
const tables = tablesArg ? tablesArg.split(',') : [];

// 确保备份目录存在
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

// mysqldump 参数
let dumpArgs = [
  `--host=${host}`,
  `--port=${port}`,
  `--user=${user}`,
  // 不把密码暴露在进程名中
  '--single-transaction',
  '--routines',
  '--triggers',
  '--add-drop-table',
  '--default-character-set=utf8mb4',
];

// 跳过 sys_migrations 之外的工具表 / 日志（可选优化）
const skipTables = [];
if (tables.length === 0) {
  // 全量备份时跳过日志表格（数据量大、恢复价值低）
  skipTables.push('sys_operation_log', 'sys_logininfor');
  for (const t of skipTables) {
    dumpArgs.push(`--ignore-table=${database}.${t}`);
  }
  dumpArgs.push(database);
} else {
  dumpArgs.push(database, ...tables);
}

// 备份文件路径
const outFile = join(BACKUP_DIR, `bls_${ts}.sql`);
const envVars: Record<string, string> = { ...process.env, MYSQL_PWD: password };

let output: Buffer;
try {
  if (compress) {
    // gzip 压缩
    output = execSync(`mysqldump ${dumpArgs.join(' ')} | gzip`, {
      env: envVars,
      maxBuffer: 200 * 1024 * 1024, // 200MB
      timeout: 5 * 60 * 1000,
    });
    writeFileSync(outFile + '.gz', output);
    console.log(`✅ Backup saved: ${outFile}.gz (${(output.length / 1024).toFixed(1)} KB)`);
  } else {
    output = execSync(`mysqldump ${dumpArgs.join(' ')}`, {
      env: envVars,
      maxBuffer: 200 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      encoding: 'buffer',
    });
    writeFileSync(outFile, output);
    console.log(`✅ Backup saved: ${outFile} (${(output.length / 1024).toFixed(1)} KB)`);
  }

  // 清理旧备份（保留最近 30 个文件）
  const files = readdirSync(BACKUP_DIR)
    .filter((f: string) => /\.sql(\.gz)?$/.test(f))
    .sort()
    .reverse();
  if (files.length > 30) {
    for (const old of files.slice(30)) {
      unlinkSync(join(BACKUP_DIR, old));
      console.log(`  🗑  purged old backup: ${old}`);
    }
  }
} catch (err: any) {
  console.error('❌ Backup failed:', err.message);
  console.error('   检查 mysqldump 是否在 PATH 中，以及数据库连接是否正常。');
  process.exit(1);
}
