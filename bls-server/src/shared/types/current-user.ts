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
  realName?: string | null;
  avatar: string | null;
  gender?: '0' | '1' | '2' | null;
  email?: string | null;
  phone?: string | null;
  deptId?: string | null;
  deptName?: string | null;
  status?: '0' | '1' | null;
  remark?: string | null;
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
