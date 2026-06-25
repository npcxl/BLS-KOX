import { ValidationError } from '../../../core/errors';
import { DownloadInput, DownloadRepository } from './download.repository';

export class DownloadService {
  constructor(private readonly repository = new DownloadRepository()) {}

  list(pageNum?: number, pageSize?: number, keyword?: string) {
    return this.repository.list(pageNum, pageSize, keyword);
  }

  detail(id: string) {
    return this.repository.detail(id);
  }

  add(input: DownloadInput) {
    return this.repository.add(input);
  }

  async edit(id: string, input: DownloadInput) {
    await this.repository.edit(id, input);
  }

  async remove(ids: string[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
