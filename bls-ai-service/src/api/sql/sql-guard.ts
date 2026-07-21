/**
 * SQL Guard — 只允许只读 SELECT 语句
 *
 * 安全策略：
 * - 禁止 DML: INSERT, UPDATE, DELETE, REPLACE, MERGE
 * - 禁止 DDL: CREATE, ALTER, DROP, TRUNCATE, RENAME
 * - 禁止 DCL: GRANT, REVOKE
 * - 禁止其他危险操作: EXEC, EXECUTE, CALL, LOAD, INTO OUTFILE, INTO DUMPFILE
 * - 只允许 SELECT / SHOW / DESCRIBE / EXPLAIN
 */

const FORBIDDEN_KEYWORDS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bREPLACE\b/i,
  /\bMERGE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bRENAME\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bCALL\b/i,
  /\bLOAD\b/i,
  /\bINTO\s+(OUTFILE|DUMPFILE)\b/i,

  // 多语句注入防护
  /;/g,
];

const ALLOWED_PREFIXES = [
  /^\s*SELECT\b/i,
  /^\s*SHOW\b/i,
  /^\s*DESCRIBE\b/i,
  /^\s*DESC\b/i,
  /^\s*EXPLAIN\b/i,
];

export interface SqlGuardResult {
  safe: boolean;
  reason?: string;
  sanitized?: string;
}

/**
 * 检查 SQL 语句是否安全
 * @param sql 原始 SQL（可能包含多条语句或注释）
 * @param tenantId 租户 ID（用于注入租户隔离条件）
 * @returns 安全检查结果
 */
export function checkSqlSafety(sql: string, tenantId?: string): SqlGuardResult {
  // 1. 移除注释
  let sanitized = sql
    .replace(/--.*$/gm, '')          // 单行注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 多行注释
    .trim();

  if (!sanitized) {
    return { safe: false, reason: 'SQL 语句为空' };
  }

  // 2. 检查多语句（分号）
  const statements = sanitized.split(';').filter((s) => s.trim());
  if (statements.length > 1) {
    return { safe: false, reason: '不允许执行多条 SQL 语句' };
  }

  // 3. 检查禁止关键字
  for (const regex of FORBIDDEN_KEYWORDS) {
    if (regex.test(sanitized)) {
      return { safe: false, reason: `SQL 包含禁止的操作: ${regex.source}` };
    }
  }

  // 4. 检查是否以允许的关键字开头
  const isAllowed = ALLOWED_PREFIXES.some((regex) => regex.test(sanitized));
  if (!isAllowed) {
    return { safe: false, reason: '只允许 SELECT / SHOW / DESCRIBE / EXPLAIN 操作' };
  }

  return { safe: true, sanitized };
}

/**
 * 注入 tenantId 到 SQL 的 WHERE 子句（租户隔离）
 * 简化实现：在 WHERE 条件后追加 AND tenant_id = ?
 * 注意：复杂 SQL 可能需要更精细的 AST 分析
 */
export function injectTenantId(sql: string, tenantId: string): string {
  // 简单场景：在现有 WHERE 后追加
  if (/\bWHERE\b/i.test(sql)) {
    return sql.replace(/\bWHERE\b/i, `WHERE tenant_id = '${tenantId}' AND `);
  }

  // 如果没有 WHERE，在 GROUP BY / ORDER BY / LIMIT 前插入
  const insertBefore = /\b(GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING|;)\b/i;
  const match = sql.match(insertBefore);
  if (match) {
    const idx = match.index!;
    return sql.slice(0, idx) + ` WHERE tenant_id = '${tenantId}' ` + sql.slice(idx);
  }

  // 末尾追加
  return `${sql} WHERE tenant_id = '${tenantId}'`;
}
