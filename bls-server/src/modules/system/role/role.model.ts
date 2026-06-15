export interface RoleQuery {
  keyword?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface RoleInput {
  roleId?: string;
  roleName: string;
  roleKey: string;
  sortNum?: number;
  status?: '0' | '1';
  remark?: string | null;
  menuIds?: string[] | null;
}
