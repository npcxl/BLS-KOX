export interface CurrentUser {
  userId: number;
  username: string;
  nickname: string;
  avatar: string | null;
  tenantId: number;
  isAdmin: '0' | '1';
  roles: string[];
  perms: string[];
  menus: MenuTreeItem[];
}

export interface JwtPayload {
  userId: number;
  username: string;
  tenantId: number;
}

export interface MenuTreeItem {
  menuId: number;
  parentId: number;
  menuName: string;
  path: string | null;
  component: string | null;
  perms: string | null;
  menuType: string;
  sortNum: number;
  children?: MenuTreeItem[];
}
