import { StorageConfig } from '../storage.model';

export interface UploadParams {
  originalName: string;
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
  bucketName: string;
  objectName: string;
  accessType: 'public' | 'private';
}

export interface RemoveParams {
  bucketName: string;
  objectName: string;
}

export interface UrlParams {
  bucketName: string;
  objectName: string;
  expires?: number;
}

export interface UploadResult {
  bucketName: string;
  objectName: string;
  url?: string | null;
}

export interface StorageProvider {
  upload(params: UploadParams): Promise<UploadResult>;
  remove(params: RemoveParams): Promise<void>;
  getPublicUrl(params: UrlParams): string;
  getPrivateUrl(params: UrlParams): Promise<string>;
  ensureBucket?(bucketName: string): Promise<void>;
}

export type StorageProviderFactory = (config: StorageConfig) => StorageProvider;
