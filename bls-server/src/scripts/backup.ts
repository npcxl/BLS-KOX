/**
 * Database Backup Script（阶段七增强）
 *
 * 用法:
 *   npm run db:backup                      → 全量备份到 backups/
 *   npm run db:backup -- --compress        → 备份并 gzip 压缩
 *   npm run db:backup -- -t users,tokens   → 仅备份指定表
 *   npm run db:backup -- --verify          → 备份后自动做一次恢复验证
 *   npm run db:backup -- --upload          → 备份后上传到外部对象存储
 *
 * 增强点：
 *   1. 每个备份生成 SHA-256 校验文件（`<file>.sha256`）
 *   2. 保留策略可配置（`BACKUP_KEEP`，默认 30），按时间倒序清理
 *   3. 外部存储：配置 `BACKUP_S3_*` 后上传到 MinIO / OSS / COS / S3
 *   4. `--verify`：把备份导入临时库并核对表数量，验证备份真的可用
 *
 * 输出: backups/bls_YYYYMMDD_HHmmss.sql[.gz]
 */
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import {
  mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync,
  unlinkSync, statSync,
} from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { env } from '../config/env';

const BACKUP_DIR = join(__dirname, '..', '..', 'backups');
const { host, port, user, password, database } = env.db;

const args = process.argv.slice(2);
const compress = args.includes('--compress') || args.includes('-z');
const doVerify = args.includes('--verify');
const doUpload = args.includes('--upload') || (process.env.BACKUP_UPLOAD_ENABLED ?? 'false') === 'true';
const tablesArg = args.includes('-t') ? args[args.indexOf('-t') + 1] : '';
const tables = tablesArg ? tablesArg.split(',').filter(Boolean) : [];

const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP ?? 30) || 30);

const envVars: Record<string, string> = { ...process.env, MYSQL_PWD: password };

function mysqlExec(sql: string): string {
  return execSync(
    `mysql --host=${host} --port=${port} --user=${user} -N -B -e "${sql}"`,
    { env: envVars, encoding: 'utf-8', timeout: 60_000 },
  ).trim();
}

function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function runBackup(): { file: string; size: number; checksum: string } {
  let dumpArgs = [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--add-drop-table',
    '--default-character-set=utf8mb4',
  ];

  if (tables.length === 0) {
    // 全量备份时跳过体量最大的操作日志（恢复价值低）；安全/登录日志仍然备份
    for (const t of ['sys_operation_log']) {
      dumpArgs.push(`--ignore-table=${database}.${t}`);
    }
    dumpArgs.push(database);
  } else {
    dumpArgs.push(database, ...tables);
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const baseFile = join(BACKUP_DIR, `bls_${ts}.sql`);

  let output: Buffer;
  let file: string;
  if (compress) {
    output = execSync(`mysqldump ${dumpArgs.join(' ')} | gzip`, {
      env: envVars,
      maxBuffer: 500 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
    file = `${baseFile}.gz`;
    writeFileSync(file, output);
  } else {
    output = execSync(`mysqldump ${dumpArgs.join(' ')}`, {
      env: envVars,
      maxBuffer: 500 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
      encoding: 'buffer',
    });
    file = baseFile;
    writeFileSync(file, output);
  }

  const checksum = sha256OfFile(file);
  writeFileSync(`${file}.sha256`, `${checksum}  ${file.split(/[\\/]/).pop()}\n`, 'utf-8');

  console.log(`✅ Backup saved: ${file} (${(output.length / 1024).toFixed(1)} KB)`);
  console.log(`   sha256: ${checksum}`);
  return { file, size: output.length, checksum };
}

/** 保留策略：删除超出 KEEP 的旧备份（含 .sha256 / 外部对象不删） */
function applyRetention(): void {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => /\.sql(\.gz)?$/.test(f))
    .sort()
    .reverse();
  const stale = files.slice(KEEP);
  for (const old of stale) {
    unlinkSync(join(BACKUP_DIR, old));
    const checksumFile = join(BACKUP_DIR, `${old}.sha256`);
    if (existsSync(checksumFile)) unlinkSync(checksumFile);
    console.log(`  🗑  purged old backup: ${old}`);
  }
  console.log(`   retention: keep=${KEEP}, purged=${stale.length}`);
}

/** 恢复验证：导入临时库并核对表数量 */
function verifyRestore(file: string): void {
  const tmpDb = `${database}_restore_verify`;
  let plainFile = file;
  let tempCreated = false;

  try {
    if (file.endsWith('.gz')) {
      plainFile = join(BACKUP_DIR, `.verify_${Date.now()}.sql`);
      writeFileSync(plainFile, gunzipSync(readFileSync(file)));
      tempCreated = true;
    }

    console.log('[verify] 导入临时库...');
    mysqlExec(`DROP DATABASE IF EXISTS \`${tmpDb}\`; CREATE DATABASE \`${tmpDb}\``);
    execSync(`mysql --host=${host} --port=${port} --user=${user} ${tmpDb} < "${plainFile}"`, {
      env: envVars, stdio: 'ignore', timeout: 10 * 60 * 1000,
    });

    const srcTables = Number(mysqlExec(
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${database}' AND table_type='BASE TABLE'`,
    ));
    const restoredTables = Number(mysqlExec(
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${tmpDb}' AND table_type='BASE TABLE'`,
    ));

    if (restoredTables === 0) throw new Error('恢复后的库没有任何表');
    if (restoredTables > srcTables) throw new Error(`恢复表数异常：源 ${srcTables}，恢复 ${restoredTables}`);

    console.log(`[verify] ✅ 恢复验证通过（源 ${srcTables} 张表，恢复 ${restoredTables} 张表）`);
  } finally {
    try { mysqlExec(`DROP DATABASE IF EXISTS \`${tmpDb}\``); } catch { /* ignore */ }
    if (tempCreated && existsSync(plainFile)) unlinkSync(plainFile);
  }
}

/** 上传到外部对象存储（未配置时明确跳过，不假装成功） */
async function uploadToObjectStorage(file: string): Promise<void> {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const accessKey = process.env.BACKUP_S3_ACCESS_KEY?.trim();
  const secretKey = process.env.BACKUP_S3_SECRET_KEY?.trim();

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.warn('[upload] 未配置 BACKUP_S3_*，跳过外部存储上传（这不是错误）');
    return;
  }

  try {
    // 延迟加载，避免未使用外部存储时引入依赖副作用
    const { Client } = await import('minio');
    const client = new Client({
      endPoint: endpoint,
      port: Number(process.env.BACKUP_S3_PORT ?? 9000),
      useSSL: (process.env.BACKUP_S3_USE_SSL ?? 'false') === 'true',
      accessKey,
      secretKey,
    });

    const prefix = (process.env.BACKUP_S3_PREFIX ?? 'bls-backups/').replace(/^\/+/, '');
    const objectName = `${prefix}${file.split(/[\\/]/).pop()}`;
    const size = statSync(file).size;

    const exists = await client.bucketExists(bucket).catch(() => false);
    if (!exists) await client.makeBucket(bucket);

    await client.fPutObject(bucket, objectName, file, {
      'Content-Type': 'application/octet-stream',
      'X-Amz-Meta-Sha256': sha256OfFile(file),
    });
    console.log(`[upload] ✅ ${objectName} (${(size / 1024).toFixed(1)} KB) → ${bucket}`);
  } catch (error) {
    console.error('[upload] ❌ 上传失败:', (error as Error).message);
    throw error;
  }
}

async function main(): Promise<void> {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  const { file } = runBackup();
  applyRetention();

  if (doUpload) {
    await uploadToObjectStorage(file);
  }

  if (doVerify) {
    verifyRestore(file);
  }
}

main().catch((err: any) => {
  console.error('❌ Backup failed:', err?.message ?? err);
  console.error('   检查 mysqldump 是否在 PATH 中，以及数据库连接是否正常。');
  process.exit(1);
});
