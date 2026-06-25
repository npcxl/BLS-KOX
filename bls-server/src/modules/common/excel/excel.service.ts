import type Koa from 'koa';
import ExcelJS from 'exceljs';
import { query, transaction } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getExcelMeta, listExcelMetas, registerExcelMetas } from './excel.registry';
import { excelMetas } from './excel.meta';
import type { ExcelExportQuery, ExcelImportResult, ExcelImportRowError, ExcelMetaConfig } from './excel.types';
import { buildHeaderRow, createErrorWorkbook, getNestedValue, MAX_EXPORT_ROWS, normalizeColumns, normalizeExportLimit, setNestedValue, workbookToBuffer } from './excel.utils';

registerExcelMetas(excelMetas);

function assertPermission(meta: ExcelMetaConfig, ctx: Koa.Context) {
  const user = ctx.state.user;
  if (!user) throw new Error('未登录或登录失效');
  if (!meta.permissionKey) return;
  const permissions = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
  if (permissions.length && !permissions.includes(meta.permissionKey) && !permissions.includes(`${meta.permissionKey}:all`)) {
    throw new Error('无权限访问该Excel功能');
  }
}

function toSqlColumn(column: ExcelMetaConfig['exportColumns'][number]) {
  return `${column.dbField} AS ${column.key}`;
}

export class ExcelService {
  getMeta(metaKey: string) {
    const meta = getExcelMeta(metaKey);
    if (!meta) throw new Error(`未找到Excel元数据配置: ${metaKey}`);
    return meta;
  }

  listMetas() {
    return listExcelMetas();
  }

  async buildTemplate(metaKey: string) {
    const meta = this.getMeta(metaKey);
    const columns = normalizeColumns(meta.importColumns);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${meta.moduleName}导入模板`);
    sheet.addRow(buildHeaderRow(columns));
    sheet.getRow(1).font = { bold: true };
    return { buffer: await workbookToBuffer(workbook), fileName: `${meta.moduleName}-导入模板.xlsx`, columns };
  }

  normalizeExportQuery(query: ExcelExportQuery) {
    const { pageNum, pageSize, current, metaKey, exportMode, customMaxNum, ...rest } = query as Record<string, any>;
    void pageNum; void pageSize; void current; void metaKey; void exportMode; void customMaxNum;
    return rest;
  }

  async exportExcel(ctx: Koa.Context, query: ExcelExportQuery) {
    const meta = this.getMeta(query.metaKey);
    assertPermission(meta, ctx);
    const normalizedQuery = this.normalizeExportQuery(query);
    const limit = query.exportMode === 'limit' ? normalizeExportLimit(query.customMaxNum) : MAX_EXPORT_ROWS;
    const { sql, params } = await meta.queryBuilder?.(normalizedQuery) ?? { sql: '', params: {} };
    if (!sql) throw new Error('缺少导出查询配置');
    const rows = await queryDb(sql, params);
    const exportColumns = meta.exportColumns;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${meta.moduleName}导出`);
    sheet.addRow(exportColumns.map((c) => c.title));
    const limitedRows = rows.slice(0, limit);
    for (const row of limitedRows) {
      sheet.addRow(exportColumns.map((column) => {
        const value = column.extJsonKey ? getNestedValue(row as any, column.extJsonKey) : (row as any)[column.key];
        return value ?? '';
      }));
    }
    return { buffer: await workbookToBuffer(workbook), fileName: `${meta.moduleName}-导出.xlsx`, matchedCount: rows.length, exportCount: limitedRows.length };
  }

  async importExcel(ctx: Koa.Context, metaKey: string, file: Buffer): Promise<ExcelImportResult & { errorBuffer?: Buffer; matchedColumns?: string[] }> {
    const meta = this.getMeta(metaKey);
    assertPermission(meta, ctx);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('Excel文件为空');
    const importColumns = normalizeColumns(meta.importColumns);
    const header = (sheet.getRow(1)?.values as any)?.slice(1).map(String);
    const expectedHeader = buildHeaderRow(importColumns);
    if (header.length < expectedHeader.length) throw new Error('Excel表头与模板不匹配，缺少列');
    const errors: ExcelImportRowError[] = [];
    const records: Record<string, any>[] = [];
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      const raw: Record<string, any> = {};
      const rowErrors: string[] = [];
      importColumns.forEach((column, colIndex) => {
        const cell = row.getCell(colIndex + 1).value;
        raw[column.key] = cell ?? '';
        if (column.required && (cell === null || cell === undefined || cell === '')) rowErrors.push(`${column.title}不能为空`);
        if (column.enumValues?.length && cell && !column.enumValues.some((item) => String(item.value) === String(cell))) rowErrors.push(`${column.title}枚举值非法`);
      });
      if (rowErrors.length) {
        errors.push({ rowNumber: rowIndex, errors: rowErrors, raw });
        continue;
      }
      const record: Record<string, any> = {};
      for (const column of importColumns) {
        const value = raw[column.key];
        if (column.extJson && column.extJsonKey) {
          setNestedValue(record, column.extJsonKey, value);
        } else {
          record[column.dbField] = value;
        }
      }
      records.push(record);
    }
    const batchSize = meta.importStrategy?.batchSize ?? 200;
    await transaction(async (conn) => {
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        for (const record of batch) {
          const fields = Object.keys(record);
          const placeholders = fields.map((field) => `:${field}`);
          await conn.execute(`INSERT INTO ${meta.tableName} (${fields.join(',')}) VALUES (${placeholders.join(',')})`, record);
        }
      }
    });
    const errorWorkbook = errors.length ? await createErrorWorkbook(importColumns.map((c) => c.title), errors).xlsx.writeBuffer().then((b) => Buffer.from(b)) : undefined;
    return { successCount: records.length, failedCount: errors.length, totalCount: records.length + errors.length, errorBuffer: errorWorkbook, matchedColumns: importColumns.map((c) => c.key) };
  }
}

async function queryDb(sql: string, params: Record<string, any>) { return query<Record<string, any>>(sql, params); }
