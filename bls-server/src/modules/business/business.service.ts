import { NotFoundError, ValidationError } from '../../core/errors';
import { PageQuery } from './business.model';
import { BusinessRepository } from './business.repository';

export class BusinessService<TRow extends Record<string, unknown>, TInput = Record<string, unknown>> {
  constructor(private readonly repository: BusinessRepository<TRow, TInput>) {}

  list(query: PageQuery) {
    return this.repository.list(query);
  }

  async detail(id: string): Promise<TRow> {
    const row = await this.repository.detail(id);
    if (!row) throw new NotFoundError('数据不存在');
    return row;
  }

  async add(input: TInput): Promise<string> {
    return this.repository.create(input);
  }

  async edit(id: string, input: TInput): Promise<void> {
    const existed = await this.repository.detail(id);
    if (!existed) throw new NotFoundError('数据不存在');
    await this.repository.update(id, input);
  }

  async remove(ids: string[]): Promise<void> {
    if (!ids.length) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
