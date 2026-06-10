import { execute, transaction } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { getPageParams } from '../../../shared/utils/pagination';
import { hashPassword } from '../../../shared/utils/password';
import { BaseCrudRepository } from '../common/base-crud';
import { UserInput, UserQuery } from './user.model';

export class UserRepository extends BaseCrudRepository {
  listUsers(query: UserQuery) {
    return this.list(
      {
        table: 'sys_user',
        idColumn: 'user_id',
        selectSql: `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname, real_name AS realName,
                    avatar, gender, email, phone, dept_id AS deptId, is_admin AS isAdmin,
                    status, last_login_ip AS lastLoginIp, last_login_time AS lastLoginTime,
                    remark, create_time AS createTime, update_time AS updateTime FROM sys_user`,
        keywordColumn: 'username',
        keyword: query.keyword,
        status: query.status,
        extraConditions: [{ sql: 'deleted = 0', params: {} }],
      },
      getPageParams(query),
    );
  }

  async createUser(input: UserInput): Promise<number> {
    const tenantId = getCurrentTenantId() === 0 ? input.tenantId ?? 0 : getCurrentTenantId();
    const password = await hashPassword(input.password ?? '123456');
    return transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO sys_user (tenant_id, username, password, nickname, real_name, avatar, gender, email, phone, dept_id, is_admin, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          input.username,
          password,
          input.nickname,
          input.realName ?? null,
          input.avatar ?? null,
          input.gender ?? '2',
          input.email ?? null,
          input.phone ?? null,
          input.deptId ?? null,
          input.isAdmin ?? '0',
          input.status ?? '0',
          input.remark ?? null,
        ],
      );
      const userId = (result as { insertId: number }).insertId;
      if (input.roleIds?.length) {
        await conn.query('INSERT INTO sys_user_role (user_id, role_id) VALUES ?', [input.roleIds.map((roleId) => [userId, roleId])]);
      }
      return userId;
    });
  }

  async updateUser(input: UserInput & { userId: number }): Promise<void> {
    await this.update('sys_user', 'user_id', input.userId, {
      nickname: input.nickname,
      realName: input.realName ?? null,
      avatar: input.avatar ?? null,
      gender: input.gender ?? '2',
      email: input.email ?? null,
      phone: input.phone ?? null,
      deptId: input.deptId ?? null,
      isAdmin: input.isAdmin ?? '0',
      status: input.status ?? '0',
      remark: input.remark ?? null,
    });
    await execute('DELETE FROM sys_user_role WHERE user_id = :userId', { userId: input.userId });
    if (input.roleIds?.length) {
      await execute(`INSERT INTO sys_user_role (user_id, role_id) VALUES ${input.roleIds.map(() => '(?, ?)').join(',')}`, input.roleIds.flatMap((roleId) => [input.userId, roleId]));
    }
  }
}
