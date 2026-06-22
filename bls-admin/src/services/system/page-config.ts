import { request } from '@umijs/max';

export type PageConfigRecord = {
  pageId: string;
  pageCode: string;
  pageName: string;
  enabled: '0' | '1';
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
  visible: '0' | '1';
  searchable: '0' | '1';
  editable: '0' | '1';
  ellipsis?: '0' | '1';
  formType?: string | null;
  valueEnumCode?: string | null;
  placeholder?: string | null;
  required?: '0' | '1';
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

export async function savePageConfig(payload: { page: PageConfigRecord; columns: PageColumnConfigRecord[] }) {
  return request<{ data?: null }>(`/api/system/page-config/save`, {
    method: 'POST',
    data: payload,
  });
}
