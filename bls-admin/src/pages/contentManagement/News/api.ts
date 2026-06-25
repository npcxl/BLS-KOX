import { request } from '@umijs/max';
import type { NewsRecord } from './type';
import type { PageResult } from '@/services/system/crud';

export async function listNews(params: { pageNum: number; pageSize: number; keyword?: string }) {
  return request<PageResult<NewsRecord>>('/api/content-management/news/list', {
    method: 'GET',
    params,
  });
}

export async function createNews(data: NewsRecord) {
  return request<{ id: string }>('/api/content-management/news/add', {
    method: 'POST',
    data,
  });
}

export async function deleteNews(id: string) {
  return request<void>('/api/content-management/news/remove', {
    method: 'DELETE',
    params: { ids: id },
  });
}

export async function updateNews(data: NewsRecord & { id: string }) {
  return request<void>('/api/content-management/news/edit', {
    method: 'PUT',
    data,
  });
}

export async function getNews(id: string) {
  return request<NewsRecord>(`/api/content-management/news/${id}`, {
    method: 'GET',
  });
}