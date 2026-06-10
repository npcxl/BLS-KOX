export interface MenuInput {
  menuId?: number;
  parentId: number;
  menuName: string;
  path?: string;
  component?: string;
  perms?: string;
  menuType: '0' | '1' | '2';
  sortNum?: number;
  status?: '0' | '1';
}
