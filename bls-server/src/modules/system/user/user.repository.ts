import { execute, queryOne, transaction } from "../../../core/database";
import { getCurrentTenantId } from "../../../middleware/tenant";
import { getPageParams } from "../../../shared/utils/pagination";
import { hashPassword } from "../../../shared/utils/password";
import { generateSnowflakeId } from "../../../shared/utils/snowflake";
import { BaseCrudRepository } from "../common/base-crud";
import { UserInput, UserQuery } from "./user.model";

export class UserRepository extends BaseCrudRepository {
  listUsers(query: UserQuery) {
    return this.list(
      {
        table: "sys_user",
        idColumn: "user_id",
        selectSql: `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname, real_name AS realName,
                    avatar, gender, email, phone, dept_id AS deptId, is_admin AS isAdmin,
                    status, last_login_ip AS lastLoginIp, last_login_time AS lastLoginTime,
                    remark, create_time AS createTime, update_time AS updateTime,
                    (
                      SELECT GROUP_CONCAT(ur.role_id)
                      FROM sys_user_role ur
                      WHERE ur.user_id = sys_user.user_id
                    ) AS roleIds,
                    (
                      SELECT GROUP_CONCAT(r.role_name)
                      FROM sys_user_role ur
                      LEFT JOIN sys_role r ON r.role_id = ur.role_id
                      WHERE ur.user_id = sys_user.user_id
                    ) AS roleNames
                    FROM sys_user`,
        keywordColumn: "username",
        keyword: query.keyword,
        status: query.status,
        extraConditions: [{ sql: "deleted = 0", params: {} }],
      },
      getPageParams(query),
    );
  }

  async createUser(input: UserInput): Promise<string> {
    const tenantId = getCurrentTenantId();
    const password = await hashPassword(input.password ?? "123456");
    const userId = input.userId ?? generateSnowflakeId();
    return transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO sys_user (user_id, tenant_id, username, password, nickname, real_name, avatar, gender, email, phone, dept_id, is_admin, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          tenantId,
          input.username,
          password,
          input.nickname,
          input.realName ?? null,
          input.avatar ?? null,
          input.gender ?? "2",
          input.email ?? null,
          input.phone ?? null,
          input.deptId ?? null,
          input.isAdmin ?? "0",
          input.status ?? "0",
          input.remark ?? null,
        ],
      );
      if (input.roleIds?.length) {
        await conn.query(
          "INSERT INTO sys_user_role (user_id, role_id) VALUES ?",
          [input.roleIds.map((roleId) => [userId, roleId])],
        );
      }
      return userId;
    });
  }

  async updateUser(input: UserInput & { userId: string }): Promise<void> {
    await this.update("sys_user", "user_id", input.userId, {
      username: input.username,
      nickname: input.nickname,
      realName: input.realName ?? null,
      avatar: input.avatar ?? null,
      gender: input.gender ?? "2",
      email: input.email ?? null,
      phone: input.phone ?? null,
      deptId: input.deptId ?? null,
      isAdmin: input.isAdmin ?? "0",
      status: input.status ?? "0",
      remark: input.remark ?? null,
    });

    if (Array.isArray(input.roleIds)) {
      await execute(
        `DELETE FROM sys_user_role WHERE user_id = :userId
         AND EXISTS (
           SELECT 1 FROM sys_user u
           WHERE u.user_id = :userId
             AND u.tenant_id = :tenantId
             AND u.deleted = 0
         )`,
        {
          userId: input.userId,
          tenantId: getCurrentTenantId(),
        },
      );

      if (input.roleIds.length) {
        await execute(
          `INSERT INTO sys_user_role (user_id, role_id) VALUES ${input.roleIds
            .map((_, index) => `(:userId, :roleId${index})`)
            .join(", ")}`,
          {
            userId: input.userId,
            ...Object.fromEntries(
              input.roleIds.map((roleId, index) => [`roleId${index}`, roleId]),
            ),
          },
        );
      }
    }
  }

  async getProfile(userId: string) {
    return queryOne(
      `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname, real_name AS realName,
              avatar, gender, email, phone, dept_id AS deptId, is_admin AS isAdmin,
              status, remark, create_time AS createTime, update_time AS updateTime
       FROM sys_user
       WHERE user_id = :userId AND deleted = 0
       LIMIT 1`,
      { userId },
    );
  }

  async updateProfile(userId: string, input: Partial<UserInput>): Promise<void> {
    await this.update('sys_user', 'user_id', userId, {
      nickname: input.nickname,
      realName: input.realName ?? null,
      avatar: input.avatar ?? null,
      gender: input.gender ?? '2',
      email: input.email ?? null,
      phone: input.phone ?? null,
      remark: input.remark ?? null,
    });
  }
}
