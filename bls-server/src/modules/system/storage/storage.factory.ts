import { StorageConfig } from './storage.model';
import { StorageProvider } from './providers/StorageProvider';
import { MinioProvider } from './providers/MinioProvider';
import { AliyunOssProvider } from './providers/AliyunOssProvider';
import { TencentCosProvider } from './providers/TencentCosProvider';
import { AwsS3Provider } from './providers/AwsS3Provider';
import { LocalProvider } from './providers/LocalProvider';

export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.storageType) {
    case 'minio':
      return new MinioProvider(config);
    case 'aliyun_oss':
      return new AliyunOssProvider(config);
    case 'tencent_cos':
      return new TencentCosProvider(config);
    case 'aws_s3':
      return new AwsS3Provider(config);
    case 'local':
      return new LocalProvider(config);
    default:
      return new LocalProvider(config);
  }
}
