import fs from 'fs';
import path from 'path';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getPageParams } from '../../../shared/utils/pagination';
import { queryOne, transaction } from '../../../core/database';
import { createStorageProvider } from './storage.factory';
import {
  CreateStorageInput,
  FileUrlResult,
  StorageQuery,
  UpdateStorageInput,
  UploadRequestBody,
} from './storage.model';
import { StorageRepository } from './storage.repository';

const MAX_UPLOAD_BYTES_FALLBACK = 50 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip', '.rar', '.7z',
]);
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
]);

function sanitizeFileName(name: string): string {
  const baseName = path.basename((name ?? 'file').trim());
  return baseName
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180) || 'file';
}

async function getMaxUploadBytes(): Promise<number> {
  const row = await queryOne<{ configValue: string }>(
    `SELECT config_value AS configValue
       FROM sys_config
      WHERE deleted = 0
        AND tenant_id IN (:tenantId, '000000')
        AND config_key = 'sys.upload.maxSize'
        AND status = '0'
      ORDER BY CASE WHEN tenant_id = :tenantId THEN 0 ELSE 1 END
      LIMIT 1`,
    { tenantId: getCurrentTenantId() ?? '000000' },
  );
  const mb = Number(row?.configValue);
  if (!Number.isFinite(mb) || mb <= 0) return MAX_UPLOAD_BYTES_FALLBACK;
  return Math.floor(mb * 1024 * 1024);
}

function getUploadedFile(input: any): { buffer: Buffer; name: string; type?: string | null } {
  const file = input?.file ?? input?.files?.file ?? input?.files?.upload;
  if (!file) throw new ValidationError('请选择上传文件');

  if (Buffer.isBuffer(file.buffer)) {
    return { buffer: file.buffer, name: file.originalFilename ?? file.name ?? 'file', type: file.mimetype ?? file.type ?? null };
  }

  if (file.data) {
    return {
      buffer: Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data),
      name: file.originalFilename ?? file.name ?? 'file',
      type: file.mimetype ?? file.type ?? null,
    };
  }

  if (file._buf) {
    return {
      buffer: Buffer.isBuffer(file._buf) ? file._buf : Buffer.from(file._buf),
      name: file.originalFilename ?? file.name ?? 'file',
      type: file.mimetype ?? file.type ?? null,
    };
  }

  if (file.filepath) {
    return {
      buffer: fs.readFileSync(file.filepath),
      name: file.originalFilename ?? file.name ?? 'file',
      type: file.mimetype ?? file.type ?? null,
    };
  }

  throw new ValidationError('无法读取上传文件内容');
}

export class StorageService {
  constructor(private readonly repository = new StorageRepository()) {}

  list(query: StorageQuery) { return this.repository.list(query, getPageParams(query)); }
  listFiles(query: { moduleName?: string; accessType?: string; pageNum?: number | string; pageSize?: number | string }) { return this.repository.listFiles(query, getPageParams(query)); }

  async detail(storageId: string) { const storage = await this.repository.findById(storageId); if (!storage) throw new NotFoundError('存储配置不存在'); return storage; }

  async add(input: CreateStorageInput): Promise<string> {
    if (!input.storageName) throw new ValidationError('存储名称不能为空');
    const isDefault = input.isDefault === '1';
    return transaction(async (conn) => {
      if (isDefault) await this.repository.clearDefaultWithConn(conn);
      return this.repository.createWithConn(conn, { ...input, tenantId: input.tenantId ?? getCurrentTenantId() ?? '000000', isDefault: isDefault ? '1' : '0' });
    });
  }

  async edit(input: UpdateStorageInput): Promise<void> {
    const old = await this.repository.findById(input.storageId);
    if (!old) throw new NotFoundError('存储配置不存在');
    const isDefault = input.isDefault === '1';
    await transaction(async (conn) => {
      if (isDefault) await this.repository.clearDefaultWithConn(conn, input.storageId);
      await this.repository.updateWithConn(conn, { ...input, isDefault: isDefault ? '1' : '0' });
    });
  }

  async defaultStorage() { return this.repository.findDefault(getCurrentTenantId()); }

  async uploadFile(body: UploadRequestBody, fileLike: any) {
    const storage = body.storageId ? await this.repository.findById(body.storageId) : await this.repository.findDefault(getCurrentTenantId());
    if (!storage) throw new NotFoundError('未找到可用的存储配置');
    const provider = createStorageProvider(storage);
    const uploadFile = getUploadedFile(fileLike);
    const originalName = uploadFile.name;
    const safeName = sanitizeFileName(originalName);
    const ext = path.extname(safeName).toLowerCase();
    const mimeType = (uploadFile.type ?? '').toLowerCase();
    const maxUploadBytes = await getMaxUploadBytes();

    if (uploadFile.buffer.length > maxUploadBytes) {
      throw new ValidationError(`上传文件大小不能超过 ${Math.floor(maxUploadBytes / 1024 / 1024)}MB`);
    }
    if (ext && !ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      throw new ValidationError('不支持的文件后缀');
    }
    if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      throw new ValidationError('不支持的文件类型');
    }

    const bucketName = body.accessType === 'public' ? storage.publicBucket ?? '' : storage.privateBucket ?? storage.publicBucket ?? '';
    if (!bucketName) throw new ValidationError('存储桶未配置');
    const objectName = `${body.moduleName ?? 'common'}/${Date.now()}_${safeName}`;
    const accessType = body.accessType ?? 'private';

    await provider.upload({ originalName, fileName: safeName, mimeType: uploadFile.type, buffer: uploadFile.buffer, bucketName, objectName, accessType });
    const url = accessType === 'public' ? provider.getPublicUrl({ bucketName, objectName }) : null;

    try {
      const fileId = await this.repository.createFile({ originalName, fileName: safeName, mimeType: uploadFile.type, buffer: uploadFile.buffer, accessType, moduleName: body.moduleName ?? null, storageId: storage.storageId, bucketName, objectName, url });
      return { fileId, bucketName, objectName, url };
    } catch (error) {
      await provider.remove({ bucketName, objectName }).catch(() => undefined);
      throw error;
    }
  }

  async deleteFile(fileId: string) { const file = await this.repository.findFileById(fileId); if (!file) throw new NotFoundError('文件不存在'); const storage = await this.repository.findById(file.storageId); if (storage) { const provider = createStorageProvider(storage); await provider.remove({ bucketName: file.bucketName, objectName: file.objectName }); } await this.repository.deleteFile(fileId); }

  async getFileUrl(fileId: string): Promise<FileUrlResult> {
    const file = await this.repository.findFileById(fileId); if (!file) throw new NotFoundError('文件不存在');
    const storage = await this.repository.findById(file.storageId); if (!storage) throw new NotFoundError('存储配置不存在');
    const provider = createStorageProvider(storage);
    const url = file.accessType === 'public' ? file.url ?? provider.getPublicUrl({ bucketName: file.bucketName, objectName: file.objectName }) : await provider.getPrivateUrl({ bucketName: file.bucketName, objectName: file.objectName });
    return { fileId, url };
  }
}
