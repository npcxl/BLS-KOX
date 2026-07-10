/**
 * Mass Assignment 防护
 *
 * 禁止将 ctx.request.body 全量写入数据库。
 * 使用 pickAllowed 白名单字段。
 */

/** 从对象中提取允许的字段 */
export function pickAllowed<T extends Record<string, unknown>>(
  source: T,
  allowedFields: string[],
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in source) result[key] = source[key];
  }
  return result as Partial<T>;
}

/** 用户个人资料允许修改的字段 */
export const USER_PROFILE_FIELDS = [
  'nickname', 'avatar', 'email', 'phone', 'gender', 'remark',
];

/** 管理员新建用户允许的字段（不含 isAdmin，超管单独控制） */
export const USER_CREATE_FIELDS = [
  'username', 'password', 'nickname', 'realName', 'avatar',
  'gender', 'email', 'phone', 'deptId', 'status', 'remark',
];

/** 管理员编辑用户允许的字段（不含 isAdmin/tenantId/roleIds/perms/deleted） */
export const USER_EDIT_FIELDS = [
  'nickname', 'realName', 'avatar', 'gender',
  'email', 'phone', 'deptId', 'status', 'remark',
];

/** 禁止写入的字段（用于审计告警） */
export const FORBIDDEN_FIELDS = [
  'tenantId', 'tenant_id', 'userId', 'user_id',
  'roleIds', 'perms', 'deleted',
];
