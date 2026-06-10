export interface Dept {
  deptId: number;
  tenantId: number;
  parentId: number;
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
  deptId?: number;
  tenantId?: number;
  parentId?: number;
  deptName: string;
  sortNum?: number;
  status?: '0' | '1';
}
