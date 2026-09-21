/**
 * 密钥轮换脚本（阶段五）
 *
 * 用法：
 *   SECRET_ENCRYPTION_KEY=<新的 base64 32B> \
 *   SECRET_ENCRYPTION_KEY_VERSION=v2 \
 *   SECRET_ENCRYPTION_KEY_PREVIOUS=v1:<旧 base64> \
 *   npm run secrets:rotate            # 实际执行
 *   npm run secrets:rotate -- --dry-run
 *
 * 行为：把所有敏感列用**当前主密钥**重新加密（已是最新版本的跳过）。
 * 不带 `--dry-run` 时会逐行写回数据库。
 */
import { query, execute, closeDatabase } from '../core/database';
import { getKeyring, isEncrypted, needsRotation, rotateSecret } from '../shared/utils/secret-crypto';
import { logger } from '../core/logger';

interface Target {
  table: string;
  idColumn: string;
  columns: string[];
}

const TARGETS: Target[] = [
  { table: 'ai_model_config', idColumn: 'config_id', columns: ['api_key'] },
  { table: 'sys_storage_config', idColumn: 'storage_id', columns: ['access_key', 'secret_key'] },
  { table: 'sys_webhook', idColumn: 'webhook_id', columns: ['secret'] },
  { table: 'sys_api_key', idColumn: 'id', columns: ['encrypted_secret'] },
];

async function rotateTable(target: Target, dryRun: boolean): Promise<{ scanned: number; rotated: number; failed: number }> {
  const stats = { scanned: 0, rotated: 0, failed: 0 };
  let rows: Array<Record<string, any>>;
  try {
    rows = await query<Record<string, any>>(
      `SELECT ${target.idColumn}, ${target.columns.join(', ')} FROM ${target.table}`,
    );
  } catch (error) {
    // 表不存在（例如 sys_api_key 尚未部署）→ 跳过
    logger.warn('[secrets:rotate] table skipped', { table: target.table, error: String(error) });
    return stats;
  }

  for (const row of rows) {
    stats.scanned++;
    const updates: Record<string, string> = {};
    for (const column of target.columns) {
      const current = row[column];
      if (current === null || current === undefined || current === '') continue;
      if (isEncrypted(current) && !needsRotation(current)) continue; // 已是最新版本
      try {
        const next = rotateSecret(String(current));
        if (next && next !== current) updates[column] = next;
      } catch (error) {
        stats.failed++;
        logger.error('[secrets:rotate] rotate failed', {
          table: target.table, id: row[target.idColumn], column, error: String(error),
        });
      }
    }

    if (Object.keys(updates).length === 0) continue;
    stats.rotated++;
    if (dryRun) continue;

    const setClause = Object.keys(updates).map((c) => `${c} = :${c}`).join(', ');
    await execute(
      `UPDATE ${target.table} SET ${setClause} WHERE ${target.idColumn} = :__id`,
      { ...updates, __id: row[target.idColumn] },
    );
  }

  return stats;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const keyring = getKeyring();
  console.log(`[secrets:rotate] current key version: ${keyring.currentVersion}, known versions: ${[...keyring.keys.keys()].join(', ')}`);
  console.log(`[secrets:rotate] mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);

  let totalRotated = 0;
  let totalFailed = 0;
  for (const target of TARGETS) {
    const stats = await rotateTable(target, dryRun);
    console.log(`  ${target.table}: scanned=${stats.scanned} rotated=${stats.rotated} failed=${stats.failed}`);
    totalRotated += stats.rotated;
    totalFailed += stats.failed;
  }
  console.log(`[secrets:rotate] done. rotated=${totalRotated} failed=${totalFailed}`);

  await closeDatabase();
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('[secrets:rotate] fatal', error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
