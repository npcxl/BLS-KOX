export interface PackageRecord {
  packageId: string;
  packageName: string;
  status: '0' | '1';
  remark: string | null;
  createTime: string;
  updateTime: string | null;
}

export interface PackageQuery {
  packageName?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface PackageInput {
  packageId?: string;
  packageName: string;
  status?: '0' | '1';
  remark?: string | null;
  menuIds?: string[] | null;
}
