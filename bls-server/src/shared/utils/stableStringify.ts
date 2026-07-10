/**
 * 稳定 JSON 序列化：按 key 排序，确保相同对象生成相同的字符串。
 * 用于 HMAC 签名的 Body 序列化。
 */

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((k) => `"${k}":${stableStringify((value as Record<string, unknown>)[k])}`);
    return '{' + pairs.join(',') + '}';
  }
  return String(value);
}
