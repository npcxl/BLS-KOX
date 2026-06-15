export interface TenantInfo {
  tenantId: string;
  tenantName: string;
  packageId: string | null;
  expireTime: string | null;
  domainName: string | null;
  status: '0' | '1';
}

export interface CurrentUser {
  userId: string;
  username: string;
  nickname: string;
  avatar: string | null;
  tenantId: string;
  tenantName?: string;
  isAdmin: '0' | '1';
  roles: string[];
  perms: string[];
  menus: MenuTreeItem[];
}

export interface JwtPayload {
  userId: string;
  username: string;
  tenantId: string;
}

export interface MenuTreeItem {
  menuId: string;
  parentId: string;
  menuName: string;
  icon: string | null;
  path: string | null;
  component: string | null;
  perms: string | null;
  menuType: string;
  sortNum: number | string;
  children?: MenuTreeItem[];
}
