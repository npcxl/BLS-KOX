import { ValidationError } from '../../../core/errors';
import { RoleInput, RoleQuery } from './role.model';
import { RoleRepository } from './role.repository';

export class RoleService {
  constructor(private readonly repository = new RoleRepository()) {}

  list(query: RoleQuery) {
    return this.repository.listRoles(query);
  }

  add(input: RoleInput) {
    return this.repository.createRole(input);
  }

  async edit(input: RoleInput & { roleId: number }) {
    await this.repository.updateRole(input);
  }

  async remove(ids: number[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.softDelete('sys_role', 'role_id', ids);
  }
}
