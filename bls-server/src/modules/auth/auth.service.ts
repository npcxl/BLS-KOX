import { UnauthorizedError } from '../../core/errors';
import { CurrentUser } from '../../shared/types/current-user';
import { signToken } from '../../shared/utils/jwt';
import { buildMenuTree } from '../../shared/utils/menu-tree';
import { verifyPassword } from '../../shared/utils/password';
import { AuthRepository } from './auth.repository';

export interface LoginResult {
  code: number;
  token: string;
  user: CurrentUser;
}

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async login(tenantId: number, username: string, password: string): Promise<LoginResult> {
    const user = await this.repository.findUserByTenantAndUsername(tenantId, username);
    if (!user || user.status !== '0') throw new UnauthorizedError('租户、用户名或密码错误');
    const passwordMatched = await verifyPassword(password, user.password);
    if (!passwordMatched) throw new UnauthorizedError('用户名或密码错误');
    const currentUser = await this.buildCurrentUser(user.userId);
    return {
      code: 200,
      token: signToken({ userId: user.userId, username: user.username, tenantId: user.tenantId }),
      user: currentUser,
    };
  }

  async profile(userId: number): Promise<CurrentUser> {
    return this.buildCurrentUser(userId);
  }

  async buildCurrentUser(userId: number): Promise<CurrentUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== '0') throw new UnauthorizedError();

    if (user.tenantId === 0) {
      const allMenus = await this.repository.listAllMenus();
      return {
        userId: user.userId,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        tenantId: user.tenantId,
        isAdmin: user.isAdmin,
        roles: ['admin'],
        perms: ['*'],
        menus: buildMenuTree(allMenus),
      };
    }

    const [roles, perms, menus] = await Promise.all([
      this.repository.listRoleKeys(userId),
      this.repository.listPerms(userId),
      this.repository.listMenus(userId),
    ]);

    return {
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      tenantId: user.tenantId,
      isAdmin: user.isAdmin,
      roles,
      perms,
      menus: buildMenuTree(menus),
    };
  }
}
