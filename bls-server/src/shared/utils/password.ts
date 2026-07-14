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

// ============ 统一入口（保留旧签名兼容） ============

/**
 * 统一哈希密码（默认 Argon2id）
 * @deprecated 新代码应使用 hashPasswordArgon2
 */
export async function hashPassword(password: string): Promise<string> {
  return hashPasswordArgon2(password);
}

/**
 * 统一验证密码
 * @param password 前端传入的密码（可能是 MD5 或明文）
 * @param hash 数据库中存储的哈希值
 * @param algorithm 密码算法，默认 'md5' 兼容老数据
 */
export async function verifyPassword(
  password: string,
  hash: string,
  algorithm: PasswordAlgorithm = 'md5',
): Promise<boolean> {
  if (algorithm === 'argon2id') {
    // 前端发送的是 MD5(password)，Argon2id 存储的是 argon2id(md5(password))
    // 所以验证时用前端传过来的值（已经是 MD5）直接 verify
    return verifyPasswordArgon2(password, hash);
  }
  // MD5 兼容模式
  return verifyPasswordMd5(password, hash);
}

/** 判断哈希值是否为 Argon2id 格式（以 $argon2 开头） */
export function isArgon2Hash(hash: string): boolean {
  return hash.startsWith('$argon2');
}

/** 从哈希值推断算法 */
export function inferAlgorithm(hash: string): PasswordAlgorithm {
  return isArgon2Hash(hash) ? 'argon2id' : 'md5';
}
