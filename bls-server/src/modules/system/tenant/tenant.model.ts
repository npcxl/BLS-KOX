export interface Tenant {
  tenantId: number;
  tenantName: string;
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
  tenantName: string;
  contactUser?: string;
  contactPhone?: string;
  status?: '0' | '1';
  remark?: string;
}

export interface UpdateTenantInput extends CreateTenantInput {
  tenantId: number;
}
