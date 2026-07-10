export interface Tenant {
  tenantId: string;
  tenantName: string;
  packageId: string | null;
  expireTime: string | null;
  domainName: string | null;
  contactUser: string | null;
  contactPhone: string | null;
  status: '0' | '1';
  remark: string | null;
  createTime: string;
  updateTime: string | null;
}

export interface TenantQuery {
  tenantName?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface CreateTenantInput {
  tenantId?: string;
  tenantName: string;
  packageId?: string | null;
  expireTime?: string | null;
  domainName?: string | null;
  contactUser?: string | null;
  contactPhone?: string | null;
  status?: '0' | '1';
  remark?: string | null;
}

export interface UpdateTenantInput extends CreateTenantInput {
  tenantId: string;
}
