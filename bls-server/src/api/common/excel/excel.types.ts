export type ExcelImportRowError = {
  rowNumber: number;
  errors: string[];
  raw: Record<string, any>;
};
