/**
 * 敏感数据信封加密（阶段五）
 *
 * 算法：AES-256-GCM（认证加密，防篡改）
 * 存储格式：`enc:v1:<keyVersion>:<ivBase64>:<authTagBase64>:<ciphertextBase64>`
 *
 * 主密钥来源（**绝不写入数据库或日志**）：
 *   - `SECRET_ENCRYPTION_KEY`           当前主密钥，base64 编码的 32 字节
 *   - `SECRET_ENCRYPTION_KEY_VERSION`   当前密钥版本号，默认 `v1`
 *   - `SECRET_ENCRYPTION_KEY_PREVIOUS`  历史密钥，格式 `v0:<base64>,vX:<base64>`，仅用于解密
 *
 * 生产环境要求显式配置 `SECRET_ENCRYPTION_KEY`；未配置时（开发环境）从 `JWT_SECRET`
 * 通过 HKDF 派生出确定性密钥，保证任何环境都不会把敏感字段以明文落库。
 *
 * 轮换：设置新的 `SECRET_ENCRYPTION_KEY` + 提高 `SECRET_ENCRYPTION_KEY_VERSION`，
 * 把旧值放进 `SECRET_ENCRYPTION_KEY_PREVIOUS`，然后运行 `npm run secrets:rotate`。
 */
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const FORMAT = 'v1';
const PREFIX = `enc:${FORMAT}:`;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const HKDF_SALT = 'bls-kox-secret-envelope';
const HKDF_INFO = 'secret-encryption';

export interface Keyring {
  currentVersion: string;
  keys: Map<string, Buffer>;
}

let cachedKeyring: Keyring | null = null;

function decodeKey(raw: string): Buffer {
  const value = raw.trim();
  if (!value) throw new Error('secret encryption key is empty');
  let key: Buffer;
  try {
    key = Buffer.from(value, 'base64');
  } catch {
    throw new Error('secret encryption key must be base64 encoded');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(`secret encryption key must decode to ${KEY_LENGTH} bytes (got ${key.length})`);
  }
  return key;
}

/** 开发环境回退：从 JWT_SECRET 通过 HKDF 派生确定性密钥 */
function deriveFromJwtSecret(): Buffer {
  const secret = process.env.JWT_SECRET ?? 'please_change_me_dev_only';
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from(HKDF_SALT, 'utf8'), Buffer.from(HKDF_INFO, 'utf8'), KEY_LENGTH),
  );
}

export function getKeyring(): Keyring {
  if (cachedKeyring) return cachedKeyring;

  const keys = new Map<string, Buffer>();
  const primary = process.env.SECRET_ENCRYPTION_KEY?.trim();
  const currentVersion = process.env.SECRET_ENCRYPTION_KEY_VERSION?.trim() || 'v1';

  if (primary) {
    keys.set(currentVersion, decodeKey(primary));
  } else {
    keys.set(currentVersion, deriveFromJwtSecret());
  }

  const previous = (process.env.SECRET_ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of previous) {
    const idx = entry.indexOf(':');
    if (idx <= 0) continue;
    const version = entry.slice(0, idx).trim();
    const material = entry.slice(idx + 1).trim();
    if (!version || !material || keys.has(version)) continue;
    try {
      keys.set(version, decodeKey(material));
    } catch {
      // 历史密钥解析失败不应阻止启动（仅影响旧数据解密）
    }
  }

  cachedKeyring = { currentVersion, keys };
  return cachedKeyring;
}

/** 测试用：重置缓存的密钥环 */
export function resetKeyringCache(): void {
  cachedKeyring = null;
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * 加密敏感值。null / undefined / 空串原样返回；已加密的值不会二次加密。
 */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  const value = String(plain);
  if (!value) return value;
  if (isEncrypted(value)) return value;

  const { currentVersion, keys } = getKeyring();
  const key = keys.get(currentVersion);
  if (!key) throw new Error(`missing secret encryption key for version ${currentVersion}`);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${currentVersion}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * 解密敏感值。
 * 兼容历史明文（无 `enc:` 前缀时原样返回），因此可以在未全量迁移的库上平滑上线。
 */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (payload === null || payload === undefined) return null;
  const value = String(payload);
  if (!value) return value;
  if (!isEncrypted(value)) return value;

  const parts = value.split(':');
  // enc / v1 / keyVersion / iv / authTag / ciphertext
  if (parts.length !== 6) throw new Error('invalid encrypted secret format');

  const [, , keyVersion, ivB64, tagB64, ctB64] = parts;
  const key = getKeyring().keys.get(keyVersion);
  if (!key) throw new Error(`unknown secret key version: ${keyVersion}`);

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return plain.toString('utf8');
}

/** 是否需要轮换（密文使用的密钥版本不是当前版本） */
export function needsRotation(value: unknown): boolean {
  if (!isEncrypted(value)) return false;
  const parts = String(value).split(':');
  if (parts.length !== 6) return true;
  return parts[2] !== getKeyring().currentVersion;
}

/** 用当前主密钥重新加密（轮换时调用） */
export function rotateSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!isEncrypted(value)) return encryptSecret(value);
  const plain = decryptSecret(value);
  return encryptSecret(plain);
}

/** 生成一个新的 base64 主密钥（运维用） */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}
