import { request } from '@umijs/max';
import type { PageResult } from '@/services/system/crud';
import type { DownloadRecord } from './type';

export async function listDownloads(params: { pageNum: number; pageSize: number; keyword?: string }) {
  return request<PageResult<DownloadRecord>>('/api/content-management/download/list', {
    method: 'GET',
    params,
  });
}

export async function createDownload(data: DownloadRecord) {
  return request<{ id: string }>('/api/content-management/download/add', {
    method: 'POST',
    data,
  });
}

export async function updateDownload(data: DownloadRecord & { id: string }) {
  return request<void>('/api/content-management/download/edit', {
    method: 'PUT',
    data,
  });
}

export async function deleteDownload(id: string) {
  return request<void>('/api/content-management/download/remove', {
    method: 'DELETE',
    params: { ids: id },
  });
}

export async function getDownload(id: string) {
  return request<DownloadRecord>(`/api/content-management/download/${id}`, {
    method: 'GET',
  });
}
