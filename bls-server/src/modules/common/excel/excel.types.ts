export type ExcelColumnType = "string" | "number" | "boolean" | "date" | "enum" | "json";

export type ExcelEnumOption = {
  label: string;
  value: string | number;
};

export type ExcelColumnRule = {
  key: string;
  title: string;
  dbField: string;
  required?: boolean;
  type?: ExcelColumnType;
  enumValues?: ExcelEnumOption[];
  unique?: boolean;
  readOnly?: boolean;
  exportOnly?: boolean;
  importOnly?: boolean;
  extJson?: boolean;
  extJsonKey?: string;
  dictionaryCode?: string;
  width?: number;
  comment?: string;
};

export type ExcelImportStrategy = {
  batchSize?: number;
  rollbackOnError?: boolean;
  uniqueFields?: string[];
};

export type ExcelMetaConfig = {
  metaKey: string;
  moduleName: string;
  tableName: string;
  permissionKey: string;
  tenantAware?: boolean;
  exportColumns: ExcelColumnRule[];
  importColumns: ExcelColumnRule[];
  importStrategy?: ExcelImportStrategy;
  queryBuilder?: (query: Record<string, unknown>) => {
    sql: string;
    params: Record<string, unknown>;
  };
  mapRow?: (row: Record<string, any>) => Record<string, any>;
  mapImportRow?: (row: Record<string, any>) => Record<string, any>;
};

export type ExcelExportMode = "all" | "limit" | "currentPage";

export type ExcelExportQuery = Record<string, any> & {
  metaKey: string;
  exportMode: ExcelExportMode;
  customMaxNum?: number;
};

export type ExcelImportResult = {
  successCount: number;
  failedCount: number;
  totalCount: number;
  errorFileName?: string;
};

export type ExcelImportRowError = {
  rowNumber: number;
  errors: string[];
  raw: Record<string, any>;
};
