/**
 * JWT 工具函数：解码 Token 中 exp 字段，判断是否过期
 */

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // 补足 base64 长度
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getJwtExp(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp;
}

/**
 * 判断 JWT 是否已过期（预留 30s 缓冲避免边界情况）
 */
export function isJwtExpired(token: string): boolean {
  const exp = getJwtExp(token);
  if (exp === null) {
    // 无法解析则保守认为未过期，由服务端判断
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return exp - 30 <= now;
}
