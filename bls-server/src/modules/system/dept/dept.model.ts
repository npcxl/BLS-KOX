export interface Dept {
  deptId: string;
  tenantId: string;
  parentId: string;
  deptName: string;
  sortNum: number;
  status: '0' | '1';
  createTime: string;
  updateTime: string | null;
  children?: Dept[];
}

export interface DeptQuery {
  deptName?: string;
  status?: string;
}

export interface DeptInput {
  deptId?: string;
  parentId?: string;
  deptName: string;
  sortNum?: number;
  status?: '0' | '1';
}
