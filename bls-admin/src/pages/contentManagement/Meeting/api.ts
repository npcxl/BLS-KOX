import { request } from '@umijs/max';
import type { PageResult } from '@/services/system/crud';
import type { MeetingRecord } from './type';

export async function listMeetings(params: { pageNum: number; pageSize: number; keyword?: string }) {
  return request<PageResult<MeetingRecord>>('/api/content-management/meeting/list', {
    method: 'GET',
    params,
  });
}

export async function createMeeting(data: MeetingRecord) {
  return request<{ id: string }>('/api/content-management/meeting/add', {
    method: 'POST',
    data,
  });
}

export async function deleteMeeting(id: string) {
  return request<void>('/api/content-management/meeting/remove', {
    method: 'DELETE',
    params: { ids: id },
  });
}

export async function updateMeeting(data: MeetingRecord & { id: string }) {
  return request<void>('/api/content-management/meeting/edit', {
    method: 'PUT',
    data,
  });
}

export async function getMeeting(id: string) {
  return request<MeetingRecord>(`/api/content-management/meeting/${id}`, {
    method: 'GET',
  });
}
