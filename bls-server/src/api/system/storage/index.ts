import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId, requireTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { assertTenantResource } from '../../../security/ownership';
import { extractIds } from '../../../core/crud';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { success, pageSuccess } from '../../../core/response';
import { createStorageProvider } from './storage.factory';
import { createDistributedLock } from '../../../distributed/lock';
import { getRedisClient } from '../../../shared/utils/redis';
import type { StorageConfig } from './storage.model';
import { validateFile, generateObjectKey, validateUploadMeta, sanitizeFilename, validateFileSize } from '../../../security/file-security';
import { getDynamicConfig } from '../../../config/dynamic-config';
import { writeSecurityLog, SecurityEventType } from '../../../core/security-audit';
import { writeUploadAudit } from '../../../core/audit';
import { getRequestContext } from '../../../core/request-context';
import fs from 'fs';
import path from 'path';

const router = new Router({ prefix: '/system/storage' });
const ST = 'sys_storage_config';

/** Storage 配置允许的字段 */
const STORAGE_FIELDS = [
  'storageName', 'storageType', 'endpoint', 'region', 'port', 'useSsl',
  'accessKey', 'secretKey', 'publicBucket', 'privateBucket',
  'publicBaseUrl', 'privateBaseUrl', 'pathStyle',
  'isDefault', 'status', 'remark',
];

// ====== 参数校验 ======

const numish = z.union([z.number(), z.string(), z.boolean()]).transform((v) => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
});

const jsonish = z.union([z.string(), z.record(z.string(), z.any()), z.array(z.any()), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return JSON.stringify(v);
    const text = String(v).trim();
    if (!text) return null;
    try {
      JSON.parse(text);
    } catch {
      throw new ValidationError('JSON 字段格式不合法');
    }
    return text;
  });

const storageCreateSchema = z.object({
  storageName: z.string().trim().min(1, 'storageName 不能为空').max(100),
  storageType: z.string().trim().min(1, 'storageType 不能为空').max(30),
  endpoint: z.string().max(500).nullish(),
  region: z.string().max(100).nullish(),
  port: numish.optional(),
  useSsl: numish.optional(),
  pathStyle: numish.optional(),
  accessKey: z.string().max(500).nullish(),
  secretKey: z.string().max(500).nullish(),
  publicBucket: z.string().max(100).nullish(),
  privateBucket: z.string().max(100).nullish(),
  publicBaseUrl: z.string().max(1000).nullish(),
  privateBaseUrl: z.string().max(1000).nullish(),
  configJson: jsonish,
  policyJson: jsonish,
  isDefault: numish.optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).nullish(),
});

const storageUpdateSchema = storageCreateSchema.partial().extend({
  storageId: z.string().trim().min(1).max(32),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  return parsed.data;
}

/** 密钥脱敏：只保留首尾各 4 位 */
function maskSecret(value: unknown): string | null {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 8) return '****';
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('****');
}

/** 对外返回时脱敏 access_key / secret_key */
function maskRow(row: Record<string, any>): Record<string, any> {
  return {
    ...row,
    access_key: maskSecret(row.access_key),
    secret_key: maskSecret(row.secret_key),
  };
}

/** 请求体 → 数据库列（白名单 + 局部更新 + 密钥保留策略） */
function buildStorageValues(
  body: Partial<z.infer<typeof storageCreateSchema>>,
  opts: { isCreate: boolean; existing?: Record<string, any> },
): Record<string, any> {
  const values: Record<string, any> = {};
  const assign = (col: string, value: unknown) => { if (value !== undefined) values[col] = value; };

  assign('storage_name', body.storageName);
  assign('storage_type', body.storageType);
  assign('endpoint', body.endpoint);
  assign('region', body.region);
  assign('public_bucket', body.publicBucket);
  assign('private_bucket', body.privateBucket);
  assign('public_base_url', body.publicBaseUrl);
  assign('private_base_url', body.privateBaseUrl);
  assign('port', body.port);
  assign('use_ssl', body.useSsl);
  assign('path_style', body.pathStyle);
  assign('status', body.status);
  assign('remark', body.remark);
  assign('is_default', body.isDefault === undefined ? undefined : (body.isDefault === 1 ? 1 : 0));
  if (body.configJson !== undefined) values.config_json = body.configJson ?? null;
  if (body.policyJson !== undefined) values.policy_json = body.policyJson ?? null;

  // 密钥：未传 / 空 / 脱敏占位值 → 编辑时保留原密钥；新增时置空
  const keyRule = (incoming: unknown, col: string) => {
    if (incoming === undefined || incoming === null || incoming === '' || isMaskedValue(incoming)) {
      if (!opts.isCreate) return; // 保留数据库原值
      values[col] = null;
      return;
    }
    values[col] = incoming;
  };
  keyRule(body.accessKey, 'access_key');
  keyRule(body.secretKey, 'secret_key');

  return values;
}

/** 保证同租户最多一个默认存储（事务内先清零再置一） */
async function applyDefaultFlag(trx: any, tenantId: string, storageId: string, values: Record<string, any>) {
  if (values.is_default !== 1) return;
  await trx.updateTable(ST).set({ is_default: 0 })
    .where('tenant_id', '=', tenantId).where('deleted', '=', 0)
    .where('storage_id', '!=', storageId)
    .execute();
}

router.get('/list', jwtAuth(), hasPerm('system:storage:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const p = Math.max(1, Number(q.pageNum) || 1);
  const s = Math.min(100, Math.max(1, Number(q.pageSize) || 10));

  let b = db.selectFrom(ST).selectAll().where('deleted', '=', 0).where('tenant_id', '=', tid);
  if (q.storageName) b = b.where('storage_name', 'like', `%${q.storageName}%`);
  if (q.storageType) b = b.where('storage_type', '=', String(q.storageType));

  const countRow = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows = await b.orderBy('create_time', 'desc').limit(s).offset((p - 1) * s).execute();
  pageSuccess(ctx, rows.map(maskRow), Number(countRow?.total ?? 0));
});

router.post('/add', jwtAuth(), hasPerm('system:storage:add'), async (ctx: Context) => {
  const tid = requireTenantId();
  const body = parseOrThrow(storageCreateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;
  const storageId = generateSnowflakeId();
  const values = buildStorageValues(body, { isCreate: true });

  await db.transaction().execute(async (trx: any) => {
    await applyDefaultFlag(trx, tid, storageId, values);
    await trx.insertInto(ST).values({
      storage_id: storageId,
      tenant_id: tid,
      deleted: 0,
      ...values,
    }).execute();
  });

  success(ctx, { storageId }, '新增成功');
});

router.put('/edit', jwtAuth(), hasPerm('system:storage:edit'), async (ctx: Context) => {
  const tid = requireTenantId();
  const body = parseOrThrow(storageUpdateSchema, ctx.request.body ?? {});
  const db = (await getDb()) as any;

  const existing = await db.selectFrom(ST).select(['storage_id', 'access_key', 'secret_key'])
    .where('storage_id', '=', body.storageId)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .executeTakeFirst();
  if (!existing) throw new NotFoundError();

  const values = buildStorageValues(body, { isCreate: false, existing });

  const affected = await db.transaction().execute(async (trx: any) => {
    await applyDefaultFlag(trx, tid, body.storageId, values);
    const result: any = await trx.updateTable(ST).set(values)
      .where('storage_id', '=', body.storageId)
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0);
  });

  if (affected === 0) throw new NotFoundError();
  success(ctx, { storageId: body.storageId }, '修改成功');
});

router.delete('/remove', jwtAuth(), hasPerm('system:storage:remove'), async (ctx: Context) => {
  const tid = requireTenantId();
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少 ids');
  const db = (await getDb()) as any;

  const visible: any[] = await db.selectFrom(ST).select('storage_id')
    .where('storage_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
  if (visible.length !== ids.length) throw new NotFoundError();

  const result: any = await db.updateTable(ST).set({ deleted: 1 })
    .where('storage_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  success(ctx, { deleted: ids.length }, '删除成功');
});

/** GET /:storageId — 详情（脱敏）。必须注册在 /files 等静态路由之后，避免被通配路由遮蔽 */

// 文件上传 — 导出 handler 以便测试
export async function handleUpload(
  ctx: Context,
  getDbFn: () => any,
  getTenantFn: () => string | null,
  securityLogFn: (event: any) => Promise<void>,
  uploadAuditFn: (event: any) => Promise<void>,
  getReqCtxFn: () => any,
  createProviderFn?: (cfg: StorageConfig) => any,
  readFileFn?: (p: string) => Buffer,
  getConfigFn?: (tid: string) => Promise<{ uploadLimitMB: number }>,
) {
  const files = (ctx.request as any).files;
  const body = ctx.request.body as any;
  if (!files?.file) { ctx.body = { code: 400, message: '请选择文件' }; return; }
  const file = Array.isArray(files.file) ? files.file[0] : files.file;
  const accessType = body.accessType || 'private';
  const moduleName = body.moduleName || 'common';
  const storageId = body.storageId;

  const metaResult = validateUploadMeta(moduleName, accessType);
  if (!metaResult.valid) { ctx.body = { code: 400, message: metaResult.reason }; return; }

  // fail-closed — 租户上下文缺失直接拒绝（不查 DB）
  const tid = getTenantFn();
  if (!tid) {
    ctx.body = { code: 401, message: '租户上下文缺失' };
    return;
  }

  const db = (await getDbFn()) as any;
  let configRow: any;
  if (storageId) {
    configRow = await db.selectFrom('sys_storage_config').selectAll()
      .where('storage_id','=',storageId).where('tenant_id','=',tid).where('deleted','=',0).executeTakeFirst();
  } else {
    configRow = await db.selectFrom('sys_storage_config').selectAll()
      .where('is_default','=','1').where('tenant_id','=',tid).where('deleted','=',0).executeTakeFirst()
      || await db.selectFrom('sys_storage_config').selectAll()
        .where('tenant_id','=',tid).where('deleted','=',0).orderBy('create_time','asc').limit(1).executeTakeFirst();
  }
  if (!configRow) { ctx.body = { code: 500, message: '未配置存储服务' }; return; }

  const config: StorageConfig = {
    storageId: configRow.storage_id, tenantId: configRow.tenant_id,
    storageName: configRow.storage_name, storageType: configRow.storage_type,
    endpoint: configRow.endpoint, region: configRow.region, port: configRow.port,
    useSsl: configRow.use_ssl, accessKey: configRow.access_key, secretKey: configRow.secret_key,
    publicBucket: configRow.public_bucket, privateBucket: configRow.private_bucket,
    publicBaseUrl: configRow.public_base_url, privateBaseUrl: configRow.private_base_url,
    pathStyle: configRow.path_style, configJson: configRow.config_json, policyJson: configRow.policy_json,
    isDefault: configRow.is_default, status: configRow.status, remark: configRow.remark,
    createBy: configRow.create_by, createTime: configRow.create_time, updateBy: configRow.update_by, updateTime: configRow.update_time,
  };

  const provider = (createProviderFn ?? createStorageProvider)(config);
  const bucketName = accessType === 'public' ? (config.publicBucket || 'public-assets') : (config.privateBucket || 'private-assets');
  const originalName = sanitizeFilename(file.originalFilename || file.name || '');
  const ext = path.extname(originalName);
  const extName = ext.replace('.', '').toLowerCase();
  const mimeType = file.mimetype || 'application/octet-stream';
  const fileSize = file.size || 0;

  // 动态上传大小限制
  let maxSizeBytes = 100 * 1024 * 1024;
  try {
    const dc = (getConfigFn ?? getDynamicConfig)(tid);
    const dcResult = dc instanceof Promise ? await dc : dc;
    if (dcResult?.uploadLimitMB) maxSizeBytes = dcResult.uploadLimitMB * 1024 * 1024;
  } catch { /* 降级使用默认 100MB */ }

  // ext + mime 先校验
  let secResult = validateFile(originalName, mimeType, undefined, undefined);
  if (!secResult.valid) {
    ctx.body = { code: 400, message: secResult.reason };
    securityLogFn({ eventType: SecurityEventType.SECURITY_VALIDATION_FAILED, title: `文件上传被拒绝: ${secResult.reason}`, detail: { originalName, mimeType, fileSize }, source: 'file-security' }).catch(() => {});
    return;
  }
  // 动态大小限制
  secResult = validateFileSize(fileSize, maxSizeBytes);
  if (!secResult.valid) {
    ctx.body = { code: 400, message: secResult.reason };
    securityLogFn({ eventType: SecurityEventType.SECURITY_VALIDATION_FAILED, title: `文件上传被拒绝: ${secResult.reason}`, detail: { originalName, mimeType, fileSize, maxSizeBytes }, source: 'file-security' }).catch(() => {});
    return;
  }

  const objectName = `${moduleName}/${generateObjectKey(originalName)}`;
  const safeName = objectName;
  const buffer = (readFileFn ?? ((p: string) => fs.readFileSync(p)))(file.filepath || file.path);

  const fullResult = validateFile(originalName, mimeType, buffer, fileSize);
  if (!fullResult.valid) {
    ctx.body = { code: 400, message: fullResult.reason };
    securityLogFn({
      eventType: SecurityEventType.SECURITY_VALIDATION_FAILED,
      title: `文件上传被拒绝(Magic): ${fullResult.reason}`,
      detail: { originalName, mimeType, fileSize },
      source: 'file-security',
    }).catch(() => {});
    return;
  }

  const result = await provider.upload({ originalName, fileName: safeName, mimeType, buffer, bucketName, objectName, accessType: accessType as 'public'|'private' });
  const fileId = generateSnowflakeId();
  const url = accessType === 'public' ? result.url || provider.getPublicUrl({ bucketName, objectName }) : null;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.insertInto('sys_file').values({
    file_id: fileId, tenant_id: tid, storage_id: config.storageId,
    bucket_name: bucketName, object_name: objectName,
    original_name: originalName,
    file_name: safeName, file_ext: extName || null, mime_type: mimeType,
    file_size: fileSize, access_type: accessType, module_name: moduleName,
    url, create_time: now,
  }).execute();

  const reqCtx = getReqCtxFn();
  uploadAuditFn({
    tenantId: tid,
    userId: (ctx.state.user as any)?.userId ?? '',
    username: (ctx.state.user as any)?.username ?? '',
    moduleName, accessType,
    storageId: config.storageId, storageType: config.storageType,
    bucketName, objectName,
    originalName, safeName,
    fileExt: extName, mimeType, fileSize,
    uploadStatus: '0', fileId, fileUrl: url || '',
    clientIp: reqCtx?.clientIp ?? ctx.ip ?? '',
    userAgent: (ctx.headers as any)?.['user-agent'] ?? '',
  }).catch(() => {});

  ctx.body = { code: 200, message: '上传成功', data: { fileId, url, bucketName, objectName, originalName, fileName: safeName, fileSize } };
}

// 文件上传路由（含分布式锁）
router.post('/upload', jwtAuth(), hasPerm('system:file:upload'), async (ctx: Context) => {
  const redis = getRedisClient();
  let unlock: (() => Promise<void>) | null = null;
  if (redis) {
    const lock = createDistributedLock(redis);
    const result = await lock.acquire('storage:upload', { leaseTime: 30, waitTime: 5 });
    if (result.status === 'busy') {
      ctx.status = 409;
      ctx.body = { code: 409, message: '操作太频繁，请稍后再试' };
      return;
    }
    if (result.status === 'acquired') {
      unlock = result.unlock;
    }
    // status === 'unavailable'：降级执行
  }
  try {
    await handleUpload(ctx, getDb, getCurrentTenantId, writeSecurityLog as any, writeUploadAudit as any, getRequestContext);
  } catch (err: any) {
    ctx.body = { code: 500, message: err?.message || '上传失败' };
  } finally {
    if (unlock) {
      try { await unlock(); } catch { /* 释放锁失败不影响业务 */ }
    }
  }
});
router.get('/files', jwtAuth(), hasPerm('system:file:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  const tid = getCurrentTenantId();
  let b = db.selectFrom('sys_file').selectAll().where('deleted','=',0).where('tenant_id','=',tid);
  if (q.originalName) b = b.where('original_name','like',`%${q.originalName}%`);
  if (q.moduleName) b = b.where('module_name','like',`%${q.moduleName}%`);
  if (q.accessType) b = b.where('access_type','=',q.accessType);
  const cr = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('create_time','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr?.total??0) };
});

router.delete('/files/remove', jwtAuth(), hasPerm('system:file:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids ?? []).map(String).filter(Boolean);
  if (!ids.length) { ctx.body = { code: 400, message: '缺少 ids' }; return; }
  const tid = getCurrentTenantId();
  await db.updateTable('sys_file').set({ deleted: 1 })
    .where('file_id', 'in', ids).where('tenant_id', '=', tid).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

router.delete('/file/:fileId', jwtAuth(), hasPerm('system:file:remove'), async (ctx: Context) => {
  const tid = getCurrentTenantId();
  await assertTenantResource('sys_file', 'file_id', ctx.params.fileId);
  await (await getDb()).updateTable('sys_file').set({deleted:1})
    .where('file_id','=',ctx.params.fileId).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '删除成功' };
});
router.get('/file/:fileId/url', jwtAuth(), hasPerm('system:file:download'), async (ctx: Context) => {
  const tid = getCurrentTenantId();
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_file').selectAll()
    .where('file_id','=',ctx.params.fileId).where('tenant_id','=',tid).where('deleted','=',0).executeTakeFirst() };
});
router.get('/file/:fileId/download', jwtAuth(), hasPerm('system:file:download'), async (ctx: Context) => {
  const tid = getCurrentTenantId();
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_file').selectAll()
    .where('file_id','=',ctx.params.fileId).where('tenant_id','=',tid).where('deleted','=',0).executeTakeFirst() };
});

/** GET /:storageId — 存储配置详情（access_key / secret_key 脱敏） */
router.get('/:storageId', jwtAuth(), hasPerm('system:storage:list'), async (ctx: Context) => {
  const tid = requireTenantId();
  const row = await (await getDb()).selectFrom(ST).selectAll()
    .where('storage_id', '=', ctx.params.storageId)
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .executeTakeFirst();
  if (!row) throw new NotFoundError();
  success(ctx, maskRow(row as any), '查询成功');
});

export default router;
