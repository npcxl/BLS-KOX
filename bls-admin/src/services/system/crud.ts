import { request } from '@umijs/max';

export type PageResult<T> = {
  code?: number;
  message?: string;
  data?: T[];
  total?: number;
  success?: boolean;
};

export type CrudResource = {
  basePath: string;
  list?: string | false;
  add?: string | false;
  edit?: string | false;
  remove?: string | false;
  status?: string | false;
};

const buildUrl = (resource: CrudResource, action: keyof CrudResource) => {
  const path = resource[action];
  if (path === false) throw new Error(`${String(action)} endpoint is disabled`);
  return `${resource.basePath}${typeof path === 'string' ? path : `/${action}`}`;
};

export async function listResource<T>(resource: CrudResource, params?: Record<string, any>) {
  return request<PageResult<T>>(buildUrl(resource, 'list'), {
    method: 'GET',
    params,
  });
}

export async function addResource<T>(resource: CrudResource, data: T) {
  return request<API.ResponseResult>(buildUrl(resource, 'add'), {
    method: 'POST',
    data,
  });
}

export async function editResource<T>(resource: CrudResource, data: T) {
  return request<API.ResponseResult>(buildUrl(resource, 'edit'), {
    method: 'PUT',
    data,
  });
}

export async function removeResource(resource: CrudResource, ids: string[]) {
  return request<API.ResponseResult>(buildUrl(resource, 'remove'), {
    method: 'DELETE',
    data: { ids },
    params: { ids: ids.join(',') },
  });
}

export async function changeResourceStatus(resource: CrudResource, data: { [key: string]: any }) {
  return request<API.ResponseResult>(buildUrl(resource, 'status'), {
    method: 'PUT',
    data,
  });
}
