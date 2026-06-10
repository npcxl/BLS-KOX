import { NotFoundError, ValidationError } from '../../../core/errors';
import { getPageParams } from '../../../shared/utils/pagination';
import { CreateTenantInput, TenantQuery, UpdateTenantInput } from './tenant.model';
import { TenantRepository } from './tenant.repository';

export class TenantService {
  constructor(private readonly repository = new TenantRepository()) {}

  listPublic() {
    return this.repository.listPublic();
  }

  list(query: TenantQuery) {
    return this.repository.list(query, getPageParams(query));
  }

  async add(input: CreateTenantInput): Promise<number> {
    return this.repository.create(input);
  }

  async edit(input: UpdateTenantInput): Promise<void> {
    const old = await this.repository.findById(input.tenantId);
    if (!old) throw new NotFoundError('租户不存在');
    if (input.tenantId === 0) throw new ValidationError('平台租户不允许修改');
    await this.repository.update(input);
  }

  async remove(ids: number[]): Promise<void> {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    if (ids.includes(0)) throw new ValidationError('平台租户不允许删除');
    await this.repository.remove(ids);
  }

  async changeStatus(tenantId: number, status: '0' | '1'): Promise<void> {
    if (tenantId === 0) throw new ValidationError('平台租户不允许禁用');
    await this.repository.changeStatus(tenantId, status);
  }
}
