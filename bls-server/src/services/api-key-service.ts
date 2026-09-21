/**
 * ApiKeyService（阶段六）
 *
 * 外部 API 凭据：
 *   - `key_id`            对外公开标识（`X-Api-Key`）
 *   - `secret`            仅创建时返回一次；数据库中只保留 AES-256-GCM 密文
 *   - `key_hash`          `sha256("<keyId>.<secret>")`，客户端传完整 Key 时用常量时间比对
 *   - `scopes`            read / write / *（按 HTTP 方法判定所需 scope）
 *   - `expire_at` / `revoked_at` / `status`
 */
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { execute, query, queryOne } from '../core/database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { encryptSecret, decryptSecret } from '../shared/utils/secret-crypto';

export interface ApiKeyRow {
  apiKeyId: string;
  tenantId: string;
  name: string;
  keyId: string;
  keyHash: string;
  encryptedSecret: string | null;
  secretPreview: string | null;
  scopes: string;
  status: string;
  expireAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  deleted: number;
}

export interface CreatedApiKey {
  apiKeyId: string;
  keyId: string;
  secret: string;
  /** 完整 Key（`<keyId>.<secret>`），仅此一次返回 */
  apiKey: string;
  scopes: string[];
  expireAt: string | null;
}

export const API_KEY_SCOPES = ['read', 'write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 常量时间字符串比较（长度不同也安全） */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // 仍然做一次比较，避免长度差异造成的时序泄露
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function parseScopes(scopes: string | null | undefined): string[] {
  return String(scopes ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 判断 scope 是否满足指定操作 */
export function scopesAllow(scopes: string[] | string, required: ApiKeyScope): boolean {
  const list = Array.isArray(scopes) ? scopes : parseScopes(scopes);
  if (list.includes('*')) return true;
  return list.includes(required);
}

const SELECT_COLUMNS = `
  api_key_id AS apiKeyId, tenant_id AS tenantId, name, key_id AS keyId, key_hash AS keyHash,
  encrypted_secret AS encryptedSecret, secret_preview AS secretPreview, scopes, status,
  expire_at AS expireAt, revoked_at AS revokedAt, last_used_at AS lastUsedAt,
  created_by AS createdBy, created_at AS createdAt, deleted
`;

export class ApiKeyService {
  /** 判断 Key 是否可用（状态 / 撤销 / 有效期） */
  isUsable(row: ApiKeyRow, now: Date = new Date()): boolean {
    if (Number(row.deleted) !== 0) return false;
    if (String(row.status) !== '0') return false;
    if (row.revokedAt) return false;
    if (row.expireAt) {
      const expires = new Date(String(row.expireAt).replace(' ', 'T'));
      if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return false;
    }
    return true;
  }

  /** 生成并落库一个新的 API Key；返回一次性的明文 secret */
  async create(params: {
    tenantId: string;
    name: string;
    scopes: string[];
    expireAt?: string | null;
    createdBy?: string | null;
  }): Promise<CreatedApiKey> {
    const keyId = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const apiKey = `${keyId}.${secret}`;
    const keyHash = sha256Hex(apiKey);
    const encryptedSecret = encryptSecret(secret)!;
    const apiKeyId = generateSnowflakeId();
    const scopes = params.scopes.length > 0 ? params.scopes : ['read'];

    await execute(
      `INSERT INTO sys_api_key
         (api_key_id, tenant_id, name, key_id, key_hash, encrypted_secret, secret_preview,
          scopes, status, expire_at, created_by)
       VALUES
         (:apiKeyId, :tenantId, :name, :keyId, :keyHash, :encryptedSecret, :secretPreview,
          :scopes, '0', :expireAt, :createdBy)`,
      {
        apiKeyId,
        tenantId: params.tenantId,
        name: params.name,
        keyId,
        keyHash,
        encryptedSecret,
        secretPreview: `${secret.slice(0, 4)}****${secret.slice(-4)}`,
        scopes: scopes.join(','),
        expireAt: params.expireAt ?? null,
        createdBy: params.createdBy ?? null,
      },
    );

    return { apiKeyId, keyId, secret, apiKey, scopes, expireAt: params.expireAt ?? null };
  }

  /** 按对外 Key（keyId 或 `<keyId>.<secret>`）解析记录 */
  async resolve(rawApiKey: string): Promise<{ record: ApiKeyRow; secret: string } | null> {
    const raw = String(rawApiKey ?? '').trim();
    if (!raw) return null;
    const dotIndex = raw.indexOf('.');
    const keyId = dotIndex > 0 ? raw.slice(0, dotIndex) : raw;
    if (!keyId) return null;

    const row = await queryOne<ApiKeyRow>(
      `SELECT ${SELECT_COLUMNS} FROM sys_api_key WHERE key_id = :keyId LIMIT 1`,
      { keyId },
    );
    if (!row) return null;
    if (!this.isUsable(row)) return null;

    // 客户端提供完整 Key 时，额外用 key_hash 做常量时间校验
    if (dotIndex > 0 && !timingSafeEqualString(sha256Hex(raw), String(row.keyHash))) {
      return null;
    }

    let secret: string | null = null;
    try {
      secret = decryptSecret(row.encryptedSecret);
    } catch {
      return null;
    }
    if (!secret) return null;

    return { record: row, secret };
  }

  async touchLastUsed(apiKeyId: string): Promise<void> {
    try {
      await execute(
        `UPDATE sys_api_key SET last_used_at = NOW() WHERE api_key_id = :id`,
        { id: apiKeyId },
      );
    } catch {
      // 更新失败不影响调用
    }
  }

  /** 撤销（立即失效，保留记录用于审计） */
  async revoke(tenantId: string, apiKeyId: string): Promise<boolean> {
    const result = await execute(
      `UPDATE sys_api_key
         SET status = '1', revoked_at = NOW()
       WHERE api_key_id = :id AND tenant_id = :tid AND deleted = 0 AND revoked_at IS NULL`,
      { id: apiKeyId, tid: tenantId },
    );
    return Number(result?.affectedRows ?? 0) > 0;
  }

  async list(tenantId: string): Promise<Array<Omit<ApiKeyRow, 'keyHash' | 'encryptedSecret'>>> {
    const rows = await query<ApiKeyRow>(
      `SELECT ${SELECT_COLUMNS} FROM sys_api_key
       WHERE tenant_id = :tid AND deleted = 0 ORDER BY created_at DESC`,
      { tid: tenantId },
    );
    return rows.map(({ keyHash, encryptedSecret, ...rest }) => rest);
  }
}

export const apiKeyService = new ApiKeyService();
