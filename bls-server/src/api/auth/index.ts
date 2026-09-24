import { Context } from 'koa';
import { createHash } from 'crypto';
import { getRedisClient } from '../../shared/utils/redis';
import { signToken, signRefreshToken, verifyToken, verifyRefreshToken } from '../../shared/utils/jwt';
import { UnauthorizedError } from '../../core/errors';
import { getDb, query, queryOne } from '../../core/database';
import { buildRequestMeta } from '../../shared/utils/request-meta';
import { buildMenuTree } from '../../shared/utils/menu-tree';
import { ConfigService } from '../system/config/index';
import { sessionCenter } from '../../security/session/session-center';
import { getRequestContext } from '../../core/request-context';
import { writeSecurityLog, actorFromCtx, SecurityEventType, RiskLevel } from '../../core/security-audit';
import { logger } from '../../core/logger';
import { publishEvent } from '../../services/event-client';
import { assertTenantActive, assertTenantUsable, findTenantByDomain, findTenantById } from '../../services/tenant-lifecycle';
import { PLATFORM_TENANT_ID } from '../../shared/constants/tenant';
import { captchaService, type CaptchaRequestMeta } from '../../security/captcha/service';
import { writeLoginLog, type AuditActor } from '../../core/audit';

// ============ Session ============
const SESSION_PREFIX = 'auth:session:';
function sessionKey(jti: string) { return `${SESSION_PREFIX}${jti}`; }
function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
type StoredSession = { userId: string; accessJti: string; refreshJti: string; refreshHash: string };

export async function getStoredSession(accessJti: string): Promise<StoredSession | null> {
  const client = getRedisClient(); if (!client) return null;
  const v = await client.get(sessionKey(accessJti));
  return v ? JSON.parse(v) : null;
}

// ============ AuthService ============
export class AuthService {
  async profile(userId: string, tenantId: string) {
    // 阶段二：用户、角色、菜单查询全部显式带上 tenant 归属约束
    const user = await queryOne<any>(
      `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname, real_name AS realName,
              avatar, gender, email, phone, dept_id AS deptId, is_admin AS isAdmin, status, deleted
       FROM sys_user WHERE user_id = :uid AND tenant_id = :tid AND deleted = 0`,
      { uid: userId, tid: tenantId });
    if (!user) throw new UnauthorizedError('用户不存在');

    // 角色信息（含 data_scope）：角色必须属于当前租户或平台租户
    const roles = await query<{ roleKey: string; dataScope: string }>(
      `SELECT r.role_key AS roleKey, r.data_scope AS dataScope
       FROM sys_role r JOIN sys_user_role ur ON r.role_id = ur.role_id
       WHERE ur.user_id = :uid AND r.status = '0' AND r.deleted = 0
         AND (r.tenant_id = :tid OR r.tenant_id = :pid)`,
      { uid: userId, tid: tenantId, pid: PLATFORM_TENANT_ID });
    const perms = await query<{ perms: string }>(
      `SELECT DISTINCT m.perms FROM sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.menu_id
       JOIN sys_user_role ur ON rm.role_id = ur.role_id
       JOIN sys_role r ON r.role_id = ur.role_id
       WHERE ur.user_id = :uid AND m.perms IS NOT NULL AND r.status = '0' AND r.deleted = 0
         AND (r.tenant_id = :tid OR r.tenant_id = :pid)`,
      { uid: userId, tid: tenantId, pid: PLATFORM_TENANT_ID });
    const menuRows = await query<any>(
      `SELECT DISTINCT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
              m.path, m.component, m.icon, m.menu_type AS menuType, m.sort_num AS sortNum
       FROM sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.menu_id
       JOIN sys_user_role ur ON rm.role_id = ur.role_id
       JOIN sys_role r ON r.role_id = ur.role_id
       WHERE ur.user_id = :uid AND m.menu_type IN ('0','1') AND m.status = '0'
         AND r.status = '0' AND r.deleted = 0
         AND (r.tenant_id = :tid OR r.tenant_id = :pid)
       ORDER BY m.sort_num ASC`, { uid: userId, tid: tenantId, pid: PLATFORM_TENANT_ID });
    // 阶段二：套餐是租户权限上限 → effectivePermissions = rolePermissions ∩ packagePermissions
    const packagePermRows = await query<{ perms: string }>(
      `SELECT DISTINCT m.perms FROM sys_package_menu pm
       JOIN sys_menu m ON pm.menu_id = m.menu_id
       JOIN sys_tenant t ON t.package_id = pm.package_id
       WHERE t.tenant_id = :tid AND m.perms IS NOT NULL`,
      { tid: tenantId });
    const packageMenus = await query<{ menuId: string }>(
      `SELECT pm.menu_id AS menuId FROM sys_package_menu pm
       JOIN sys_tenant t ON t.package_id = pm.package_id
       WHERE t.tenant_id = :tid`,
      { tid: tenantId });
    const packageMenuSet = new Set(packageMenus.map((m) => String(m.menuId)));

    const rolePermList = perms.map(p => p.perms).filter(Boolean);
    const packagePermSet = new Set(packagePermRows.map(p => p.perms).filter(Boolean));
    let permissionList: string[];
    if (packagePermSet.size === 0) {
      // 套餐未配置任何权限（历史 / 异常数据）：不裁剪，避免把整个租户锁死
      permissionList = rolePermList;
      logger.warn('[auth] package has no permissions, entitlement intersection skipped', { tenantId });
    } else if (rolePermList.includes('*')) {
      permissionList = [...packagePermSet];
    } else {
      permissionList = rolePermList.filter(p => packagePermSet.has(p));
    }

    // 菜单同样受套餐约束（套餐未配置菜单时不裁剪）
    const visibleMenuRows = packageMenuSet.size > 0
      ? menuRows.filter((r: any) => packageMenuSet.has(String(r.menuId)))
      : menuRows;
    const menus = buildMenuTree(visibleMenuRows);
    // permissions 与 perms 同时返回：Java/旧版前端使用 permissions，Koa hasPerm 与 bls-admin 使用 perms
    return { ...user, permissions: permissionList, perms: permissionList, roles, menus };
  }

  async loginByDomain(domainName: string, username: string, password: string, meta?: any) {
    let tenant = await findTenantByDomain(domainName);
    if (!tenant) {
      // 仅 localhost / 127.0.0.1 / 无域名 场景 fallback 到平台租户
      // 生产环境未知域名直接报错，避免租户泄露
      if (domainName === 'localhost' || domainName === '127.0.0.1' || domainName === '::1') {
        tenant = await findTenantById(PLATFORM_TENANT_ID);
      }
    }
    if (!tenant) throw new UnauthorizedError('当前域名未绑定租户');
    // 阶段一：停用 / 过期 / offboarding 的租户一律拒绝登录
    assertTenantUsable(tenant);
    return this.loginByTenant(tenant.tenantId, username, password, meta);
  }

  async loginByTenant(tenantId: string, username: string, password: string, meta?: any) {
    await getDb(); // ensure connection pool is initialized
    const db = await getDb();
    // 阶段一：即便被内部直接调用，也必须先确认租户可用
    await assertTenantActive(tenantId);
    const user = await queryOne<any>(
      `SELECT user_id AS userId, username, nickname, password, password_algorithm AS passwordAlgorithm,
              tenant_id AS tenantId, is_admin AS isAdmin, status, deleted
       FROM sys_user WHERE username = :un AND tenant_id = :tid AND deleted = 0`, { un: username, tid: tenantId });

    if (!user) throw new UnauthorizedError('用户名或密码错误');

    // 根据 password_algorithm 选择验证方式
    const passwordModule = await import('../../shared/utils/password.js');
    const algorithm = user.passwordAlgorithm || 'md5';
    const isValid = await passwordModule.verifyPassword(password, user.password, algorithm);

    if (!isValid) throw new UnauthorizedError('用户名或密码错误');

    if (String(user.status ?? '0') !== '0' || Number(user.deleted ?? 0) !== 0) {
      throw new UnauthorizedError('用户已被停用');
    }

    // 阶段四：MD5 旧用户登录成功后，在同一次登录流程中静默升级为 Argon2id
    if (algorithm === 'md5') {
      try {
        // 必须用存储规范（argon2id(md5(password))）写入：登录接口收到的是 md5(明文)，
        // 若直接 hashPasswordArgon2(password) 会写出另一种规范，导致改密 / 下次登录对不上
        const { hashPasswordCanonical } = passwordModule;
        const upgraded = await hashPasswordCanonical(password);
        await db.updateTable('sys_user')
          .set({ password: upgraded, password_algorithm: 'argon2id', password_update_time: new Date() } as any)
          .where('user_id', '=', user.userId)
          .where('tenant_id', '=', tenantId)
          .execute();
        logger.info('[auth] MD5 password upgraded to Argon2id', {
          userId: user.userId, username: user.username,
        });
      } catch (error) {
        // 升级失败不影响本次登录（下次登录可重试）
        logger.warn('[auth] MD5 → Argon2id upgrade failed', {
          userId: user.userId, error: String(error),
        });
      }
    }
    const profile = await this.profile(user.userId, tenantId);
    const payload: any = { userId: user.userId, username: user.username, tenantId };
    const accessToken = signToken(payload);
    const refreshToken = signRefreshToken(payload);
    const configSvc = new ConfigService();
    const multi = await configSvc.isMultiLoginEnabled(tenantId);

    // 保存 session 到 Redis
    const client = getRedisClient();
    if (client) {
      const accessPayload: any = verifyToken(accessToken.replace(/^Bearer\s+/i, ''));
      const refreshPayload: any = verifyRefreshToken(refreshToken);
      const accessTtl = Math.max(accessPayload.exp ? accessPayload.exp - Math.floor(Date.now()/1000) : 0, 1);
      const refreshTtl = refreshPayload.exp ? refreshPayload.exp - Math.floor(Date.now()/1000) : 7*24*60*60;
      const refreshHash = hashToken(refreshToken);
      const refreshJti = refreshPayload.jti;
      const accessJti = accessPayload.jti;
      if (!multi) {
        // 清理 legacy session keys
        const key = `auth:user-sessions:${user.userId}`;
        const jtis = await client.smembers(key);
        if (jtis.length > 0) {
          await client.del(...jtis.map((j: string) => `auth:session:${j}`));
          await client.del(...jtis.map((j: string) => `auth:refresh:${j}`));
        }
        await client.del(key);
        // Session Center：踢出所有旧设备
        await sessionCenter.revokeAll(tenantId, user.userId);
      }
      await client.set(`auth:session:${accessJti}`, JSON.stringify({ userId: user.userId, accessJti, refreshJti, refreshHash }), 'EX', accessTtl);
      await client.sadd(`auth:user-sessions:${user.userId}`, accessJti);
      await client.set(`auth:refresh:${refreshJti}`, refreshHash, 'EX', refreshTtl);

      // Session Center：acc:{accessJti} 用于 auth 校验，ref:{refreshJti} 用于 refresh 吊销
      const ip = meta?.loginIp ?? getRequestContext()?.clientIp ?? 'unknown';
      const ua = meta?.userAgent ?? getRequestContext()?.userAgent ?? 'unknown';
      const now = Date.now();
      const baseSession = { userId: user.userId, tenantId, accessJti, refreshJti, ip, userAgent: ua, loginTime: now, lastActiveTime: now, status: 'active' as const, refreshTokenHash: refreshHash };
      await sessionCenter.create({ ...baseSession, sessionId: `acc:${accessJti}` }, refreshTtl);
      await sessionCenter.create({ ...baseSession, sessionId: `ref:${refreshJti}` }, refreshTtl);
    }
    return { token: accessToken, refreshToken, user: profile };
  }

  async logout(token: string) {
    const client = getRedisClient();
    if (client) {
      try {
        const { verifyToken: vt } = await import('../../shared/utils/jwt.js');
        const p: any = vt(token.replace(/^Bearer\s+/i, ''));
        // 读取 stored session 获取 refreshJti
        const storedRaw = await client.get(sessionKey(p.jti));
        const stored: StoredSession | null = storedRaw ? JSON.parse(storedRaw) : null;
        const refreshJti = stored?.refreshJti;

        // 清理 legacy keys
        await client.del(sessionKey(p.jti));
        if (refreshJti) await client.del(`auth:refresh:${refreshJti}`);

        // Session Center：吊销 acc + ref
        await sessionCenter.revoke(p.tenantId, p.userId, `acc:${p.jti}`);
        if (refreshJti) await sessionCenter.revoke(p.tenantId, p.userId, `ref:${refreshJti}`);
      } catch { /* ignore */ }
    }
    return null;
  }
}

// ============ Routes ============
const S = new AuthService();

/** 暴力破解检测窗口与阈值（基于 sys_login_log 的真实失败事件） */
const BRUTE_FORCE_WINDOW_MINUTES = 15;
const BRUTE_FORCE_THRESHOLD = 5;

function buildLoginActor(
  ctx: Context,
  meta: any,
  reqCtx: any,
  tenantId: string,
  username: string | null,
  userId: string | null = null,
): AuditActor {
  return {
    tenantId,
    userId,
    username,
    clientIp: reqCtx?.clientIp ?? meta?.loginIp ?? ctx.ip ?? null,
    userAgent: (reqCtx?.userAgent ?? meta?.userAgent ?? ctx.headers['user-agent'] ?? null) as string | null,
    requestId: (reqCtx?.requestId ?? meta?.requestId ?? null) as string | null,
  };
}

/**
 * 阶段四：基于 sys_login_log 的真实登录失败事件做暴力破解检测。
 * 同一账号在窗口内的失败次数达到阈值 → 写入 LOGIN_BRUTE_FORCE（由 Event Center 自动处置 IP）。
 */
async function detectBruteForce(
  ctx: Context,
  meta: any,
  reqCtx: any,
  tenantId: string,
  username: string,
): Promise<void> {
  if (!username) return;
  try {
    const row = await queryOne<{ cnt: number | string }>(
      `SELECT COUNT(*) AS cnt FROM sys_login_log
       WHERE username = :un AND login_status = '0'
         AND login_time > NOW() - INTERVAL ${BRUTE_FORCE_WINDOW_MINUTES} MINUTE`,
      { un: username },
    );
    const failures = Number(row?.cnt ?? 0);
    if (failures >= BRUTE_FORCE_THRESHOLD) {
      await writeSecurityLog({
        eventType: SecurityEventType.LOGIN_BRUTE_FORCE,
        riskLevel: RiskLevel.HIGH,
        title: `暴力破解告警：${username} 在 ${BRUTE_FORCE_WINDOW_MINUTES} 分钟内失败 ${failures} 次`,
        detail: { username, tenantId, failures, windowMinutes: BRUTE_FORCE_WINDOW_MINUTES },
        actor: buildLoginActor(ctx, meta, reqCtx, tenantId, username),
        route: ctx.path,
        method: ctx.method,
        source: 'auth',
      });
    }
  } catch (error) {
    logger.warn('[auth] brute-force detection failed', { error: String(error) });
  }
}

/** 人机验证相关业务码：不计入登录失败 / 不发 LOGIN_FAILED */
const CAPTCHA_ERROR_CODES = new Set([40010, 40011, 40012, 40013, 50301]);
function isCaptchaError(err: any): boolean {
  return CAPTCHA_ERROR_CODES.has(Number(err?.code));
}

export const login = async (ctx: Context) => {
  const meta: any = await buildRequestMeta(ctx);
  const b: any = ctx.request.body ?? {};
  const reqCtx = getRequestContext();
  const domainName = meta.domainName ?? 'localhost';

  // 人机验证元信息：IP / UA / 域名与验证码接口使用同一套解析，保证 hash 绑定一致
  const captchaMeta: CaptchaRequestMeta = {
    domainName,
    username: b.username ?? '',
    ip: meta.loginIp ?? reqCtx?.clientIp ?? 'unknown',
    userAgent: meta.userAgent ?? null,
    requestId: reqCtx?.requestId ?? null,
    route: ctx.path,
    method: ctx.method,
  };

  try {
    // 人机验证：开启时先一次性消费 captchaTicket（GETDEL 原子）；未通过前不检查用户名 / 密码。
    // 登录接口只认 Koa 签发的 ticket，不依赖任何 provider 的验证结果。
    await captchaService.consumeLoginTicket({ ...captchaMeta, captchaTicket: b.captchaTicket });

    // 默认走域名解析租户，不信任前端提交的 tenantId
    const result = await S.loginByDomain(domainName, b.username ?? '', b.password ?? '',
      { loginIp: meta.loginIp, userAgent: meta.userAgent, requestId: meta.requestId, loginType: 'password' });

    // 登录成功 → 清零「连续登录失败」计数
    await captchaService.resetLoginFailures(captchaMeta);

    // 登录成功 → 发送事件到 event-service
    publishEvent({
      tenantId: result.user?.tenantId ?? '000000',
      userId: result.user?.userId ?? null,
      username: b.username,
      eventType: 'LOGIN_SUCCESS',
      riskLevel: 'low',
      sourceModule: 'auth',
      resourceType: 'user',
      resourceId: result.user?.userId ?? null,
      requestId: reqCtx?.requestId ?? null,
      traceId: reqCtx?.traceId ?? null,
      clientIp: reqCtx?.clientIp ?? null,
      userAgent: reqCtx?.userAgent ?? null,
      detailJson: { loginType: 'password', domainName },
    }).catch(() => { /* fire-and-forget */ });

    // 阶段四：登录成功写 sys_login_log
    await writeLoginLog({
      actor: buildLoginActor(ctx, meta, reqCtx, result.user?.tenantId ?? PLATFORM_TENANT_ID,
        b.username ?? null, result.user?.userId ?? null),
      loginType: 'password',
      loginStatus: '1',
    }).catch((logErr) => logger.warn('[auth] writeLoginLog(success) failed', { error: String(logErr) }));

    ctx.body = { code: 200, data: result, message: '操作成功' };
  } catch (err: any) {
    // 验证码未通过不算一次「密码尝试」：不计数、不写登录失败日志、不触发爆破检测
    if (isCaptchaError(err)) {
      throw err;
    }

    // 记录账号 / IP 维度的失败次数（供 forceAfterFailures 强制二级验证）
    await captchaService.recordLoginFailure(captchaMeta);

    // 登录失败 → 发送事件到 event-service
    publishEvent({
      tenantId: '000000',
      username: b.username,
      eventType: 'LOGIN_FAILED',
      riskLevel: 'low',
      sourceModule: 'auth',
      resourceType: 'user',
      requestId: reqCtx?.requestId ?? null,
      traceId: reqCtx?.traceId ?? null,
      clientIp: reqCtx?.clientIp ?? null,
      userAgent: reqCtx?.userAgent ?? null,
      detailJson: { reason: err?.message ?? String(err), domainName },
    }).catch(() => { /* fire-and-forget */ });

    // 阶段四：登录失败也写 sys_login_log（暴力破解规则的真实数据源）
    await writeLoginLog({
      actor: buildLoginActor(ctx, meta, reqCtx, PLATFORM_TENANT_ID, b.username ?? null),
      loginType: 'password',
      loginStatus: '0',
      failReason: err?.message ?? String(err),
    }).catch((logErr) => logger.warn('[auth] writeLoginLog(failed) failed', { error: String(logErr) }));

    await detectBruteForce(ctx, meta, reqCtx, PLATFORM_TENANT_ID, String(b.username ?? ''));

    throw err; // 重新抛出，让错误中间件处理
  }
};

export const profile = async (ctx: Context) => {
  const u = ctx.state.user as any;
  return S.profile(u?.userId, u?.tenantId ?? '000000');
};

export const logout = async (ctx: Context) => {
  const token = ((ctx.headers.authorization as string) ?? '').replace(/^Bearer\s+/i, '');
  if (token) await S.logout(token);
  ctx.body = { code: 200, data: null, message: '操作成功' };
};

export const refresh = async (ctx: Context) => {
  const b: any = ctx.request.body ?? {};
  const rt = b.refreshToken;
  if (!rt) { ctx.body = { code: 400, message: '缺少refreshToken' }; return; }

  try {
    const payload = verifyRefreshToken(rt);
    const client = getRedisClient();
    if (!client) { ctx.body = { code: 500, message: 'Redis不可用' }; return; }

    const storedHash = await client.get(`auth:refresh:${payload.jti}`);
    if (!storedHash || storedHash !== hashToken(rt)) {
      // Refresh Token Reuse Detection
      const markerKey = `auth:refresh-used:${payload.jti}`;
      const wasUsed = await client.exists(markerKey);
      if (wasUsed) {
        await writeSecurityLog({
          eventType: SecurityEventType.REFRESH_TOKEN_REUSE,
          riskLevel: RiskLevel.CRITICAL,
          title: `Refresh Token 复用检测：${payload.username ?? 'unknown'}`,
          detail: { userId: payload.userId, tenantId: payload.tenantId, jti: payload.jti },
          actor: actorFromCtx(ctx),
          route: ctx.path, method: ctx.method, source: 'auth',
        });
        // Revoke all sessions for this user
        await sessionCenter.revokeAll(payload.tenantId, payload.userId);
        logger.warn('Refresh token reuse detected, all sessions revoked', { userId: payload.userId });
      }
      ctx.body = { code: 401, message: 'refreshToken无效' };
      return;
    }

    // 阶段一 / 阶段四：refresh 必须重新检查用户与租户状态
    const user = await queryOne<any>(
      `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname, status, deleted
       FROM sys_user WHERE user_id = :uid AND tenant_id = :tid AND deleted = 0`,
      { uid: payload.userId, tid: payload.tenantId }
    );
    if (!user || Number(user.deleted ?? 0) !== 0) { ctx.body = { code: 401, message: '用户不存在' }; return; }
    if (String(user.status ?? '0') !== '0') { ctx.body = { code: 401, message: '用户已被停用' }; return; }

    try {
      await assertTenantActive(user.tenantId);
    } catch (tenantErr: any) {
      ctx.body = { code: 401, message: tenantErr?.message ?? '租户已停用' };
      return;
    }

    // 标记旧 refresh token 已被消费（Reuse Detection）
    await client.set(`auth:refresh-used:${payload.jti}`, '1', 'EX', 7 * 24 * 60 * 60);

    // 签发新 token（Rotation）
    const newAccessToken = signToken({ userId: user.userId, tenantId: user.tenantId, username: user.username });
    const newRefreshToken = signRefreshToken({ userId: user.userId, tenantId: user.tenantId, username: user.username });

    // 更新 Redis
    const accessPayload: any = verifyToken(newAccessToken.replace(/^Bearer\s+/i, ''));
    const refreshPayload: any = verifyRefreshToken(newRefreshToken);
    const accessTtl = Math.max(accessPayload.exp ? accessPayload.exp - Math.floor(Date.now()/1000) : 900, 60);
    const refreshTtl = refreshPayload.exp ? refreshPayload.exp - Math.floor(Date.now()/1000) : 7*24*60*60;
    const newHash = hashToken(newRefreshToken);

    // 删除旧 session keys
    await client.del(`auth:refresh:${payload.jti}`);
    await client.set(sessionKey(accessPayload.jti), JSON.stringify({ userId: user.userId, accessJti: accessPayload.jti, refreshJti: refreshPayload.jti, refreshHash: newHash }), 'EX', accessTtl);
    await client.set(`auth:refresh:${refreshPayload.jti}`, newHash, 'EX', refreshTtl);

    // Session Center：吊销旧 ref + 创建新 acc/ref
    const ip = getRequestContext()?.clientIp ?? 'unknown';
    const ua = getRequestContext()?.userAgent ?? 'unknown';
    const now = Date.now();
    const baseSession = { userId: user.userId, tenantId: user.tenantId, accessJti: accessPayload.jti, refreshJti: refreshPayload.jti, ip, userAgent: ua, loginTime: now, lastActiveTime: now, status: 'active' as const, refreshTokenHash: newHash };
    await sessionCenter.revoke(payload.tenantId, payload.userId, `ref:${payload.jti}`);
    await sessionCenter.create({ ...baseSession, sessionId: `acc:${accessPayload.jti}` }, refreshTtl);
    await sessionCenter.create({ ...baseSession, sessionId: `ref:${refreshPayload.jti}` }, refreshTtl);

    ctx.body = { code: 200, data: { token: newAccessToken, refreshToken: newRefreshToken }, message: '操作成功' };
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      ctx.body = { code: 401, message: 'refreshToken已过期，请重新登录' };
    } else {
      ctx.body = { code: 401, message: 'refreshToken无效' };
    }
  }
};
