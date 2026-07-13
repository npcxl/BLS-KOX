export interface RoleQuery {
  keyword?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
  tenantId?: string | null;
  userId?: string | null;
  username?: string | null;
  roleName?: string | null;
}

export interface RoleInput {
  roleId?: string;
  roleName: string;
  roleKey: string;
  sortNum?: number;
  status?: '0' | '1';
  remark?: string | null;
  menuIds?: string[] | null;
  /** P9 Data Scope: ALL/TENANT/DEPT/DEPT_AND_CHILDREN/SELF/CUSTOM */
  dataScope?: string;
}
