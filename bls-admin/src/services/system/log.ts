import { request } from '@umijs/max';

export type LoginLogRecord = {
  logId: string;
  tenantId: string;
  userId?: string | null;
  username?: string | null;
  loginType?: string | null;
  loginStatus: '0' | '1';
  failReason?: string | null;
  loginIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  loginTime?: string;
};

export type OperationLogRecord = {
  logId: string;
  tenantId: string;
  userId?: string | null;
  username?: string | null;
  moduleName?: string | null;
  businessType: string;
  title: string;
  requestMethod?: string | null;
  requestUrl?: string | null;
  requestParams?: string | null;
  responseStatus?: number | null;
  success: '0' | '1';
  errorMessage?: string | null;
  errorStack?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  costTimeMs?: number | null;
  remark?: string | null;
  createTime?: string;
};

export type UploadAuditRecord = {
  auditId: string;
  tenantId: string;
  userId?: string | null;
  username?: string | null;
  moduleName?: string | null;
  accessType: 'public' | 'private';
  storageId?: string | null;
  storageType?: string | null;
  bucketName?: string | null;
  objectName?: string | null;
  originalName: string;
  safeName: string;
  fileExt?: string | null;
  mimeType?: string | null;
  fileSize: number;
  maxUploadBytes?: number | null;
  uploadStatus: '0' | '1';
  failReason?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  fileId?: string | null;
  fileUrl?: string | null;
  createTime?: string;
};

type PageResult<T> = {
  code?: number;
  data?: T[];
  total?: number;
  success?: boolean;
};

async function fetchPage<T>(url: string, params?: Record<string, any>) {
  return request<PageResult<T>>(url, {
    method: 'GET',
    params,
  });
}

export async function listLoginLogs(params?: Record<string, any>) {
  return fetchPage<LoginLogRecord>('/api/system/log/login', params);
}

export async function listOperationLogs(params?: Record<string, any>) {
  return fetchPage<OperationLogRecord>('/api/system/log/operation', params);
}

export async function listUploadAudits(params?: Record<string, any>) {
  return fetchPage<UploadAuditRecord>('/api/system/log/upload', params);
}
