/**
 * 依赖自检 CLI：`npm run services:check`
 *
 * 与 bls-server 启动时执行的是**同一份注册表**（src/observability/service-health.ts），
 * 因此结论与启动日志、GET /api/ready、GET /internal/services 完全一致。
 * 用途：部署后自检、排障时确认「到底哪个服务没开」（例如前端只看到 504 的场合）。
 *
 * 退出码：核心依赖（MySQL / Redis）不可用 → 1；其余情况 → 0。
 * 非核心依赖不可用只打印 [FAIL]，不改变退出码（功能降级，服务主体仍可用）。
 */
import { closeDatabase } from '../core/database';
import { closeRedis } from '../shared/utils/redis';
import { findFatalDeps, formatServiceReport, probeServices } from '../observability/service-health';

async function main(): Promise<void> {
  const results = await probeServices();
  console.log(formatServiceReport(results));

  const fatal = findFatalDeps(results);
  if (fatal.length > 0) {
    console.log(
      `  核心依赖不可用：${fatal.map((r) => r.name).join('、')}`
      + ' —— 请先启动它们，再启动 bls-server（生产环境严格模式会直接拒绝启动）。',
    );
  }

  // 释放探测过程中建立的连接，否则 CLI 会因为残留句柄不退出
  await closeRedis().catch(() => { /* Redis 不可达时忽略 */ });
  await closeDatabase().catch(() => { /* 连接池未创建或已关闭时忽略 */ });

  process.exitCode = fatal.length > 0 ? 1 : 0;
  // 兜底：清理后仍被残留句柄拖住时强制结束（定时器 unref，不会自己阻止退出）
  setTimeout(() => process.exit(process.exitCode ?? 0), 3_000).unref();
}

void main().catch((error) => {
  console.error('[services] 自检执行失败：', error);
  process.exitCode = 1;
});
