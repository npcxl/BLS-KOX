import ExcelJS from 'exceljs';
import type { ExcelColumnRule, ExcelImportRowError } from './excel.types';

export const MAX_EXPORT_ROWS = 10000;

export function normalizeExportLimit(customMaxNum?: number) {
  if (!customMaxNum || Number.isNaN(Number(customMaxNum))) return MAX_EXPORT_ROWS;
  return Math.max(1, Math.min(MAX_EXPORT_ROWS, Number(customMaxNum)));
}

export function normalizeColumns(columns: ExcelColumnRule[]) {
  return columns.filter((column) => !column.readOnly && !column.exportOnly);
}

export function buildHeaderRow(columns: ExcelColumnRule[]) {
  return columns.map((column) => {
    const tips = [];
    if (column.required) tips.push('必填');
    if (column.unique) tips.push('唯一');
    if (column.enumValues?.length) tips.push(`枚举: ${column.enumValues.map((item) => item.label).join('/')}`);
    if (column.comment) tips.push(column.comment);
    return `${column.title}${tips.length ? `（${tips.join('，')}）` : ''}`;
  });
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function splitJsonPath(path: string) {
  return path.split('.').filter(Boolean);
}

export function setNestedValue(target: Record<string, any>, path: string, value: any) {
  const keys = splitJsonPath(path);
  let cursor = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    cursor[key] ??= {};
    cursor = cursor[key];
  });
}

export function getNestedValue(target: Record<string, any>, path: string) {
  return splitJsonPath(path).reduce((acc: any, key) => acc?.[key], target);
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
