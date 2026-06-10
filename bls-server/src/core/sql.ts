export interface SqlFragment {
  sql: string;
  params: Record<string, unknown>;
}

export function joinConditions(conditions: SqlFragment[]): SqlFragment {
  const active = conditions.filter((item) => item.sql.trim().length > 0);
  if (active.length === 0) return { sql: '', params: {} };
  return {
    sql: `WHERE ${active.map((item) => `(${item.sql})`).join(' AND ')}`,
    params: Object.assign({}, ...active.map((item) => item.params)),
  };
}

export function likeCondition(column: string, param: string, value: unknown): SqlFragment {
  if (value === undefined || value === null || value === '') return { sql: '', params: {} };
  return { sql: `${column} LIKE :${param}`, params: { [param]: `%${String(value)}%` } };
}

export function eqCondition(column: string, param: string, value: unknown): SqlFragment {
  if (value === undefined || value === null || value === '') return { sql: '', params: {} };
  return { sql: `${column} = :${param}`, params: { [param]: value } };
}
