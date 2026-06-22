import { ValidationError } from '../../../core/errors';
import { writeOperationLog } from '../../../core/audit';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { UserInput, UserQuery } from './user.model';
import { UserRepository } from './user.repository';

export class UserService {
  constructor(private readonly repository = new UserRepository()) {}

  private async logOperation(input: { title: string; businessType: string; success: '0' | '1'; userId?: string | null; username?: string | null; moduleName?: string | null; requestMethod?: string | null; requestUrl?: string | null; requestParams?: string | null; responseStatus?: number | null; errorMessage?: string | null; errorStack?: string | null; clientIp?: string | null; userAgent?: string | null; requestId?: string | null; costTimeMs?: number | null; remark?: string | null; }) {
    await writeOperationLog({
      tenantId: getCurrentTenantId() ?? '000000',
      ...input,
    }).catch(() => undefined);
  }

  list(query: UserQuery) {
    return this.repository.listUsers(query);
  }

  async getProfile(userId: string) {
    return this.repository.getProfile(userId);
  }

  async updateProfile(userId: string, input: Partial<UserInput>) {
    await this.repository.updateProfile(userId, input);
  }

  add(input: UserInput) {
    return this.repository.createUser({ ...input });
  }

  async edit(input: UserInput & { userId: string }) {
    await this.repository.updateUser({ ...input });
  }

  async remove(ids: string[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.removeUsers(ids);
  }
}
