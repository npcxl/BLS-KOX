export type BusinessTableKey =
  | 'productionLine'
  | 'product'
  | 'order'
  | 'financeRecord'
  | 'salesRecord'
  | 'inventory';

export interface PageQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
}

export interface TableConfig<TInput = Record<string, unknown>> {
  key: BusinessTableKey;
  tableName: string;
  idColumn: string;
  tenantAware: boolean;
  searchColumns: string[];
  filterColumns?: Record<string, string>;
  dateColumn?: string;
  listColumns: string[];
  detailColumns: string[];
  createColumns: string[];
  updateColumns: string[];
  defaults?: Record<string, unknown>;
  mapInput(input: TInput): Record<string, unknown>;
}
