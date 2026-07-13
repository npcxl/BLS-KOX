/**
 * Database Restore Script
 *
 * 用法:
 *   npm run db:restore <backup-file>
 *   例: npm run db:restore backups/bls_20260710_120000.sql
 *   例: npm run db:restore backups/bls_20260710_120000.sql.gz
 *
 * 注意:
 *   - restore 会覆盖现有数据，请先确认备份文件正确
 *   - 恢复前会自动备份当前数据库到 backups/pre_restore_*.sql
 *   - 需要 mysql CLI 工具在 PATH 中
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { env } from '../config/env';

const BACKUP_DIR = join(__dirname, '..', '..', 'backups');
const { host, port, user, password, database } = env.db;

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run db:restore <backup-file>');
  console.error('  e.g. npm run db:restore backups/bls_20260710_120000.sql');
  process.exit(1);
}

const absPath = join(process.cwd(), filePath);
if (!existsSync(absPath)) {
  console.error(`文件不存在: ${absPath}`);
  process.exit(1);
}

if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

const envVars: Record<string, string> = { ...process.env, MYSQL_PWD: password };
const mysqlArgs = `--host=${host} --port=${port} --user=${user} ${database}`;
const isGz = extname(absPath) === '.gz';

try {
  // ======= 1. 恢复前先做安全备份 =======
  const preTs = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const preBackup = join(BACKUP_DIR, `pre_restore_${preTs}.sql`);

  console.log('Creating pre-restore safety backup...');
  const safetySql = execSync(
    `mysqldump --single-transaction --routines --triggers --add-drop-table --host=${host} --port=${port} --user=${user} ${database}`,
    { env: envVars, maxBuffer: 200 * 1024 * 1024, timeout: 5 * 60 * 1000, encoding: 'buffer' },
  );
  writeFileSync(preBackup, safetySql);
  console.log(`Safety backup: ${preBackup} (${(safetySql.length / 1024).toFixed(1)} KB)`);

  // ======= 2. 恢复 =======
  console.log(`Restoring from: ${absPath} ...`);

  const start = Date.now();
  if (isGz) {
    execSync(`gunzip -c "${absPath}" | mysql ${mysqlArgs}`, {
      env: envVars,
      maxBuffer: 500 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
  } else {
    // shell redirect: pipe file to mysql
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    execSync(`mysql ${mysqlArgs} < "${absPath}"`, {
      env: envVars,
      maxBuffer: 500 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
      shell,
    });
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(` Restore completed (${elapsed}s)`);
  console.log('\n 接下来请执行: npm run db:migrate up (确保迁移一致)');
} catch (err: any) {
  console.error(' Restore failed:', err.message);
  console.error('   可以手动恢复 safety backup 或检查数据库连接。');
  process.exit(1);
}
