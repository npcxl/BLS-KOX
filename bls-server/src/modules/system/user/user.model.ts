export interface UserQuery {
  keyword?: string;
  username?: string;
  nickname?: string;
  realName?: string;
  phone?: string;
  email?: string;
  deptId?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface UserInput {
  userId?: string;
  username: string;
  nickname: string;
  password?: string | null;
  realName?: string | null;
  avatar?: string | null;
  gender?: '0' | '1' | '2';
  email?: string | null;
  phone?: string | null;
  deptId?: string | null;
  postIds?: string[];
  isAdmin?: '0' | '1';
  status?: '0' | '1';
  remark?: string | null;
  roleIds?: string[] | null;
}
