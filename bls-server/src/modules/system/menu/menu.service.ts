import { ValidationError } from '../../../core/errors';
import { buildMenuTree } from '../../../shared/utils/menu-tree';
import { MenuInput } from './menu.model';
import { MenuRepository } from './menu.repository';

export class MenuService {
  constructor(private readonly repository = new MenuRepository()) {}

  async list() {
    return buildMenuTree(await this.repository.listMenus());
  }

  add(input: MenuInput) {
    return this.repository.create(input);
  }

  async edit(input: MenuInput & { menuId: number }) {
    await this.repository.update(input);
  }

  async remove(ids: number[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
