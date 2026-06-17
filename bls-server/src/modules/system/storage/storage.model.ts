export type StorageType =
  | 'minio'
  | 'aliyun_oss'
  | 'tencent_cos'
  | 'qiniu_kodo'
  | 'huawei_obs'
  | 'aws_s3'
  | 'local';

export interface StorageConfig {
  storageId: string;
  tenantId: string;
  storageName: string;
  storageType: StorageType;
  endpoint: string | null;
  region: string | null;
  port: number | null;
  useSsl: '0' | '1';
  accessKey: string | null;
  secretKey: string | null;
  publicBucket: string | null;
  privateBucket: string | null;
  publicBaseUrl: string | null;
  privateBaseUrl: string | null;
  pathStyle: '0' | '1';
  configJson: string | null;
  policyJson: string | null;
  isDefault: '0' | '1';
  status: '0' | '1';
  remark: string | null;
  createBy: string | null;
  createTime: string;
  updateBy: string | null;
  updateTime: string | null;
}

export interface StorageQuery {
  storageName?: string;
  storageType?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface CreateStorageInput {
  storageId?: string;
  tenantId?: string;
  storageName: string;
  storageType: StorageType;
  endpoint?: string | null;
  region?: string | null;
  port?: number | null;
  useSsl?: '0' | '1';
  accessKey?: string | null;
  secretKey?: string | null;
  publicBucket?: string | null;
  privateBucket?: string | null;
  publicBaseUrl?: string | null;
  privateBaseUrl?: string | null;
  pathStyle?: '0' | '1';
  configJson?: string | null;
  policyJson?: string | null;
  isDefault?: '0' | '1';
  status?: '0' | '1';
  remark?: string | null;
}

export interface UpdateStorageInput extends CreateStorageInput {
  storageId: string;
}

export interface FileRecord {
  fileId: string;
  tenantId: string;
  storageId: string;
  bucketName: string;
  objectName: string;
  originalName: string;
  fileName: string;
  fileExt: string | null;
  mimeType: string | null;
  fileSize: number;
  accessType: 'public' | 'private';
  moduleName: string | null;
  url: string | null;
  createBy: string | null;
  createTime: string;
  updateBy: string | null;
  updateTime: string | null;
}

export interface UploadFileInput {
  originalName: string;
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
  accessType: 'public' | 'private';
  moduleName?: string | null;
  storageId?: string;
}

export interface UploadRequestBody {
  accessType?: 'public' | 'private';
  moduleName?: string;
  storageId?: string;
}

export interface UploadAuditInput {
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
  maxUploadBytes: number;
  uploadStatus: '0' | '1';
  failReason?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  fileId?: string | null;
  fileUrl?: string | null;
}

export interface OperationLogInput {
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
}

export interface FileUrlResult {
  fileId: string;
  url: string;
}
