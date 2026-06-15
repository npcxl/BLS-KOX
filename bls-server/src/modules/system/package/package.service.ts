import { NotFoundError, ValidationError } from '../../../core/errors';
import { PackageInput, PackageQuery } from './package.model';
import { PackageRepository } from './package.repository';

export class PackageService {
  constructor(private readonly repository = new PackageRepository()) {}

  list(query: PackageQuery) {
    return this.repository.list(query);
  }

  options() {
    return this.repository.listOptions();
  }

  async detail(packageId: string) {
    const item = await this.repository.findById(packageId);
    if (!item) throw new NotFoundError('套餐不存在');
    return item;
  }

  async add(input: PackageInput): Promise<string> {
    return this.repository.create(input);
  }

  async edit(input: PackageInput & { packageId: string }): Promise<void> {
    const old = await this.repository.findById(input.packageId);
    if (!old) throw new NotFoundError('套餐不存在');
    await this.repository.update(input);
  }

  async remove(ids: string[]): Promise<void> {
    if (!ids.length) throw new ValidationError('请选择要删除的数据');
    const boundCount = await this.repository.countBoundTenants(ids);
    if (boundCount > 0) throw new ValidationError('套餐已绑定租户，不能删除');
    await this.repository.remove(ids);
  }

  async menuIds(packageId: string): Promise<string[]> {
    const old = await this.repository.findById(packageId);
    if (!old) throw new NotFoundError('套餐不存在');
    return this.repository.listMenuIds(packageId);
  }

  async assignMenus(packageId: string, menuIds: string[]): Promise<void> {
    const old = await this.repository.findById(packageId);
    if (!old) throw new NotFoundError('套餐不存在');
    await this.repository.assignMenus(packageId, menuIds);
  }
}
