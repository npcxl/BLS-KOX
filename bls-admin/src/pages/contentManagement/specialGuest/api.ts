import { request } from '@umijs/max';
import type { PageResult } from '@/services/system/crud';
import type { SpecialGuestRecord } from './type';

export async function listSpecialGuest(params: { pageNum: number; pageSize: number; keyword?: string }) {
  return request<PageResult<SpecialGuestRecord>>('/api/content-management/special-guest/list', {
    method: 'GET',
    params,
  });
}

export async function createSpecialGuest(data: SpecialGuestRecord) {
  return request<{ id: string }>('/api/content-management/special-guest/add', {
    method: 'POST',
    data,
  });
}

export async function updateSpecialGuest(data: SpecialGuestRecord & { id: string }) {
  return request<void>('/api/content-management/special-guest/edit', {
    method: 'PUT',
    data,
  });
}

export async function deleteSpecialGuest(id: string) {
  return request<void>('/api/content-management/special-guest/remove', {
    method: 'DELETE',
    params: { ids: id },
  });
}

export async function getSpecialGuest(id: string) {
  return request<SpecialGuestRecord>(`/api/content-management/special-guest/${id}`, {
    method: 'GET',
  });
}
