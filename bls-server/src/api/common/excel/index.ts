import Router from 'koa-router';
import { Context } from 'koa';
import ExcelJS from 'exceljs';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { normalizeExportLimit, buildHeaderRow } from './excel.utils';
import type { ExcelImportRowError } from './excel.types';
import { createDistributedLock } from '../../../distributed/lock';
import { getRedisClient } from '../../../shared/utils/redis';

const router = new Router({ prefix: '/common/excel' });
const CT = 'sys_page_column_config';
const MAX_EXPORT = 10000;

/** metaKey → { tableName, pageCode } */
const EXCEL_METAS: Record<string, { tableName: string; pageCode: string; tenantAware: boolean }> = {
  'system-user': { tableName: 'sys_user', pageCode: 'system_user', tenantAware: true },
  'system-config': { tableName: 'sys_config', pageCode: 'system_config', tenantAware: true },
  'system-role': { tableName: 'sys_role', pageCode: 'system_role', tenantAware: true },
  'system-dept': { tableName: 'sys_dept', pageCode: 'system_dept', tenantAware: true },
  'system-tenant': { tableName: 'sys_tenant', pageCode: 'system_tenant', tenantAware: true },
  'system-package': { tableName: 'sys_package', pageCode: 'system_package', tenantAware: true },
};

function getMeta(metaKey: string) { return EXCEL_METAS[metaKey] ?? null; }

/** camelCase → snake_case */
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

/** 不可导入的系统字段 */
const SKIP_IMPORT = ['userId','user_id','roleIds','roleIds','password','createTime','create_time',
  'updateTime','update_time','createBy','create_by','updateBy','update_by','deptId','dept_id','tenantId','tenant_id'];

/** 读取页面列配置 */
async function loadColumns(pageCode: string) {
  const db = await getDb();
  return db.selectFrom(CT).selectAll()
    .where('page_code', '=', pageCode).where('deleted', '=', 0)
    .orderBy('order_num', 'asc').execute();
}

/** 加载字典数据：code → { value→label, label→value } */
async function loadDictMaps(cols: any[]) {
  const codes = [...new Set(cols.map((c: any) => c.value_enum_code).filter(Boolean))] as string[];
  if (!codes.length) return { v2l: new Map<string, Map<string, string>>(), l2v: new Map<string, Map<string, string>>() };
  const db = await getDb() as any;
  const types = await db.selectFrom('sys_dict_type').select(['dict_type_id', 'dict_type']).where('dict_type', 'in', codes).execute();
  const typeIds = types.map((t: any) => t.dict_type_id);
  const rows = await db.selectFrom('sys_dict_data').selectAll()
    .where('dict_type_id', 'in', typeIds).where('deleted', '=', 0).orderBy('dict_sort', 'asc').execute();
  const v2l = new Map<string, Map<string, string>>();
  const l2v = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const type = types.find((t: any) => t.dict_type_id === r.dict_type_id);
    if (!type) continue;
    const code = type.dict_type, label = r.dict_label, value = r.dict_value;
    if (!v2l.has(code)) { v2l.set(code, new Map()); l2v.set(code, new Map()); }
    v2l.get(code)!.set(value, label);
    l2v.get(code)!.set(label, value);
  }
  return { v2l, l2v };
}

/** 导出数据到 Excel（含分布式锁） */
router.post('/export', jwtAuth(), async (ctx: Context) => {
  const body = ctx.request.body as any;
  const metaKey = String(body.metaKey ?? '');
  const redis = getRedisClient();
  if (redis) {
    const lock = createDistributedLock(redis);
    const unlock = await lock.acquire(`excel:export:${metaKey}`, { leaseTime: 60, waitTime: 10 });
    if (!unlock) { ctx.status = 409; ctx.body = { code: 409, message: '导出任务进行中，请稍后再试' }; return; }
    try { await handleExport(ctx); } finally { await unlock(); }
  } else {
    await handleExport(ctx);
  }
});

async function handleExport(ctx: Context) {
  try {
    const body = ctx.request.body as any;
    const meta = getMeta(body.metaKey);
    if (!meta) { ctx.body = { code: 400, message: '未找到导出配置' }; return; }

    const cols = await loadColumns(meta.pageCode);
    const exportCols = cols.filter((c: any) => c.visible && c.data_index !== 'roleIds' && c.data_index !== 'password');
    if (!exportCols.length) { ctx.body = { code: 400, message: '没有可导出的列' }; return; }

    const { v2l } = await loadDictMaps(exportCols);

    const db = await getDb() as any;
    let qb = db.selectFrom(meta.tableName).selectAll().where('deleted', '=', 0);
    if (meta.tenantAware) qb = qb.where('tenant_id', '=', getCurrentTenantId() ?? '000000');

    const keyword = String(body.keyword ?? '').trim();
    if (keyword) {
      const searchCols = cols.filter((c: any) => c.searchable);
      if (searchCols.length) {
        qb = qb.where((eb: any) => {
          const conditions = searchCols.map((sc: any) => eb(camelToSnake(sc.data_index), 'like', `%${keyword}%`));
          return eb.or(conditions);
        });
      }
    }
    for (const col of cols) {
      if (body[col.data_index] !== undefined && body[col.data_index] !== '' && body[col.data_index] !== null) {
        qb = qb.where(camelToSnake(col.data_index) as any, '=', body[col.data_index]);
      }
    }

    qb = qb.orderBy('create_time', 'desc');
    const countResult = await (qb as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
    const total = Number(countResult?.total ?? 0);
    const limit = body.exportMode === 'limit' ? normalizeExportLimit(body.customMaxNum) : MAX_EXPORT;
    qb = qb.limit(Math.min(limit, MAX_EXPORT));
    const rows = await qb.execute();

    const mk = body.metaKey;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(mk);
    sheet.columns = exportCols.map((c: any) => ({ header: c.title, key: c.data_index, width: Math.min(30, Math.max(10, c.title.length * 2)) }));
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      const rowData: any = {};
      for (const col of exportCols) {
        const dbField = camelToSnake(col.data_index); // snake_case from DB
        let val = row[dbField] !== undefined ? row[dbField] : row[col.data_index];
        // 字典值 → 中文标签
        if (col.value_enum_code && v2l.has(col.value_enum_code)) {
          val = v2l.get(col.value_enum_code)!.get(String(val ?? '')) ?? val;
        }
        rowData[col.data_index] = val !== null && val !== undefined ? val : '';
      }
      sheet.addRow(rowData);
    }

    ctx.set('x-excel-matched-count', String(total));
    ctx.set('x-excel-export-count', String(rows.length));
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(mk)}-export.xlsx"`);
    ctx.body = Buffer.from(await workbook.xlsx.writeBuffer());
  } catch (err: any) {
    ctx.body = { code: 500, message: err?.message || '导出失败' };
  }
}

/** 下载导入模板（带字典下拉验证） */
router.get('/template', jwtAuth(), async (ctx: Context) => {
  try {
    const metaKey = String(ctx.query.metaKey ?? '');
    const meta = getMeta(metaKey);
    if (!meta) { ctx.body = { code: 400, message: '未找到模板配置' }; return; }

    const cols = await loadColumns(meta.pageCode);
    const importCols = cols.filter((c: any) => !SKIP_IMPORT.includes(c.data_index));
    if (!importCols.length) { ctx.body = { code: 400, message: '没有可导入的列' }; return; }

    const { v2l } = await loadDictMaps(importCols);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(metaKey);
    const headers = buildHeaderRow(importCols.map((c: any) => ({ title: c.title, required: c.required })));
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    importCols.forEach((c: any, i: number) => {
      const colIdx = i + 1;
      sheet.getColumn(colIdx).width = Math.min(30, Math.max(12, c.title.length * 3));

      // 字典列：添加下拉数据验证（覆盖整列）
      if (c.value_enum_code && v2l.has(c.value_enum_code)) {
        const labels = Array.from(v2l.get(c.value_enum_code)!.values());
        if (labels.length) {
          const colLetter = String.fromCharCode(64 + colIdx);
          (sheet as any).dataValidations?.add(`${colLetter}2:${colLetter}1000`, {
            type: 'list', allowBlank: !c.required,
            formulae: [`"${labels.join(',')}"`],
            showErrorMessage: true, errorTitle: '无效值',
            error: `请从下拉列表选择`,
          });
        }
      }
    });

    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(metaKey)}-template.xlsx"`);
    ctx.body = Buffer.from(await workbook.xlsx.writeBuffer());
  } catch (err: any) {
    ctx.body = { code: 500, message: err?.message || '模板生成失败' };
  }
});

/** 导入数据（含分布式锁） */
router.post('/import', jwtAuth(), async (ctx: Context) => {
  const body = ctx.request.body as any;
  const metaKey = String(body.metaKey ?? '');
  const redis = getRedisClient();
  if (redis) {
    const lock = createDistributedLock(redis);
    const unlock = await lock.acquire(`excel:import:${metaKey}`, { leaseTime: 120, waitTime: 10 });
    if (!unlock) { ctx.status = 409; ctx.body = { code: 409, message: '导入任务进行中，请稍后再试' }; return; }
    try { await handleImport(ctx); } finally { await unlock(); }
  } else {
    await handleImport(ctx);
  }
});

async function handleImport(ctx: Context) {
  try {
    const files = (ctx.request as any).files;
    const body = ctx.request.body as any;
    const metaKey = String(body.metaKey ?? '');
    const meta = getMeta(metaKey);
    if (!meta) { ctx.body = { code: 400, message: '未找到导入配置' }; return; }
    if (!files?.file) { ctx.body = { code: 400, message: '请上传Excel文件' }; return; }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const cols = await loadColumns(meta.pageCode);
    const importCols = cols.filter((c: any) => !SKIP_IMPORT.includes(c.data_index));
    if (!importCols.length) { ctx.body = { code: 400, message: '没有可导入的列' }; return; }

    const { l2v } = await loadDictMaps(importCols);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.filepath || file.path);
    const sheet = workbook.worksheets[0];
    if (!sheet) { ctx.body = { code: 400, message: '文件为空' }; return; }

    const headerRow = sheet.getRow(1);
    const colMap = new Map<number, any>();
    for (let c = 1; c <= headerRow.cellCount; c++) {
      const headerText = String(headerRow.getCell(c).value ?? '').replace(/（[^）]*）/g, '').trim();
      const matched = importCols.find((col: any) => col.title === headerText);
      if (matched) colMap.set(c, matched);
    }
    if (!colMap.size) { ctx.body = { code: 400, message: '未匹配到任何列，请使用正确的模板' }; return; }

    const db = await getDb() as any;
    const tenantId = getCurrentTenantId() ?? '000000';
    const errors: ExcelImportRowError[] = [];
    let successCount = 0;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const rowData: Record<string, any> = {};
      const rowErrors: string[] = [];
      let hasValue = false;

      for (const [colNum, colDef] of colMap) {
        let value: any = row.getCell(colNum).value;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          value = (value as any).richText?.map((t: any) => t.text).join('') ?? (value as any).text ?? String(value);
        }
        const strVal = value !== null && value !== undefined ? String(value).trim() : '';

        if (colDef.required && !strVal) {
          rowErrors.push(`${colDef.title}不能为空`);
          continue;
        }
        if (!strVal) continue;

        hasValue = true;

        // 字典列：中文标签 → 原始值
        if (colDef.value_enum_code && l2v.has(colDef.value_enum_code)) {
          const mapped = l2v.get(colDef.value_enum_code)!.get(strVal);
          if (mapped !== undefined) {
            rowData[colDef.data_index] = mapped;
            continue;
          }
        }
        rowData[colDef.data_index] = strVal;
      }

      if (!hasValue) continue;
      if (rowErrors.length) { errors.push({ rowNumber: r, errors: rowErrors, raw: rowData }); continue; }

      try {
        const insertData: any = { deleted: 0, create_time: now };
        for (const [, colDef] of colMap) {
          if (rowData[colDef.data_index] !== undefined) {
            const dbField = camelToSnake(colDef.data_index);
            insertData[dbField] = rowData[colDef.data_index];
          }
        }
        if (meta.tenantAware) insertData.tenant_id = tenantId;

        // 特殊处理：用户导入自动填默认密码和性别
        if (meta.tableName === 'sys_user') {
          if (!insertData.password) insertData.password = 'e10adc3949ba59abbe56e057f20f883e';
          if (!insertData.gender) insertData.gender = '2';
        }

        const pkField = meta.tableName === 'sys_user' ? 'user_id' :
          meta.tableName === 'sys_role' ? 'role_id' :
          meta.tableName === 'sys_dept' ? 'dept_id' :
          meta.tableName === 'sys_menu' ? 'menu_id' :
          meta.tableName === 'sys_config' ? 'config_id' :
          meta.tableName === 'sys_tenant' ? 'tenant_id' :
          meta.tableName === 'sys_package' ? 'package_id' :
          meta.tableName === 'sys_theme' ? 'theme_id' :
          meta.tableName === 'sys_storage_config' ? 'storage_id' :
          meta.tableName.replace('sys_', '').slice(0, -1) + '_id';

        // 去重：先查是否存在同名记录
        let existingId: string | null = null;
        if (meta.tableName === 'sys_user' && insertData.username) {
          const exist = await db.selectFrom('sys_user').select('user_id').where('username','=',insertData.username).where('tenant_id','=',tenantId).where('deleted','=',0).executeTakeFirst();
          if (exist) existingId = exist.user_id;
        } else if (meta.tableName === 'sys_role' && insertData.role_name) {
          const exist = await db.selectFrom('sys_role').select('role_id').where('role_name','=',insertData.role_name).where('tenant_id','=',tenantId).where('deleted','=',0).executeTakeFirst();
          if (exist) existingId = exist.role_id;
        } else if (meta.tableName === 'sys_config' && insertData.config_key) {
          const exist = await db.selectFrom('sys_config').select('config_id').where('config_key','=',insertData.config_key).where('tenant_id','=',tenantId).where('deleted','=',0).executeTakeFirst();
          if (exist) existingId = exist.config_id;
        } else if (meta.tableName === 'sys_dept' && insertData.dept_name) {
          const exist = await db.selectFrom('sys_dept').select('dept_id').where('dept_name','=',insertData.dept_name).where('tenant_id','=',tenantId).where('deleted','=',0).executeTakeFirst();
          if (exist) existingId = exist.dept_id;
        } else if (meta.tableName === 'sys_tenant' && insertData.tenant_name) {
          const exist = await db.selectFrom('sys_tenant').select('tenant_id').where('tenant_name','=',insertData.tenant_name).where('deleted','=',0).executeTakeFirst();
          if (exist) existingId = exist.tenant_id;
        } else if (meta.tableName === 'sys_package' && insertData.package_name) {
          const exist = await db.selectFrom('sys_package').select('package_id').where('package_name','=',insertData.package_name).where('deleted','=',0).executeTakeFirst();
          if (exist) existingId = exist.package_id;
        }

        if (existingId) {
          // 去重：更新已有记录
          const { [pkField]: _, ...updateData } = insertData;
          await db.updateTable(meta.tableName).set(updateData).where(pkField as any, '=', existingId).execute();
          successCount++;
        } else {
          if (!insertData[pkField]) insertData[pkField] = generateSnowflakeId();
          await db.insertInto(meta.tableName).values(insertData).execute();
          successCount++;
        }
      } catch (e: any) {
        const msg = e?.message || '插入失败';
        const friendly = msg.includes('Duplicate entry') ? '数据已存在（唯一约束冲突）' : msg;
        errors.push({ rowNumber: r, errors: [friendly], raw: rowData });
      }
    }

    const result: any = { successCount, failedCount: errors.length, totalCount: successCount + errors.length };
    if (errors.length) result.errorRows = errors.slice(0, 50).map((e) => ({ row: e.rowNumber, errors: e.errors, data: e.raw }));
    ctx.body = { code: 200, ...result };
  } catch (err: any) {
    ctx.body = { code: 500, message: err?.message || '导入失败' };
  }
}

export default router;
