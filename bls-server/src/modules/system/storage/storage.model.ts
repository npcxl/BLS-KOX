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

export interface FileUrlResult {
  fileId: string;
  url: string;
}
