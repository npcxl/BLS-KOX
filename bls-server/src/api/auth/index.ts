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
    const user = await queryOne<any>(
      `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname, real_name AS realName,
              avatar, gender, email, phone, dept_id AS deptId, is_admin AS isAdmin, status
       FROM sys_user WHERE user_id = :uid AND deleted = 0`, { uid: userId });
    if (!user) throw new UnauthorizedError('用户不存在');
    // 角色信息（含 P9 data_scope）
    const roles = await query<{ roleKey: string; dataScope: string }>(
      `SELECT r.role_key AS roleKey, r.data_scope AS dataScope
       FROM sys_role r JOIN sys_user_role ur ON r.role_id = ur.role_id
       WHERE ur.user_id = :uid AND r.status = '0' AND r.deleted = 0`,
      { uid: userId });
    const perms = await query<{ perms: string }>(
      `SELECT DISTINCT m.perms FROM sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.menu_id
       JOIN sys_user_role ur ON rm.role_id = ur.role_id WHERE ur.user_id = :uid AND m.perms IS NOT NULL`,
      { uid: userId });
    const menuRows = await query<any>(
      `SELECT DISTINCT m.menu_id AS menuId, m.parent_id AS parentId, m.menu_name AS menuName,
              m.path, m.component, m.icon, m.menu_type AS menuType, m.sort_num AS sortNum
       FROM sys_role_menu rm JOIN sys_menu m ON rm.menu_id = m.menu_id
       JOIN sys_user_role ur ON rm.role_id = ur.role_id
       WHERE ur.user_id = :uid AND m.menu_type IN ('0','1') AND m.status = '0'
       ORDER BY m.sort_num ASC`, { uid: userId });
    const menus = buildMenuTree(menuRows);
    return { ...user, permissions: perms.map(p => p.perms).filter(Boolean), roles, menus };
  }

  async loginByDomain(domainName: string, username: string, password: string, meta?: any) {
    let tenant = await queryOne<any>(
      `SELECT tenant_id AS tenantId FROM sys_tenant WHERE domain_name = :d AND status = '0'`, { d: domainName });
    if (!tenant) {
      // fallback: 匹配平台租户（localhost 等无域名场景）
      tenant = await queryOne<any>(
        `SELECT tenant_id AS tenantId FROM sys_tenant WHERE tenant_id = '000000'`);
    }
    if (!tenant) throw new UnauthorizedError('当前域名未绑定租户');
    return this.loginByTenant(tenant.tenantId, username, password, meta);
  }

  async loginByTenant(tenantId: string, username: string, password: string, meta?: any) {
    await getDb(); // ensure connection pool is initialized
    const user = await queryOne<any>(
      `SELECT user_id AS userId, username, nickname, password, tenant_id AS tenantId, is_admin AS isAdmin, status
       FROM sys_user WHERE username = :un AND tenant_id = :tid AND deleted = 0`, { un: username, tid: tenantId });
    if (!user || !(await import('../../shared/utils/password.js')).verifyPassword(password, user.password)) throw new UnauthorizedError('用户名或密码错误');
    if (user.status === '1') throw new UnauthorizedError('用户已被停用');
    const profile = await this.profile(user.userId, tenantId);
    const payload: any = { userId: user.userId, username: user.username, tenantId };
    const accessToken = signToken(payload);
    const refreshToken = signRefreshToken(payload);
    const configSvc = new ConfigService();
    const multi = await configSvc.isMultiLoginEnabled();

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

export const login = async (ctx: Context) => {
  const meta: any = await buildRequestMeta(ctx);
  const b: any = ctx.request.body ?? {};
  const result = b.tenantId
    ? await S.loginByTenant(b.tenantId, b.username ?? '', b.password ?? '',
        { loginIp: meta.loginIp, userAgent: meta.userAgent, requestId: meta.requestId, loginType: 'password' })
    : await S.loginByDomain(meta.domainName ?? 'default', b.username ?? '', b.password ?? '',
        { loginIp: meta.loginIp, userAgent: meta.userAgent, requestId: meta.requestId, loginType: 'password' });
  ctx.body = { code: 200, data: result, message: '操作成功' };
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

    // 标记旧 refresh token 已被消费（Reuse Detection）
    await client.set(`auth:refresh-used:${payload.jti}`, '1', 'EX', 7 * 24 * 60 * 60);

    // 获取用户信息
    const user = await queryOne<any>(
      `SELECT user_id AS userId, tenant_id AS tenantId, username, nickname FROM sys_user WHERE user_id = :uid AND deleted = 0`,
      { uid: payload.userId }
    );
    if (!user) { ctx.body = { code: 401, message: '用户不存在' }; return; }

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
