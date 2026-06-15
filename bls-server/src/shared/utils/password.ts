import crypto from 'crypto';

export function hashPassword(password: string): Promise<string> {
  return Promise.resolve(crypto.createHash('md5').update(password).digest('hex'));
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  // 兼容前端可能直接发 MD5，或发送明文（后端再做 MD5）
  // 因为前端即将改为发送 MD5，所以这里如果是纯 MD5 字符串比较即可
  const inputHash = password.length === 32 ? password : crypto.createHash('md5').update(password).digest('hex');
  return Promise.resolve(inputHash.toLowerCase() === hash.toLowerCase());
}
