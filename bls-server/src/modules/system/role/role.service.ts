import { ValidationError } from '../../../core/errors';
import { RoleInput, RoleQuery } from './role.model';
import { RoleRepository } from './role.repository';

export class RoleService {
  constructor(private readonly repository = new RoleRepository()) {}

  list(query: RoleQuery) {
    return this.repository.listRoles(query);
  }

  async add(input: RoleInput) {
    if (input.menuIds?.length) {
      const outsideCount = await this.repository.countMenusOutsideTenantPackage(input.menuIds);
      if (outsideCount > 0) throw new ValidationError('角色菜单不能超出租户套餐范围');
    }
    return this.repository.createRole({ ...input });
  }

  async edit(input: RoleInput & { roleId: string }) {
    if (input.menuIds?.length) {
      const outsideCount = await this.repository.countMenusOutsideTenantPackage(input.menuIds);
      if (outsideCount > 0) throw new ValidationError('角色菜单不能超出租户套餐范围');
    }
    await this.repository.updateRole({ ...input });
  }

  async remove(ids: string[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.softDelete('sys_role', 'role_id', ids);
  }

  async menuIds(roleId: string): Promise<string[]> {
    const role = await this.repository.findTenantRole(roleId);
    if (!role) throw new ValidationError('角色不存在或无权访问');
    return this.repository.listMenuIds(roleId);
  }

  async assignMenus(roleId: string, menuIds: string[]): Promise<void> {
    const role = await this.repository.findTenantRole(roleId);
    if (!role) throw new ValidationError('角色不存在或无权访问');
    if (menuIds.length) {
      const outsideCount = await this.repository.countMenusOutsideTenantPackage(menuIds);
      if (outsideCount > 0) throw new ValidationError('角色菜单不能超出租户套餐范围');
    }
    await this.repository.assignMenus(roleId, menuIds);
  }
}
