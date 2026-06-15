import { ValidationError } from '../../../core/errors';
import { isPlatformTenantId } from '../../../shared/constants/tenant';
import { buildMenuTree } from '../../../shared/utils/menu-tree';
import { TenantRepository } from '../tenant/tenant.repository';
import { MenuInput } from './menu.model';
import { MenuRepository } from './menu.repository';

export class MenuService {
  constructor(
    private readonly repository = new MenuRepository(),
    private readonly tenantRepository = new TenantRepository()
  ) {}

  async list() {
    return buildMenuTree(await this.repository.listMenus());
  }

  async packageTree(tenantId: string) {
    if (isPlatformTenantId(tenantId)) {
      return buildMenuTree(await this.repository.listMenus());
    }
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant || !tenant.packageId) {
      return [];
    }
    return buildMenuTree(await this.repository.listPackageMenus(tenant.packageId));
  }

  add(input: MenuInput) {
    return this.repository.create(input);
  }

  async edit(input: MenuInput & { menuId: string }) {
    await this.repository.update(input);
  }

  async remove(ids: string[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
