import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { createStorageProvider } from './storage.factory';
import type { StorageConfig } from './storage.model';
import fs from 'fs';
import path from 'path';

const router = new Router({ prefix: '/system/storage' });

router.get('/list', jwtAuth(), hasPerm('system:storage:list'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_storage_config').selectAll().where('deleted','=',0).orderBy('create_time','desc').execute() };
});
router.post('/add', jwtAuth(), hasPerm('system:storage:add'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.insertInto('sys_storage_config').values(b).execute();
  ctx.body = { code: 200, message: '新增成功' };
});
router.put('/edit', jwtAuth(), hasPerm('system:storage:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  await db.updateTable('sys_storage_config').set(b).where('storage_id','=',b.storageId).execute();
  ctx.body = { code: 200, message: '修改成功' };
});
router.delete('/remove', jwtAuth(), hasPerm('system:storage:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = ((ctx.request.body as any)?.ids??[]).map(String);
  await db.updateTable('sys_storage_config').set({deleted:1}).where('storage_id','in',ids).execute();
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
    const ext = path.extname(file.originalFilename || file.name || '');
    const extName = ext.replace('.', '').toLowerCase();
    const safeName = `${Date.now()}_${file.originalFilename || file.name || 'file'}`;
    const objectName = `${moduleName}/${safeName}`;

    const buffer = fs.readFileSync(file.filepath || file.path);
    const result = await provider.upload({ originalName: file.originalFilename || file.name || '', fileName: safeName, mimeType: file.mimetype || null, buffer, bucketName, objectName, accessType: accessType as 'public'|'private' });

    const fileId = generateSnowflakeId();
    const url = accessType === 'public' ? result.url || provider.getPublicUrl({ bucketName, objectName }) : null;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await db.insertInto('sys_file').values({
      file_id: fileId, tenant_id: getCurrentTenantId() || '000000', storage_id: config.storageId,
      bucket_name: bucketName, object_name: objectName,
      original_name: file.originalFilename || file.name || '',
      file_name: safeName, file_ext: extName || null, mime_type: file.mimetype || null,
      file_size: file.size || 0, access_type: accessType, module_name: moduleName,
      url, create_time: now,
    }).execute();

    ctx.body = { code: 200, message: '上传成功', data: { fileId, url, bucketName, objectName, originalName: file.originalFilename || file.name, fileName: safeName, fileSize: file.size || 0 } };
  } catch (err: any) {
    ctx.body = { code: 500, message: err?.message || '上传失败' };
  }
});
router.get('/files', jwtAuth(), hasPerm('system:file:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum||1); const s = Math.min(100, +q.pageSize||10);
  let b = db.selectFrom('sys_file').selectAll().where('deleted','=',0);
  if (q.originalName) b = b.where('original_name','like',`%${q.originalName}%`);
  if (q.moduleName) b = b.where('module_name','like',`%${q.moduleName}%`);
  if (q.accessType) b = b.where('access_type','=',q.accessType);
  const cr = await (b as any).clearSelect().select((eb:any)=>eb.fn.countAll().as('total')).executeTakeFirst();
  ctx.body = { code: 200, data: await b.orderBy('create_time','desc').limit(s).offset((p-1)*s).execute(), total: Number(cr?.total??0) };
});

router.delete('/file/:fileId', jwtAuth(), hasPerm('system:file:remove'), async (ctx: Context) => {
  await (await getDb()).updateTable('sys_file').set({deleted:1}).where('file_id','=',ctx.params.fileId).execute();
  ctx.body = { code: 200, message: '删除成功' };
});
router.get('/file/:fileId/url', jwtAuth(), hasPerm('system:file:download'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_file').selectAll().where('file_id','=',ctx.params.fileId).executeTakeFirst() };
});
router.get('/file/:fileId/download', jwtAuth(), hasPerm('system:file:download'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom('sys_file').selectAll().where('file_id','=',ctx.params.fileId).executeTakeFirst() };
});

export default router;
