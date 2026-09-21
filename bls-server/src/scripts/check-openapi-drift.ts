/**
 * OpenAPI drift 检查（阶段七）
 *
 * 重新生成 openapi.json，与仓库中已提交的版本比较：
 *   - 一致 → 退出 0
 *   - 不一致 → 打印 diff 摘要、恢复原文件、退出 1
 *
 * 用法：npm run openapi:check
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const serverRoot = join(__dirname, '..', '..');
const specPath = join(serverRoot, 'openapi.json');
const generator = join(__dirname, 'generate-openapi.ts');

if (!existsSync(specPath)) {
  console.error('[openapi:check] openapi.json 不存在，请先运行 npm run openapi');
  process.exit(1);
}

const before = readFileSync(specPath, 'utf-8');

console.log('[openapi:check] regenerating spec for comparison...');
try {
  execFileSync('npx', ['tsx', generator], {
    cwd: serverRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} catch (error) {
  console.error('[openapi:check] 生成失败', error);
  process.exit(1);
}

const after = readFileSync(specPath, 'utf-8');

if (before === after) {
  console.log('[openapi:check] OK — openapi.json 与代码一致');
  process.exit(0);
}

// 恢复原文件，保持工作区干净
writeFileSync(specPath, before, 'utf-8');

const beforeLines = before.split('\n');
const afterLines = after.split('\n');
let firstDiff = -1;
const max = Math.max(beforeLines.length, afterLines.length);
for (let i = 0; i < max; i++) {
  if (beforeLines[i] !== afterLines[i]) { firstDiff = i; break; }
}

console.error('[openapi:check] DRIFT DETECTED — openapi.json 与代码不一致');
console.error(`  提交版本: ${beforeLines.length} 行 / 重新生成: ${afterLines.length} 行`);
if (firstDiff >= 0) {
  console.error(`  首个差异位于第 ${firstDiff + 1} 行:`);
  console.error(`    - ${(beforeLines[firstDiff] ?? '').trim().slice(0, 160)}`);
  console.error(`    + ${(afterLines[firstDiff] ?? '').trim().slice(0, 160)}`);
}
console.error('  请运行 npm run openapi 并提交更新后的 openapi.json');
process.exit(1);
