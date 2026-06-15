export interface MenuInput {
  menuId?: string;
  parentId: string;
  menuName: string;
  icon?: string | null;
  path?: string | null;
  component?: string | null;
  perms?: string | null;
  menuType: '0' | '1' | '2';
  sortNum?: number;
  status?: '0' | '1';
}
