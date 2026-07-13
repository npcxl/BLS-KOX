import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { assertTenantResource } from '../../../security/ownership';
import { pickAllowed } from '../../../shared/utils/mass-assignment';
import { createStorageProvider } from './storage.factory';
import type { StorageConfig } from './storage.model';
import { validateFile, generateObjectKey } from '../../../security/file-security';
import { writeSecurityLog, SecurityEventType } from '../../../core/security-audit';
import { writeUploadAudit } from '../../../core/audit';
import { getRequestContext } from '../../../core/request-context';
import fs from 'fs';
import path from 'path';

const router = new Router({ prefix: '/system/storage' });

/** Storage 配置允许的字段 */
const STORAGE_FIELDS = [
  'storageName', 'storageType', 'endpoint', 'region', 'port', 'useSsl',
  'accessKey', 'secretKey', 'publicBucket', 'privateBucket',
  'publicBaseUrl', 'privateBaseUrl', 'pathStyle',
  'isDefault', 'status', 'remark',
];

router.get('/list', jwtAuth(), hasPerm('system:storage:list'), async (ctx: Context) => {
  const tid = getCurrentTenantId();
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_storage_config').selectAll()
    .where('deleted','=',0).where('tenant_id','=',tid).orderBy('create_time','desc').execute() };
});
router.post('/add', jwtAuth(), hasPerm('system:storage:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, STORAGE_FIELDS);
  if (Object.keys(data).length === 0) { ctx.body = { code: 400, message: '没有有效字段' }; return; }
  await db.insertInto('sys_storage_config').values({...data, tenant_id: getCurrentTenantId()??'000000', deleted:0} as any).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:storage:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await assertTenantResource('sys_storage_config', 'storage_id', b.storageId);
  const data = pickAllowed(b, STORAGE_FIELDS);
  if (Object.keys(data).length === 0) { ctx.body = { code: 400, message: '没有有效字段' }; return; }
  const tid = getCurrentTenantId();
  await db.updateTable('sys_storage_config').set(data as any).where('storage_id','=',b.storageId).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:storage:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any; const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  const tid = getCurrentTenantId();
  await db.updateTable('sys_storage_config').set({deleted:1}).where('storage_id','in',ids).where('tenant_id','=',tid).execute();
  ctx.body = { code: 200, message: '删除成功' };
});

// 文件上传
router.post('/upload', jwtAuth(), hasPerm('system:file:upload'), async (ctx: Context) => {
  try {
    const db = (await getDb()) as any;
    const files = (ctx.request as any).files;
    const body = ctx.request.body as any;
    if (!files?.file) { ctx.body = { code: 400, message: '请选择文件' }; return; }
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const accessType = body.accessType || 'private';
    const moduleName = body.moduleName || 'common';
    const storageId = body.storageId;

    // 获取存储配置
    let configRow: any;
    if (storageId) {
      configRow = await db.selectFrom('sys_storage_config').selectAll().where('storage_id','=',storageId).where('deleted','=',0).executeTakeFirst();
    } else {
      configRow = await db.selectFrom('sys_storage_config').selectAll().where('is_default','=','1').where('deleted','=',0).executeTakeFirst()
        || await db.selectFrom('sys_storage_config').selectAll().where('deleted','=',0).orderBy('create_time','asc').limit(1).executeTakeFirst();
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

    const provider = createStorageProvider(config);
    const bucketName = accessType === 'public' ? (config.publicBucket || 'public-assets') : (config.privateBucket || 'private-assets');
    const originalName = file.originalFilename || file.name || '';
    const ext = path.extname(originalName);
    const extName = ext.replace('.', '').toLowerCase();
    const mimeType = file.mimetype || 'application/octet-stream';
    const fileSize = file.size || 0;

    // P13: 文件安全校验（扩展名 + MIME + 大小）
    const secResult = validateFile(originalName, mimeType, undefined, fileSize);
    if (!secResult.valid) {
      ctx.body = { code: 400, message: secResult.reason };
      writeSecurityLog({
        eventType: SecurityEventType.SECURITY_VALIDATION_FAILED,
        title: `文件上传被拒绝: ${secResult.reason}`,
        detail: { originalName, mimeType, fileSize },
        source: 'file-security',
      }).catch(() => {});
      return;
    }

    // 随机 Object Key 防遍历
    const objectName = `${moduleName}/${generateObjectKey(originalName)}`;
    const safeName = objectName;

    const buffer = fs.readFileSync(file.filepath || file.path);

    // P13: Magic Number 检测（图片文件）
    const fullResult = validateFile(originalName, mimeType, buffer, fileSize);
    if (!fullResult.valid) {
      ctx.body = { code: 400, message: fullResult.reason };
      writeSecurityLog({
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
    const tid = getCurrentTenantId() || '000000';
    await db.insertInto('sys_file').values({
      file_id: fileId, tenant_id: tid, storage_id: config.storageId,
      bucket_name: bucketName, object_name: objectName,
      original_name: originalName,
      file_name: safeName, file_ext: extName || null, mime_type: mimeType,
      file_size: fileSize, access_type: accessType, module_name: moduleName,
      url, create_time: now,
    }).execute();

    // P13: 上传审计日志
    writeUploadAudit({
      tenantId: tid,
      userId: (ctx.state.user as any)?.userId ?? '',
      username: (ctx.state.user as any)?.username ?? '',
      moduleName, accessType,
      storageId: config.storageId, storageType: config.storageType,
      bucketName, objectName,
      originalName, safeName,
      fileExt: extName, mimeType, fileSize,
      uploadStatus: '0', fileId, fileUrl: url || '',
      clientIp: getRequestContext()?.clientIp ?? ctx.ip ?? '',
      userAgent: (ctx.headers as any)?.['user-agent'] ?? '',
    }).catch(() => { /* 不影响主流程 */ });

    ctx.body = { code: 200, message: '上传成功', data: { fileId, url, bucketName, objectName, originalName, fileName: safeName, fileSize } };
  } catch (err: any) {
    ctx.body = { code: 500, message: err?.message || '上传失败' };
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

export default router;
