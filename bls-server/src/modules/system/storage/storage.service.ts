import { NotFoundError, ValidationError } from '../../../core/errors';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getPageParams } from '../../../shared/utils/pagination';
import { transaction } from '../../../core/database';
import { createStorageProvider } from './storage.factory';
import {
  CreateStorageInput,
  FileUrlResult,
  StorageQuery,
  UpdateStorageInput,
  UploadFileInput,
  UploadRequestBody,
} from './storage.model';
import { StorageRepository } from './storage.repository';

function getUploadedFile(input: any): { buffer: Buffer; name: string; type?: string | null } {
  const file = input?.file ?? input?.files?.file ?? input?.files?.upload;
  if (!file) throw new ValidationError('请选择上传文件');
  const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : file.data ?? file._buf;
  if (!buffer) throw new ValidationError('无法读取上传文件内容');
  return { buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), name: file.originalFilename ?? file.name ?? 'file', type: file.mimetype ?? file.type ?? null };
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
    const safeName = originalName.replace(/\s+/g, '_');
    const bucketName = body.accessType === 'public' ? storage.publicBucket ?? '' : storage.privateBucket ?? storage.publicBucket ?? '';
    if (!bucketName) throw new ValidationError('存储桶未配置');
    const objectName = `${body.moduleName ?? 'common'}/${Date.now()}_${safeName}`;
    await provider.upload({ originalName, fileName: safeName, mimeType: uploadFile.type, buffer: uploadFile.buffer, bucketName, objectName, accessType: body.accessType ?? 'private' });
    const url = (body.accessType ?? 'private') === 'public' ? provider.getPublicUrl({ bucketName, objectName }) : null;
    const fileId = await this.repository.createFile({ originalName, fileName: safeName, mimeType: uploadFile.type, buffer: uploadFile.buffer, accessType: body.accessType ?? 'private', moduleName: body.moduleName ?? null, storageId: storage.storageId, bucketName, objectName, url });
    return { fileId, bucketName, objectName, url };
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
