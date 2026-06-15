import { UnauthorizedError } from '../../core/errors';
import { PLATFORM_TENANT_ID } from '../../shared/constants/tenant';
import { CurrentUser, TenantInfo, JwtPayload } from '../../shared/types/current-user';
import { signToken, signRefreshToken, verifyRefreshToken, verifyToken } from '../../shared/utils/jwt';
import { buildMenuTree } from '../../shared/utils/menu-tree';
import { verifyPassword } from '../../shared/utils/password';
import { AuthRepository } from './auth.repository';
import { revokeSession, revokeAllUserSessions, storeSession } from './auth.session';

const revokedTokens = new Set<string>();
const revokedRefreshTokens = new Set<string>();

export interface LoginResult {
  code: number;
  token: string;
  refreshToken: string;
  user: CurrentUser;
}

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async loginByDomain(domainName: string, username: string, password: string): Promise<LoginResult> {
    const tenant = await this.repository.findTenantByDomain(domainName);
    if (!tenant) throw new UnauthorizedError('当前域名未绑定租户');
    this.assertTenantAvailable(tenant.tenantId, tenant.status, tenant.expireTime);
    const user = await this.repository.findUserByTenantAndUsername(tenant.tenantId, username);
    if (!user || user.status !== '0') throw new UnauthorizedError('用户名或密码错误');
    const passwordMatched = await verifyPassword(password, user.password);
    if (!passwordMatched) throw new UnauthorizedError('用户名或密码错误');
    const currentUser = await this.buildCurrentUser(user.userId, tenant);
    const payload: JwtPayload = { userId: user.userId, username: user.username, tenantId: user.tenantId };
    const token = signToken(payload);
    const refreshToken = signRefreshToken(payload);
    const accessPayload = verifyToken(token.replace(/^Bearer\s+/i, ''));
    const refreshPayload = verifyRefreshToken(refreshToken);
    await storeSession(accessPayload, refreshPayload.jti);
    return { code: 200, token, refreshToken, user: currentUser };
  }

  async login(tenantId: string, username: string, password: string): Promise<LoginResult> {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) throw new UnauthorizedError('租户不存在');
    this.assertTenantAvailable(tenant.tenantId, tenant.status, tenant.expireTime);

    const user = await this.repository.findUserByTenantAndUsername(tenant.tenantId, username);
    if (!user || user.status !== '0') throw new UnauthorizedError('租户、用户名或密码错误');
    const passwordMatched = await verifyPassword(password, user.password);
    if (!passwordMatched) throw new UnauthorizedError('用户名或密码错误');
    const currentUser = await this.buildCurrentUser(user.userId, tenant);
    const payload: JwtPayload = { userId: user.userId, username: user.username, tenantId: user.tenantId };
    const token = signToken(payload);
    const refreshToken = signRefreshToken(payload);
    const accessPayload = verifyToken(token.replace(/^Bearer\s+/i, ''));
    const refreshPayload = verifyRefreshToken(refreshToken);
    await storeSession(accessPayload, refreshPayload.jti);
    return { code: 200, token, refreshToken, user: currentUser };
  }

  async profile(userId: string, tenantId: string): Promise<CurrentUser> {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) throw new UnauthorizedError('租户不存在');
    this.assertTenantAvailable(tenant.tenantId, tenant.status, tenant.expireTime);
    return this.buildCurrentUser(userId, tenant);
  }

  async logout(token: string, refreshToken?: string): Promise<void> {
    const access = token.replace(/^Bearer\s+/i, '');
    revokedTokens.add(access);
    if (refreshToken) revokedRefreshTokens.add(refreshToken);
    try {
      const accessPayload = verifyToken(access);
      const refreshPayload = refreshToken ? verifyRefreshToken(refreshToken) : undefined;
      await revokeSession(accessPayload.jti, refreshPayload?.jti);
      await revokeAllUserSessions(accessPayload.userId);
    } catch {}
  }

  isTokenRevoked(token: string): boolean {
    return revokedTokens.has(token);
  }

  isRefreshTokenRevoked(token: string): boolean {
    return revokedRefreshTokens.has(token);
  }

  async refresh(refreshToken: string): Promise<{ code: number; token: string; refreshToken: string }> {
    if (this.isRefreshTokenRevoked(refreshToken)) throw new UnauthorizedError('登录已过期，请重新登录');
    const payload = verifyRefreshToken(refreshToken);
    const tenant = await this.repository.findTenantById(payload.tenantId);
    if (!tenant) throw new UnauthorizedError('租户不存在');
    this.assertTenantAvailable(tenant.tenantId, tenant.status, tenant.expireTime);
    const nextPayload: JwtPayload = { userId: payload.userId, username: payload.username, tenantId: payload.tenantId };
    const token = signToken(nextPayload);
    const nextRefreshToken = signRefreshToken(nextPayload);
    const accessPayload = verifyToken(token.replace(/^Bearer\s+/i, ''));
    const refreshPayload = verifyRefreshToken(nextRefreshToken);
    await storeSession(accessPayload, refreshPayload.jti);
    return {
      code: 200,
      token,
      refreshToken: nextRefreshToken,
    };
  }

  async buildCurrentUser(userId: string, tenant: Pick<TenantInfo, 'tenantId' | 'tenantName'>): Promise<CurrentUser> {
    const user = await this.repository.findUserById(userId, tenant.tenantId);
    if (!user || user.status !== '0') throw new UnauthorizedError();

    const [roles, perms, menus] = await Promise.all([
      this.repository.listRoleKeys(userId, user.tenantId),
      this.repository.listPerms(userId, user.tenantId),
      user.isAdmin === '1'
        ? this.repository.listPackageMenus(user.tenantId)
        : this.repository.listMenus(userId, user.tenantId),
    ]);

    return {
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      tenantId: user.tenantId,
      tenantName: tenant.tenantName,
      isAdmin: user.isAdmin,
      roles,
      perms,
      menus: buildMenuTree(menus),
    };
  }

  private assertTenantAvailable(tenantId: string, status: '0' | '1', expireTime: string | null): void {
    if (status !== '0') throw new UnauthorizedError('租户已停用，请联系平台');
    if (tenantId === PLATFORM_TENANT_ID) return;
    if (expireTime && new Date(expireTime).getTime() < Date.now()) {
      throw new UnauthorizedError('租户已到期，请联系平台续费');
    }
  }
}
