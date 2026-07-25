#!/usr/bin/env node

/**
 * release-version.mjs — 统一语义化版本管理
 *
 * 用法:
 *   node scripts/release-version.mjs patch      → 1.0.0 → 1.0.1
 *   node scripts/release-version.mjs minor      → 1.0.0 → 1.1.0
 *   node scripts/release-version.mjs major      → 1.0.0 → 2.0.0
 *   node scripts/release-version.mjs 1.2.3      → 直接设为 1.2.3
 *
 * 更新:
 *   - 根目录 VERSION
 *   - 根目录 package.json
 *   - bls-admin/package.json
 *   - bls-server/package.json (如存在 version 字段)
 *   - bls-ai-service/package.json
 *   - bls-event-service/package.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function readVersion(filePath) {
  return readFileSync(filePath, 'utf-8').trim();
}

function writeVersion(filePath, version) {
  writeFileSync(filePath, version + '\n', 'utf-8');
  console.log(`  ✓ ${filePath} → ${version}`);
}

function updatePackageJson(filePath, newVersion) {
  if (!existsSync(filePath)) return;
  const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (!pkg.version) return;
  const old = pkg.version;
  pkg.version = newVersion;
  writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ ${filePath} → ${old} → ${newVersion}`);
}

function bump(version, type) {
  const m = version.match(SEMVER_RE);
  if (!m) throw new Error(`无效版本号: ${version}`);
  let [, major, minor, patch] = m;
  major = Number(major);
  minor = Number(minor);
  patch = Number(patch);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (SEMVER_RE.test(type)) return type;
  throw new Error(`无效 bump 类型: ${type}`);
}

function hasUncommittedChanges() {
  try {
    const out = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

// ====== main ======
const arg = process.argv[2];
if (!arg) {
  console.error('用法: node scripts/release-version.mjs <patch|minor|major|1.2.3>');
  process.exit(1);
}

// 检查未提交修改
if (hasUncommittedChanges()) {
  console.warn('⚠️  工作区存在未提交修改，请先提交或暂存。');
  process.exit(1);
}

// 读取当前版本
const versionFile = resolve(ROOT, 'VERSION');
if (!existsSync(versionFile)) {
  console.error('❌ 根目录 VERSION 文件不存在');
  process.exit(1);
}

const currentVersion = readVersion(versionFile);
if (!SEMVER_RE.test(currentVersion)) {
  console.error(`❌ 当前版本号无效: ${currentVersion}`);
  process.exit(1);
}

// 计算新版本
const newVersion = bump(currentVersion, arg);
console.log(`\n📦 ${currentVersion} → ${newVersion}\n`);

// 更新 VERSION 文件
writeVersion(versionFile, newVersion);

// 更新各 package.json
const packages = [
  'package.json',                  // 根
  'bls-admin/package.json',
  'bls-server/package.json',
  'bls-ai-service/package.json',
  'bls-event-service/package.json',
];

for (const p of packages) {
  const fp = resolve(ROOT, p);
  updatePackageJson(fp, newVersion);
}

console.log(`\n✅ 版本已更新到 ${newVersion}`);
console.log('\n下一步 Git 命令:');
console.log(`  git add VERSION package.json bls-*/package.json`);
console.log(`  git commit -m "chore: bump version to ${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push origin main --tags`);
console.log();
