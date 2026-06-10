// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max';

/** 获取当前的用户 GET /api/auth/profile */
export async function currentUser(options?: { [key: string]: any }) {
  return request<{
    code: number;
    message: string;
    data: API.CurrentUser;
  }>('/api/auth/profile', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 退出登录接口 POST /api/login/outLogin */
export async function outLogin(options?: { [key: string]: any }) {
  return request<Record<string, any>>('/api/login/outLogin', {
    method: 'POST',
    ...(options || {}),
  });
}

/** 登录接口 POST /api/auth/login */
export async function login(body: API.LoginParams, options?: { [key: string]: any }) {
  return request<API.LoginResult>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 公开租户列表 GET /api/system/tenant/public-list */
export async function tenantLoginOptions(options?: { [key: string]: any }) {
  return request<API.ResponseResult<API.TenantOption[]>>('/api/system/tenant/public-list', {
    method: 'GET',
    ...(options || {}),
  });
}
