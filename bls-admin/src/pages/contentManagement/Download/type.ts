export type DownloadRecord = {
  id: string | number;
  tenantId?: string | number;
  fileName: string;
  fileFormat: string;
  fileSize?: number | string | null;
  fileUrl: string;
  uploadTime?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
