import crypto from 'crypto';
import * as argon2 from 'argon2';

export type PasswordAlgorithm = 'md5' | 'argon2id';

// ============ Argon2id ============

/** 使用 Argon2id 哈希密码（新用户默认算法） */
export async function hashPasswordArgon2(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });
}

/** 验证 Argon2id 密码 */
export async function verifyPasswordArgon2(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// ============ MD5（仅用于兼容迁移） ============

/** MD5 哈希（仅用于老用户迁移，新用户不应使用） */
export function hashPasswordMd5(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}

/** 验证 MD5 密码（兼容老用户 + 前端发 MD5 的场景） */
export function verifyPasswordMd5(password: string, hash: string): boolean {
  // 兼容前端直接发 MD5，或发送明文（后端再做 MD5）
  const inputHash = password.length === 32 ? password : crypto.createHash('md5').update(password).digest('hex');
  return inputHash.toLowerCase() === hash.toLowerCase();
}

// ============ 存储规范归一化 ============

/**
 * 把任意入口收到的密码归一成「入库前统一处理的形态」：32 位 MD5（小写）。
 *
 * 为什么要归一：前端登录接口发的是 `md5(明文)`（`services/ant-design-pro/api.ts`），
 * 而改密 / 重置 / 建租户等接口发的是**明文**。历史实现里两种值各写各的，
 * 导致同一张表的 `password` 出现 `argon2id(md5(p))` 与 `argon2id(p)` 两种规范，
 * 于是「登录能过、修改密码报旧密码不正确」这类问题必然出现。
 *
 * 约定（与 Java 后端 `AuthService.verifyPassword` 一致）：
 * **存储统一为 `argon2id(md5(password))`**；已带 32 位十六进制的入参视为已归一，原样透传。
 */
export function normalizePasswordInput(password: unknown): string {
  const raw = String(password ?? '');
  return /^[a-f0-9]{32}$/i.test(raw) ? raw.toLowerCase() : hashPasswordMd5(raw);
}

/** 生成「存储规范」哈希 `argon2id(md5(password))` —— 所有写密码的地方都应使用它 */
export async function hashPasswordCanonical(password: unknown): Promise<string> {
  return hashPasswordArgon2(normalizePasswordInput(password));
}

// ============ 统一入口（保留旧签名兼容） ============

/**
 * 统一哈希密码（默认 Argon2id，输出存储规范 `argon2id(md5(password))`）
 * @deprecated 新代码应使用 hashPasswordCanonical
 */
export async function hashPassword(password: string): Promise<string> {
  return hashPasswordCanonical(password);
}

/**
 * 统一验证密码
 * @param password 前端传入的密码（**可能是明文，也可能是 32 位 MD5**）
 * @param hash 数据库中存储的哈希值
 * @param algorithm 密码算法；默认 'md5' 兼容老数据，其余值（argon2id / argon2 / …）按 Argon2 处理
 */
export async function verifyPassword(
  password: string,
  hash: string,
  algorithm: PasswordAlgorithm = 'md5',
): Promise<boolean> {
  // 只有显式标记 md5 的才走 MD5 直比（该方法本身已同时兼容明文与 32 位 MD5）
  if (algorithm === 'md5') return verifyPasswordMd5(password, hash);

  // Argon2 分支：先按存储规范归一（md5）再验证
  const normalized = normalizePasswordInput(password);
  if (await verifyPasswordArgon2(normalized, hash)) return true;

  // 兼容历史不一致数据：早期 createUser / changePassword 写入过 argon2id(明文)
  const raw = String(password ?? '');
  if (raw === normalized) return false;
  return verifyPasswordArgon2(raw, hash);
}

/** 判断哈希值是否为 Argon2id 格式（以 $argon2 开头） */
export function isArgon2Hash(hash: string): boolean {
  return hash.startsWith('$argon2');
}

/** 从哈希值推断算法 */
export function inferAlgorithm(hash: string): PasswordAlgorithm {
  return isArgon2Hash(hash) ? 'argon2id' : 'md5';
}
