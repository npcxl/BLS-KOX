/**
 * CRUD 字段命名转换工具
 *
 * 数据库列 snake_case ↔ API 字段 camelCase。
 * 独立成文件以避免 crud.ts 与 crud-config.ts 之间的循环依赖。
 */

/** snake_case → camelCase */
export function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** camelCase → snake_case */
export function toSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

/** snake_case → camelCase（整行） */
export function rowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) result[toCamelKey(key)] = value;
  return result;
}
