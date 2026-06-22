import { request } from '@umijs/max';

export interface GlobalSearchItem {
  id: string;
  title: string;
  subtitle: string | null;
  moduleKey: string;
  moduleName: string;
  routePath: string | null;
}

export interface GlobalSearchGroup {
  moduleKey: string;
  moduleName: string;
  routePath: string | null;
  list: GlobalSearchItem[];
}

export async function globalSearch(keyword: string, options?: { [key: string]: any }) {
  return request<API.ResponseResult<GlobalSearchGroup[]>>('/api/global-search', {
    method: 'GET',
    params: { keyword },
    ...(options || {}),
  });
}
