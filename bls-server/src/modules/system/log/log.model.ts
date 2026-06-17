export interface LoginLogQuery {
  username?: string;
  tenantId?: string;
  loginStatus?: string;
  loginType?: string;
  loginIp?: string;
  startTime?: string;
  endTime?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface OperationLogQuery {
  username?: string;
  tenantId?: string;
  moduleName?: string;
  businessType?: string;
  success?: string;
  clientIp?: string;
  requestId?: string;
  startTime?: string;
  endTime?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface UploadAuditQuery {
  username?: string;
  tenantId?: string;
  moduleName?: string;
  accessType?: string;
  uploadStatus?: string;
  fileName?: string;
  clientIp?: string;
  requestId?: string;
  startTime?: string;
  endTime?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}
