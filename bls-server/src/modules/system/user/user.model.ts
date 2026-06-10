export interface UserQuery {
  keyword?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface UserInput {
  userId?: number;
  username: string;
  nickname: string;
  password?: string;
  tenantId?: number;
  realName?: string;
  avatar?: string;
  gender?: '0' | '1' | '2';
  email?: string;
  phone?: string;
  deptId?: number;
  postIds?: number[];
  isAdmin?: '0' | '1';
  status?: '0' | '1';
  remark?: string;
  roleIds?: number[];
}
