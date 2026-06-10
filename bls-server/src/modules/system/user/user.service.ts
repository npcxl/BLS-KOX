import { ValidationError } from '../../../core/errors';
import { UserInput, UserQuery } from './user.model';
import { UserRepository } from './user.repository';

export class UserService {
  constructor(private readonly repository = new UserRepository()) {}

  list(query: UserQuery) {
    return this.repository.listUsers(query);
  }

  add(input: UserInput) {
    return this.repository.createUser(input);
  }

  async edit(input: UserInput & { userId: number }) {
    await this.repository.updateUser(input);
  }

  async remove(ids: number[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.softDelete('sys_user', 'user_id', ids);
  }
}
