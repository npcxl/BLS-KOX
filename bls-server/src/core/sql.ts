export interface SqlFragment {
  sql: string;
  params: Record<string, unknown>;
}

export function joinConditions(conditions: SqlFragment[]): SqlFragment {
  const validConditions = conditions.filter((condition) => {
    return condition.sql && condition.sql.trim().length > 0;
  });

  if (validConditions.length === 0) {
    return {
      sql: "",
      params: {},
    };
  }

  return {
    sql: `WHERE ${validConditions.map((item) => item.sql).join(" AND ")}`,
    params: Object.assign({}, ...validConditions.map((item) => item.params)),
  };
}

export function likeCondition(column: string, param: string, value: unknown): SqlFragment {
  if (value === undefined || value === null || value === "") return { sql: "", params: {} };
  return { sql: `${column} LIKE :${param}`, params: { [param]: `%${String(value)}%` } };
}

export function eqCondition(column: string, param: string, value: unknown): SqlFragment {
  if (value === undefined || value === null || value === "") return { sql: "", params: {} };
  return { sql: `${column} = :${param}`, params: { [param]: value } };
}
