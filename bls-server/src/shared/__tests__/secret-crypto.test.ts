/**
 * 阶段五：敏感数据信封加密（AES-256-GCM）单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  needsRotation,
  rotateSecret,
  generateMasterKey,
  resetKeyringCache,
} from '../utils/secret-crypto';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  delete process.env.SECRET_ENCRYPTION_KEY;
  delete process.env.SECRET_ENCRYPTION_KEY_VERSION;
  delete process.env.SECRET_ENCRYPTION_KEY_PREVIOUS;
  process.env.JWT_SECRET = 'unit-test-jwt-secret-0123456789ab';
  resetKeyringCache();
}

beforeEach(resetEnv);
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  resetKeyringCache();
});

describe('secret-crypto', () => {
  it('加密结果带 enc:v1 前缀，且不包含明文', () => {
    const plain = 'sk-super-secret-value';
    const encrypted = encryptSecret(plain)!;
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain(plain);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('解密可还原明文', () => {
    const plain = 'sk-super-secret-value';
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it('相同明文两次加密产生不同密文（随机 IV）', () => {
    const a = encryptSecret('same-value')!;
    const b = encryptSecret('same-value')!;
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('密文被篡改 → 解密失败（GCM 认证）', () => {
    const encrypted = encryptSecret('tamper-me')!;
    const parts = encrypted.split(':');
    const tamperedCt = Buffer.from(parts[5], 'base64');
    tamperedCt[0] = tamperedCt[0] ^ 0xff;
    parts[5] = tamperedCt.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('未知密钥版本 → 解密失败', () => {
    const encrypted = encryptSecret('value')!;
    const parts = encrypted.split(':');
    parts[2] = 'v999';
    expect(() => decryptSecret(parts.join(':'))).toThrow(/unknown secret key version/);
  });

  it('兼容历史明文（无前缀原样返回）', () => {
    expect(decryptSecret('legacy-plain-value')).toBe('legacy-plain-value');
    expect(isEncrypted('legacy-plain-value')).toBe(false);
  });

  it('null / undefined / 空串处理', () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret(undefined)).toBeNull();
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret(null)).toBeNull();
  });

  it('已加密的值不会二次加密', () => {
    const once = encryptSecret('value')!;
    expect(encryptSecret(once)).toBe(once);
  });

  it('主密钥来自环境变量，不写入密文之外的任何地方', () => {
    process.env.SECRET_ENCRYPTION_KEY = generateMasterKey();
    process.env.SECRET_ENCRYPTION_KEY_VERSION = 'v7';
    resetKeyringCache();

    const encrypted = encryptSecret('db-password')!;
    expect(encrypted.startsWith('enc:v1:v7:')).toBe(true);
    expect(encrypted).not.toContain(process.env.SECRET_ENCRYPTION_KEY);
    expect(decryptSecret(encrypted)).toBe('db-password');
    expect(needsRotation(encrypted)).toBe(false);
  });

  it('密钥轮换：新主密钥 + PREVIOUS 可解密历史数据，轮换后版本更新', () => {
    // v1 写入
    process.env.SECRET_ENCRYPTION_KEY = generateMasterKey();
    process.env.SECRET_ENCRYPTION_KEY_VERSION = 'v1';
    resetKeyringCache();
    const old = encryptSecret('rotate-me')!;

    // 轮换到 v2，v1 作为历史密钥
    const oldKey = process.env.SECRET_ENCRYPTION_KEY!;
    process.env.SECRET_ENCRYPTION_KEY = generateMasterKey();
    process.env.SECRET_ENCRYPTION_KEY_VERSION = 'v2';
    process.env.SECRET_ENCRYPTION_KEY_PREVIOUS = `v1:${oldKey}`;
    resetKeyringCache();

    expect(decryptSecret(old)).toBe('rotate-me');
    expect(needsRotation(old)).toBe(true);

    const rotated = rotateSecret(old)!;
    expect(rotated).not.toBe(old);
    expect(rotated.split(':')[2]).toBe('v2');
    expect(needsRotation(rotated)).toBe(false);
    expect(decryptSecret(rotated)).toBe('rotate-me');
  });

  it('generateMasterKey 返回 32 字节的 base64', () => {
    const key = generateMasterKey();
    expect(Buffer.from(key, 'base64').length).toBe(32);
  });
});
