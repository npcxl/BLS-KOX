import { request } from '@umijs/max';
import { useCallback, useMemo, useState } from 'react';

export type UploadResponseShape = {
  code?: number;
  message?: string;
  data?: any;
  [key: string]: any;
};

export type NormalizedUploadResult = {
  raw: UploadResponseShape;
  data: any;
  url?: string;
  fileId?: string;
  bucketName?: string;
  objectName?: string;
};

export type UseFileUploadOptions = {
  uploadUrl?: string;
  defaultData?: Record<string, string>;
  transformResponse?: (res: UploadResponseShape) => NormalizedUploadResult;
  onSuccess?: (result: NormalizedUploadResult) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onFinally?: () => void | Promise<void>;
};

export type UploadFileInput = {
  file: File | Blob;
  filename: string;
  data?: Record<string, string>;
};

function defaultTransformResponse(res: UploadResponseShape): NormalizedUploadResult {
  const data = res?.data ?? res;
  return {
    raw: res,
    data,
    url: data?.url ?? data?.fileUrl ?? data?.file_url ?? res?.url ?? res?.fileUrl,
    fileId: data?.fileId ?? res?.fileId,
    bucketName: data?.bucketName ?? res?.bucketName,
    objectName: data?.objectName ?? res?.objectName,
  };
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const transformResponse = useMemo(
    () => options.transformResponse ?? defaultTransformResponse,
    [options.transformResponse],
  );

  const upload = useCallback(
    async ({ file, filename, data }: UploadFileInput) => {
      const formData = new FormData();
      formData.append('file', file, filename);
      Object.entries({ ...(options.defaultData ?? {}), ...(data ?? {}) }).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, value);
        }
      });

      setUploading(true);
      try {
        const res = await request<UploadResponseShape>(options.uploadUrl ?? '/api/system/storage/upload', {
          method: 'POST',
          data: formData,
        });
        const result = transformResponse(res);
        await options.onSuccess?.(result);
        return result;
      } catch (error) {
        await options.onError?.(error);
        throw error;
      } finally {
        setUploading(false);
        await options.onFinally?.();
      }
    },
    [options.defaultData, options.onError, options.onFinally, options.onSuccess, options.uploadUrl, transformResponse],
  );

  return { uploading, upload };
}
