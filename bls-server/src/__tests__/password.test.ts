import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  hashPasswordArgon2,
  hashPasswordMd5,
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
});
