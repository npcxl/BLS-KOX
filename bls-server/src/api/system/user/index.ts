import Router from 'koa-router';
import { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors';
import { getRequestContext } from '../../../core/request-context';
import { logSecurity } from '../../../core/security-audit';
import { SecurityEventType } from '../../../core/security-audit';
import { pickAllowed, toSnake, USER_PROFILE_FIELDS, USER_CREATE_FIELDS, USER_EDIT_FIELDS } from '../../../shared/utils/mass-assignment';
import { hashPasswordArgon2, hashPasswordMd5 } from '../../../shared/utils/password';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { appendEvent, EventTypes } from '../../../outbox/outbox';
import { sessionCenter } from '../../../security/session/session-center';
import { extractIds } from '../../../core/crud';
import { success, pageSuccess } from '../../../core/response';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';
import { logger } from '../../../core/logger';
import { quotaService } from '../../../services/quota-service';
import { QUOTA_KEYS } from '../../../shared/constants/entitlements';
import { passwordResetService } from '../../../services/password-reset-service';

const router = new Router({ prefix: '/system/user' });
const T = 'sys_user', UR = 'sys_user_role', R = 'sys_role';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tenantId(): string {
  const ctx = getRequestContext();
  const tid = ctx?.tenantId;
  if (!tid) throw new ForbiddenError('未获取到租户上下文');
  return tid;
}

// ====== Zod 校验（白名单之外的字段被忽略） ======

const userCreateSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(50).regex(/^[A-Za-z0-9_.@-]+$/, '用户名只能包含字母、数字、_ . @ -'),
  password: z.string().min(6, '密码至少 6 位').max(100).optional(),
  nickname: z.string().trim().min(1, '昵称不能为空').max(50),
  realName: z.string().max(50).optional(),
  avatar: z.string().max(200).optional(),
  gender: z.enum(['0', '1', '2']).optional(),
  email: z.string().max(100).optional().refine((v) => !v || EMAIL_RE.test(v), '邮箱格式不正确'),
  phone: z.string().max(20).optional(),
  deptId: z.string().max(32).optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).optional(),
  roleIds: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
});

const userEditSchema = z.object({
  userId: z.string().trim().min(1).max(32),
  nickname: z.string().trim().min(1).max(50).optional(),
  realName: z.string().max(50).optional(),
  avatar: z.string().max(200).optional(),
  gender: z.enum(['0', '1', '2']).optional(),
  email: z.string().max(100).optional().refine((v) => !v || EMAIL_RE.test(v), '邮箱格式不正确'),
  phone: z.string().max(20).optional(),
  deptId: z.string().max(32).optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().max(500).optional(),
  roleIds: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
});

const passwordSchema = z.object({
  oldPassword: z.string().min(1).max(100),
  newPassword: z.string().min(6, '新密码长度不能少于6位').max(100),
});

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('参数错误', parsed.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  return parsed.data;
}

/** 校验角色是否可用（当前租户或平台租户角色） */
async function assertRolesValid(db: any, roleIds: string[], tid: string): Promise<void> {
  if (roleIds.length === 0) return;
  const rows: any[] = await db.selectFrom(R).select(['role_id', 'tenant_id'])
    .where('role_id', 'in', roleIds).where('deleted', '=', 0).execute();
  if (rows.length !== roleIds.length) throw new ValidationError('存在无效的角色ID');
  if (tid !== PLATFORM_TENANT_ID) {
    const foreign = rows.filter((r) => String(r.tenant_id) !== tid);
    if (foreign.length > 0) throw new ValidationError('不能分配其他租户的角色');
  }
}

router.get('/list', jwtAuth(), hasPerm('system:user:list'), async (ctx: Context) => {
  const db = (await getDb()) as any; const q: any = ctx.query;
  const p = Math.max(1, +q.pageNum || 1); const s = Math.min(100, Math.max(1, +q.pageSize || 10));
  const tid = tenantId();
  let b = db.selectFrom(T).selectAll().where('deleted', '=', 0).where('tenant_id', '=', tid);

  const searchCols = await db.selectFrom('sys_page_column_config').select('data_index')
    .where('page_code', '=', 'system_user').where('searchable', '=', 1).where('deleted', '=', 0).execute();
  const searchFields: string[] = searchCols.map((c: any) => c.data_index.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()));

  if (q.keyword) {
    const fields = searchFields.length ? searchFields : ['username', 'nickname', 'real_name', 'phone', 'email'];
    b = b.where((eb: any) => eb.or(fields.map((f: string) => eb(f, 'like', `%${q.keyword}%`))));
  }
  for (const c of searchCols) {
    const field = c.data_index;
    if (q[field] !== undefined && q[field] !== '' && q[field] !== null) {
      b = b.where(field.replace(/[A-Z]/g, (m: string) => '_' + m.toLowerCase()), '=', String(q[field]));
    }
  }
  const cr = await (b as any).clearSelect().select((eb: any) => eb.fn.countAll().as('total')).executeTakeFirst();
  const rows: any[] = await b.orderBy('create_time', 'desc').limit(s).offset((p - 1) * s).execute();

  // 附加角色信息（前端列表展示 roleNames / 表单回填 roleIds）
  const userIds = rows.map((r) => r.user_id);
  if (userIds.length > 0) {
    const links: any[] = await db.selectFrom(UR).select(['user_id', 'role_id']).where('user_id', 'in', userIds).execute();
    const roleIds = [...new Set(links.map((l) => String(l.role_id)))];
    const roles: any[] = roleIds.length
      ? await db.selectFrom(R).select(['role_id', 'role_name']).where('role_id', 'in', roleIds).where('deleted', '=', 0).execute()
      : [];
    const nameMap = new Map(roles.map((r) => [String(r.role_id), r.role_name]));
    for (const row of rows) {
      const ids = links.filter((l) => String(l.user_id) === String(row.user_id)).map((l) => String(l.role_id));
      row.roleIds = ids;
      row.roleNames = ids.map((id) => nameMap.get(id)).filter(Boolean).join(',');
    }
  }

  pageSuccess(ctx, rows, Number(cr?.total ?? 0));
});

router.get('/profile', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const db = (await getDb()) as any;
  const row = await db.selectFrom(T).selectAll().where('user_id', '=', u.userId).where('tenant_id', '=', u.tenantId).where('deleted', '=', 0).executeTakeFirst();
  success(ctx, row ?? null, '查询成功');
});

router.put('/profile', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const data = pickAllowed((ctx.request.body ?? {}) as any, USER_PROFILE_FIELDS);
  if (Object.keys(data).length === 0) throw new ValidationError('没有可更新字段');
  await (await getDb()).updateTable(T).set(toSnake(data) as any)
    .where('user_id', '=', u.userId).where('tenant_id', '=', u.tenantId).where('deleted', '=', 0).execute();
  success(ctx, null, '修改成功');
});

router.post('/add', jwtAuth(), hasPerm('system:user:add'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const body = parseOrThrow(userCreateSchema, ctx.request.body ?? {});
  const tid = tenantId();
  const data = pickAllowed(body as any, USER_CREATE_FIELDS) as any;

  // 密码使用 Argon2id 哈希（未填则读取系统参数 sys.user.defaultPassword，兜底 123456）
  if (!data.password) {
    const defaultPwd = await db.selectFrom('sys_config')
      .select('config_value')
      .where('config_key', '=', 'sys.user.defaultPassword')
      .where('tenant_id', '=', tid)
      .where('deleted', '=', 0)
      .limit(1)
      .executeTakeFirst() as any;
    data.password = defaultPwd?.config_value || '123456';
  }
  data.password = await hashPasswordArgon2(String(data.password));

  // 用户名租户内唯一（uk_username_tenant）
  const dup = await db.selectFrom(T).select('user_id')
    .where('username', '=', data.username).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
  if (dup) throw new ConflictError(`用户名已存在：${data.username}`);

  const roleIds = [...new Set(body.roleIds ?? [])];
  await assertRolesValid(db, roleIds, tid);

  // 阶段三：用户数配额（数据库条件 UPDATE，原子且并发安全）
  await quotaService.consume(tid, QUOTA_KEYS.MAX_USERS, 1, {
    idempotencyKey: String(ctx.get('Idempotency-Key') ?? '').trim() || undefined,
    reason: 'user.create',
  });

  const userId = generateSnowflakeId();
  const snakeData = {
    user_id: userId,
    password_algorithm: 'argon2id',
    ...toSnake({ ...data, password: undefined }),
    password: data.password,
    tenant_id: tid,
    deleted: 0,
  };

  // 业务写入与 Outbox 事件写入同一事务 → 原子性: 任一失败整体回滚
  try {
    await db.transaction().execute(async (trx: any) => {
      await trx.insertInto(T).values(snakeData as any).execute();
      if (roleIds.length > 0) {
        await trx.insertInto(UR).values(roleIds.map((roleId) => ({ user_id: userId, role_id: roleId }))).execute();
      }
      await appendEvent(trx, {
        tenantId: tid,
        eventType: EventTypes.USER_CREATED,
        aggregateType: 'user',
        aggregateId: String(data.username),
        payload: { username: data.username, nickname: data.nickname },
      });
    });
  } catch (error) {
    // 创建失败 → 归还配额
    await quotaService.release(tid, QUOTA_KEYS.MAX_USERS, 1).catch(() => {});
    throw error;
  }

  success(ctx, { userId }, '新增成功');
});

router.put('/edit', jwtAuth(), hasPerm('system:user:edit'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const body = parseOrThrow(userEditSchema, ctx.request.body ?? {});
  const tid = tenantId();

  const existing = await db.selectFrom(T).select('user_id')
    .where('user_id', '=', body.userId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (!existing) throw new NotFoundError();

  const data = pickAllowed(body as any, USER_EDIT_FIELDS) as any;
  const roleIds = body.roleIds === undefined ? undefined : [...new Set(body.roleIds)];
  if (Object.keys(data).length === 0 && roleIds === undefined) {
    throw new ValidationError('没有可更新字段');
  }
  if (roleIds !== undefined) await assertRolesValid(db, roleIds, tid);

  const affected = await db.transaction().execute(async (trx: any) => {
    let updated = 1;
    if (Object.keys(data).length > 0) {
      const result: any = await trx.updateTable(T).set(toSnake(data) as any)
        .where('user_id', '=', body.userId).where('tenant_id', '=', tid).where('deleted', '=', 0)
        .executeTakeFirst();
      updated = Number(result?.numUpdatedRows ?? 0);
    }
    if (roleIds !== undefined) {
      await trx.deleteFrom(UR).where('user_id', '=', body.userId).execute();
      if (roleIds.length > 0) {
        await trx.insertInto(UR).values(roleIds.map((roleId) => ({ user_id: body.userId, role_id: roleId }))).execute();
      }
    }
    return updated;
  });

  if (affected === 0) throw new NotFoundError();

  // 阶段四：用户被停用 → 立即吊销其全部会话
  if (String((data as any).status ?? '') === '1') {
    await sessionCenter.revokeAll(tid, body.userId).catch(() => {});
    await logSecurity(ctx, SecurityEventType.PERM_CHANGE, `停用用户：${body.userId}`).catch(() => {});
  }

  // 角色变更同样属于权限变更，记录审计
  if (roleIds !== undefined) {
    await logSecurity(ctx, SecurityEventType.ROLE_CHANGE, `调整用户角色：${body.userId}`).catch(() => {});
  }

  success(ctx, null, '修改成功');
});

/** 修改当前用户密码（租户 + 软删除限定；修改成功后吊销全部会话） */
router.put('/changePassword', jwtAuth(), async (ctx: Context) => {
  const u = ctx.state.user as any;
  const db = (await getDb()) as any;
  const { oldPassword, newPassword } = parseOrThrow(passwordSchema, ctx.request.body ?? {});

  const user = await db.selectFrom(T)
    .select(['password', 'password_algorithm'])
    .where('user_id', '=', u.userId)
    .where('tenant_id', '=', u.tenantId)
    .where('deleted', '=', 0)
    .executeTakeFirst() as any;
  if (!user) throw new NotFoundError('用户不存在');

  const { verifyPassword } = await import('../../../shared/utils/password.js');
  const algorithm = user.password_algorithm || 'md5';
  const valid = await verifyPassword(String(oldPassword), user.password, algorithm);
  if (!valid) throw new ValidationError('旧密码不正确');

  const newHash = await hashPasswordArgon2(String(newPassword));
  const result: any = await db.updateTable(T)
    .set({ password: newHash, password_algorithm: 'argon2id' } as any)
    .where('user_id', '=', u.userId)
    .where('tenant_id', '=', u.tenantId)
    .where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  await sessionCenter.revokeAll(u.tenantId, u.userId).catch(() => {});
  await logSecurity(ctx, SecurityEventType.PERM_CHANGE, '修改密码').catch(() => {});
  success(ctx, null, '密码修改成功');
});

/** 删除用户：逻辑删除 + 清理 sys_user_role + 吊销会话（同一事务处理数据） */
router.delete('/remove', jwtAuth(), hasPerm('system:user:remove'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const ids = [...new Set(extractIds(ctx.request.body, ctx.query))];
  if (ids.length === 0) throw new ValidationError('缺少用户ID');
  const tid = tenantId();

  const affected = await db.transaction().execute(async (trx: any) => {
    // 严格模式：先查当前租户可见ID，再按实际数量删除，防止跨租户
    const visible: any[] = await trx.selectFrom(T).select(['user_id', 'username'])
      .where('user_id', 'in', ids).where('tenant_id', '=', tid).where('deleted', '=', 0).execute();
    if (visible.length !== ids.length) {
      await logSecurity(ctx, SecurityEventType.CROSS_TENANT_ACCESS,
        `批量删除包含跨租户ID：请求${ids.length}个，可见${visible.length}个`).catch(() => {});
      throw new NotFoundError();
    }
    const visibleIds = visible.map((r: any) => String(r.user_id));

    const result: any = await trx.updateTable(T).set({ deleted: 1 })
      .where('user_id', 'in', visibleIds).where('tenant_id', '=', tid).where('deleted', '=', 0)
      .executeTakeFirst();

    // 清理角色关联，避免孤儿数据
    await trx.deleteFrom(UR).where('user_id', 'in', visibleIds).execute();

    return { updated: Number(result?.numUpdatedRows ?? 0), usernames: visible.map((r: any) => r.username) };
  });

  if (affected.updated === 0) throw new NotFoundError();

  // 事务提交后吊销会话
  for (const id of ids) {
    await sessionCenter.revokeAll(tid, id).catch(() => {});
  }
  // 阶段三：删除用户 → 归还用户数配额
  if (affected.updated > 0) {
    await quotaService.release(tid, QUOTA_KEYS.MAX_USERS, affected.updated).catch(() => {});
  }
  await logSecurity(ctx, SecurityEventType.PERM_CHANGE, `删除用户：${affected.usernames.join(',')}`).catch(() => {});

  success(ctx, { deleted: affected.updated }, '删除成功');
});

/**
 * 获取指定用户的活跃会话列表（在线状态/设备列表）
 * 权限: system:user:kick（超级管理员默认拥有）
 */
router.get('/sessions/:userId', jwtAuth(), hasPerm('system:user:kick'), async (ctx: Context) => {
  const tid = tenantId();
  const userId = ctx.params.userId;
  const db = (await getDb()) as any;
  const user = await db.selectFrom(T).select('user_id').where('user_id', '=', userId).where('tenant_id', '=', tid).where('deleted', '=', 0).executeTakeFirst();
  if (!user) throw new NotFoundError('用户不存在');

  const sessions = await sessionCenter.list(tid, userId);
  const active = sessions
    .filter((s) => s.status === 'active')
    .map((s) => ({
      sessionId: s.sessionId,
      deviceId: s.deviceId,
      ip: s.ip,
      userAgent: s.userAgent,
      loginTime: new Date(s.loginTime).toISOString(),
      lastActiveTime: new Date(s.lastActiveTime).toISOString(),
    }));
  success(ctx, { userId, activeSessions: active, online: active.length > 0 }, '查询成功');
});

/**
 * 踢下线：吊销指定用户的全部会话
 * 权限: system:user:kick（超级管理员默认拥有）
 * POST body: { userIds: string[] }
 */
router.post('/kick', jwtAuth(), hasPerm('system:user:kick'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const body = (ctx.request.body ?? {}) as any;
  const userIds: string[] = (body.userIds ?? []).map(String);
  if (!userIds.length) throw new ValidationError('缺少用户ID');

  const tid = tenantId();
  // 跨租户防护：只踢当前租户的用户
  const visible = await db.selectFrom(T).select(['user_id', 'username'])
    .where('user_id', 'in', userIds).where('tenant_id', '=', tid).where('deleted', '=', 0).execute() as any[];
  const visibleIds = visible.map((r: any) => r.user_id);

  let kicked = 0;
  for (const uid of visibleIds) {
    try {
      await sessionCenter.revokeAll(tid, uid);
      kicked++;
      logger.info('[user] kicked offline', { operator: (ctx.state.user as any)?.username, targetUserId: uid });
    } catch (err) {
      logger.error('[user] kick failed', { userId: uid, error: String(err) });
    }
  }

  await logSecurity(ctx, SecurityEventType.PERM_CHANGE, `踢下线用户：${visible.map((r: any) => r.username).join(',')}`).catch(() => {});
  success(ctx, { kicked }, `成功踢出 ${kicked} 个用户`);
});

const adminResetPasswordSchema = z.object({
  userId: z.string().trim().min(1).max(32),
  newPassword: z.string().min(6, '新密码长度不能少于6位').max(100),
});

/**
 * POST /resetPassword — 管理员重置指定用户密码（阶段四）
 *
 * 使用现有 replay signature 规则（写操作由全局 replayProtectionMiddleware 保护）；
 * 重置后立即吊销该用户全部 Session，并使其未消费的重置令牌失效。
 */
router.post('/resetPassword', jwtAuth(), hasPerm('system:user:resetPassword'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const b = parseOrThrow(adminResetPasswordSchema, ctx.request.body ?? {});
  const tid = tenantId();

  const existing = await db.selectFrom(T).select(['user_id', 'username', 'status'])
    .where('user_id', '=', b.userId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (!existing) throw new NotFoundError();

  const raw = String(b.newPassword);
  const md5 = /^[a-f0-9]{32}$/i.test(raw) ? raw.toLowerCase() : hashPasswordMd5(raw);
  const hashed = await hashPasswordArgon2(md5);

  const result: any = await db.updateTable(T)
    .set({ password: hashed, password_algorithm: 'argon2id', password_update_time: new Date() } as any)
    .where('user_id', '=', b.userId).where('tenant_id', '=', tid).where('deleted', '=', 0)
    .executeTakeFirst();
  if (Number(result?.numUpdatedRows ?? 0) === 0) throw new NotFoundError();

  // 会话立即失效 + 旧重置链接失效
  await sessionCenter.revokeAll(tid, b.userId).catch(() => {});
  await passwordResetService.invalidateForUser(b.userId).catch(() => {});

  await logSecurity(ctx, SecurityEventType.PERM_CHANGE, `管理员重置用户密码：${existing.username}`).catch(() => {});
  success(ctx, null, '密码重置成功');
});

export default router;
