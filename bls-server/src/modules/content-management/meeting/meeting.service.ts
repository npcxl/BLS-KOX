import { ValidationError } from '../../../core/errors';
import { MeetingInput, MeetingRepository } from './meeting.repository';

export class MeetingService {
  constructor(private readonly repository = new MeetingRepository()) {}

  list(pageNum?: number, pageSize?: number, keyword?: string) {
    return this.repository.list(pageNum, pageSize, keyword);
  }

  detail(id: string) {
    return this.repository.detail(id);
  }

  add(input: MeetingInput) {
    return this.repository.add(input);
  }

  async edit(id: string, input: MeetingInput) {
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
