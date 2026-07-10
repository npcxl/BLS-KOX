import { request } from '@umijs/max';

export type PageConfigRecord = {
  pageConfigId: string;
  pageCode: string;
  pageName: string;
  enabled: boolean;
  sort?: number;
  remark?: string | null;
  createTime?: string;
  updateTime?: string;
};

export type PageColumnConfigRecord = {
  columnId: string;
  pageCode: string;
  dataIndex: string;
  title: string;
  orderNum: number;
  visible: boolean;
  searchable: boolean;
  editable: boolean;
  copyable: boolean;
  ellipsis: boolean;
  valueType?: string | null;
  valueEnumCode?: string | null;
  placeholder?: string | null;
  required: boolean;
};

export async function listPageConfigs() {
  return request<{ data?: PageConfigRecord[] }>(`/api/system/page-config/list`, {
    method: 'GET',
  });
}

export async function getPageConfig(pageCode: string) {
  return request<{ data?: PageConfigRecord | null }>(`/api/system/page-config/page/${pageCode}`, {
    method: 'GET',
  });
}

export async function getPageColumnConfig(pageCode: string) {
  return request<{ data?: PageColumnConfigRecord[] }>(`/api/system/page-config/page/${pageCode}/columns`, {
    method: 'GET',
  });
}

export async function savePageConfig(payload: { page: Partial<PageConfigRecord>; columns: PageColumnConfigRecord[] }) {
  return request<{ data?: null }>(`/api/system/page-config/save`, {
    method: 'POST',
    data: payload,
  });
}

export async function deletePageConfig(pageCode: string) {
  return request<{ data?: null }>(`/api/system/page-config/page/${pageCode}`, {
    method: 'DELETE',
  });
}
