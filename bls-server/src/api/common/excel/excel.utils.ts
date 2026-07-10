import ExcelJS from 'exceljs';
import type { ExcelImportRowError } from './excel.types';

export const MAX_EXPORT_ROWS = 10000;

export function normalizeExportLimit(customMaxNum?: number) {
  if (!customMaxNum || Number.isNaN(Number(customMaxNum))) return MAX_EXPORT_ROWS;
  return Math.max(1, Math.min(MAX_EXPORT_ROWS, Number(customMaxNum)));
}

export function buildHeaderRow(columns: { title: string; required?: boolean }[]) {
  return columns.map((col) => {
    const tips = [];
    if (col.required) tips.push('必填');
    return tips.length ? `${col.title}（${tips.join('，')}）` : col.title;
  });
}

export function createErrorWorkbook(headers: string[], rows: ExcelImportRowError[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('导入错误明细');
  sheet.addRow([...headers, '错误原因']);
  for (const row of rows) {
    sheet.addRow([...Object.values(row.raw), row.errors.join('；')]);
  }
  return workbook;
}
