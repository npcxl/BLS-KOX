import { Client } from "minio";
import { StorageConfig } from "../storage.model";
import {
  RemoveParams,
  StorageProvider,
  UploadParams,
  UploadResult,
  UrlParams,
} from "./StorageProvider";

function getMinioClient(config: StorageConfig): Client {
  return new Client({
    endPoint: config.endpoint ?? "",
    port: config.port ?? (config.useSsl === "1" ? 443 : 80),
    useSSL: config.useSsl === "1",
    accessKey: config.accessKey ?? undefined,
    secretKey: config.secretKey ?? undefined,
    pathStyle: config.pathStyle === "1",
  });
}

export class MinioProvider implements StorageProvider {
  private readonly client: Client;

  constructor(private readonly config: StorageConfig) {
    this.client = getMinioClient(config);
  }

  async ensureBucket(bucketName: string): Promise<void> {
    const exists = await this.client.bucketExists(bucketName);
    if (!exists) {
      await this.client.makeBucket(bucketName, this.config.region ?? undefined);
    }
  }

  async upload(params: UploadParams): Promise<UploadResult> {
    await this.ensureBucket(params.bucketName);
    await this.client.putObject(
      params.bucketName,
      params.objectName,
      params.buffer,
      params.buffer.length,
      {
        "Content-Type": params.mimeType ?? "application/octet-stream",
      },
    );
    return { bucketName: params.bucketName, objectName: params.objectName };
  }

  async remove(params: RemoveParams): Promise<void> {
    await this.client.removeObject(params.bucketName, params.objectName);
  }

  getPublicUrl(params: UrlParams): string {
    const base = this.config.publicBaseUrl?.replace(/\/$/, "");
    if (base) return `${base}/${params.objectName}`;
    const protocol = this.config.useSsl === "1" ? "https" : "http";
    return `${protocol}://${this.config.endpoint}/${params.bucketName}/${params.objectName}`;
  }

  async getPrivateUrl(params: UrlParams): Promise<string> {
    return this.client.presignedGetObject(
      params.bucketName,
      params.objectName,
      params.expires ?? 300,
    );
  }
}
