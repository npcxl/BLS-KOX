import { StorageConfig } from '../storage.model';
import { RemoveParams, StorageProvider, UploadParams, UploadResult, UrlParams } from './StorageProvider';

export class TencentCosProvider implements StorageProvider {
  constructor(private readonly config: StorageConfig) {}

  async upload(params: UploadParams): Promise<UploadResult> {
    return { bucketName: params.bucketName, objectName: params.objectName };
  }

  async remove(_params: RemoveParams): Promise<void> {
    return;
  }

  getPublicUrl(params: UrlParams): string {
    const base = this.config.publicBaseUrl?.replace(/\/$/, '');
    return base ? `${base}/${params.objectName}` : `${this.config.endpoint}/${params.bucketName}/${params.objectName}`;
  }

  async getPrivateUrl(params: UrlParams): Promise<string> {
    return this.getPublicUrl(params);
  }
}
