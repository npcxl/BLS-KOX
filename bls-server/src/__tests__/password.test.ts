import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  hashPasswordArgon2,
  hashPasswordCanonical,
  hashPasswordMd5,
  normalizePasswordInput,
  verifyPassword,
  verifyPasswordArgon2,
  verifyPasswordMd5,
  isArgon2Hash,
  inferAlgorithm,
} from '../shared/utils/password';

describe('Password Hashing', () => {
  const plainPassword = '123456';

  describe('hashPasswordArgon2', () => {
    it('should generate an Argon2id hash', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should generate different hashes for same password', async () => {
      const h1 = await hashPasswordArgon2(plainPassword);
      const h2 = await hashPasswordArgon2(plainPassword);
      expect(h1).not.toBe(h2);
    });
  });

  describe('verifyPasswordArgon2', () => {
    it('should verify correct password', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      const result = await verifyPasswordArgon2(plainPassword, hash);
      expect(result).toBe(true);
    });

    it('should reject wrong password', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      const result = await verifyPasswordArgon2('wrong', hash);
      expect(result).toBe(false);
    });
  });

  describe('verifyPasswordMd5', () => {
    it('should verify correct MD5 password', () => {
      const hash = hashPasswordMd5(plainPassword);
      const result = verifyPasswordMd5(plainPassword, hash);
      expect(result).toBe(true);
    });

    it('should reject wrong MD5 password', () => {
      const hash = hashPasswordMd5(plainPassword);
      const result = verifyPasswordMd5('wrong', hash);
      expect(result).toBe(false);
    });
  });

  describe('verifyPassword (unified)', () => {
    it('should verify Argon2id password', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      const result = await verifyPassword(plainPassword, hash, 'argon2id');
      expect(result).toBe(true);
    });

    it('should verify MD5 password', async () => {
      const hash = hashPasswordMd5(plainPassword);
      const result = await verifyPassword(plainPassword, hash, 'md5');
      expect(result).toBe(true);
    });

    it('should default to md5 algorithm for backward compat', async () => {
      const hash = hashPasswordMd5(plainPassword);
      const result = await verifyPassword(plainPassword, hash);
      expect(result).toBe(true);
    });

    it('should reject wrong password for Argon2id', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      const result = await verifyPassword('wrong', hash, 'argon2id');
      expect(result).toBe(false);
    });
  });

  describe('isArgon2Hash', () => {
    it('should return true for Argon2id hash', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      expect(isArgon2Hash(hash)).toBe(true);
    });

    it('should return false for MD5 hash', () => {
      const hash = hashPasswordMd5(plainPassword);
      expect(isArgon2Hash(hash)).toBe(false);
    });
  });

  describe('inferAlgorithm', () => {
    it('should infer argon2id from hash prefix', async () => {
      const hash = await hashPasswordArgon2(plainPassword);
      expect(inferAlgorithm(hash)).toBe('argon2id');
    });

    it('should infer md5 from hash prefix', () => {
      const hash = hashPasswordMd5(plainPassword);
      expect(inferAlgorithm(hash)).toBe('md5');
    });
  });

  describe('hashPassword (default)', () => {
    it('should use Argon2id by default', async () => {
      const hash = await hashPassword(plainPassword);
      expect(isArgon2Hash(hash)).toBe(true);
    });
  });

  // 存储规范：argon2id(md5(password))。前端登录接口发 md5(明文)，改密 / 重置 / 建租户发明文，
  // 两种入参都必须能验证通过，否则会出现「登录能过、修改密码报旧密码不正确」。
  describe('normalizePasswordInput', () => {
    it('should hash plaintext with md5', () => {
      expect(normalizePasswordInput(plainPassword)).toBe(hashPasswordMd5(plainPassword));
    });

    it('should pass through an existing 32-char md5 (lower-cased)', () => {
      const md5 = hashPasswordMd5(plainPassword);
      expect(normalizePasswordInput(md5)).toBe(md5);
      expect(normalizePasswordInput(md5.toUpperCase())).toBe(md5);
    });
  });

  describe('hashPasswordCanonical + verifyPassword (cross-endpoint compatibility)', () => {
    it('should store argon2id(md5(password))', async () => {
      const hash = await hashPasswordCanonical(plainPassword);
      expect(isArgon2Hash(hash)).toBe(true);
      expect(await verifyPasswordArgon2(hashPasswordMd5(plainPassword), hash)).toBe(true);
      expect(await verifyPasswordArgon2(plainPassword, hash)).toBe(false);
    });

    it('should verify plaintext input against a canonical hash (changePassword)', async () => {
      const hash = await hashPasswordCanonical(plainPassword);
      expect(await verifyPassword(plainPassword, hash, 'argon2id')).toBe(true);
    });

    it('should verify md5 input against a canonical hash (login)', async () => {
      const hash = await hashPasswordCanonical(plainPassword);
      expect(await verifyPassword(hashPasswordMd5(plainPassword), hash, 'argon2id')).toBe(true);
    });

    it('should still verify legacy argon2id(plaintext) hashes with a plaintext input', async () => {
      // 早期 createUser / changePassword 写入过 argon2id(明文)：改密（发明文）仍可通过校验。
      // 注意登录接口发的是 md5(明文)，无法逆推出明文 ⇒ 这类历史账号只能靠管理员重置密码修复。
      const hash = await hashPasswordArgon2(plainPassword);
      expect(await verifyPassword(plainPassword, hash, 'argon2id')).toBe(true);
      expect(await verifyPassword(hashPasswordMd5(plainPassword), hash, 'argon2id')).toBe(false);
    });

    it('should treat non-md5 algorithm labels (e.g. Java "argon2") as Argon2', async () => {
      const hash = await hashPasswordCanonical(plainPassword);
      expect(await verifyPassword(hashPasswordMd5(plainPassword), hash, 'argon2' as any)).toBe(true);
    });

    it('should reject a wrong password', async () => {
      const hash = await hashPasswordCanonical(plainPassword);
      expect(await verifyPassword('wrong-password', hash, 'argon2id')).toBe(false);
    });
  });
});
