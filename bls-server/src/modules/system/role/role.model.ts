export interface RoleQuery {
  keyword?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface RoleInput {
  roleId?: number;
  roleName: string;
  roleKey: string;
  sortNum?: number;
  status?: '0' | '1';
  remark?: string;
  menuIds?: number[];
}
