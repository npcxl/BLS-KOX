import { NotFoundError, ValidationError } from '../../../core/errors';
import { getPageParams } from '../../../shared/utils/pagination';
import { CreateStorageInput, StorageQuery, UpdateStorageInput } from './storage.model';
import { StorageRepository } from './storage.repository';

export class StorageService {
  constructor(private readonly repository = new StorageRepository()) {}

  list(query: StorageQuery) {
    return this.repository.list(query, getPageParams(query));
  }

  listFiles(query: { moduleName?: string; accessType?: string; pageNum?: number | string; pageSize?: number | string }) {
    return this.repository.listFiles(query, getPageParams(query));
  }

  async detail(storageId: string) {
    const storage = await this.repository.findById(storageId);
    if (!storage) throw new NotFoundError('存储配置不存在');
    return storage;
  }

  async add(input: CreateStorageInput): Promise<string> {
    if (!input.storageName) throw new ValidationError('存储名称不能为空');
    return this.repository.create(input);
  }

  async edit(input: UpdateStorageInput): Promise<void> {
    const old = await this.repository.findById(input.storageId);
    if (!old) throw new NotFoundError('存储配置不存在');
    await this.repository.update(input);
  }

  async defaultStorage() {
    return this.repository.findDefault();
  }
}
