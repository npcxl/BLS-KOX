import { ValidationError } from '../../../core/errors';
import { SpecialGuestInput, SpecialGuestRepository } from './special-guest.repository';

export class SpecialGuestService {
  constructor(private readonly repository = new SpecialGuestRepository()) {}

  list(pageNum?: number, pageSize?: number, keyword?: string) {
    return this.repository.list(pageNum, pageSize, keyword);
  }

  detail(id: string) {
    return this.repository.detail(id);
  }

  add(input: SpecialGuestInput) {
    return this.repository.add(input);
  }

  async edit(id: string, input: SpecialGuestInput) {
    await this.repository.edit(id, input);
  }

  async updateStatus(id: string, status: number) {
    await this.repository.updateStatus(id, status);
  }

  async remove(ids: string[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
