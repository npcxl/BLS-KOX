// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max';
import md5 from 'md5';
import { tokenStore } from '@/auth/token-store';

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

/** 退出登录接口 POST /api/auth/logout */
export async function outLogin(options?: { [key: string]: any }) {
  return request<Record<string, any>>('/api/auth/logout', {
    method: 'POST',
    data: {
      refreshToken: tokenStore.getRefreshToken() || undefined,
    },
    skipAuthRefresh: true,
    skipErrorMessage: true,
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
    data: {
      ...body,
      password: body.password ? md5(body.password) : body.password,
    },
    ...(options || {}),
  });
}

/** 刷新令牌 POST /api/auth/refresh */
export async function refreshToken(body: { refreshToken: string }, options?: { [key: string]: any }) {
  return request<Pick<API.LoginResult, 'token' | 'refreshToken'>>('/api/auth/refresh', {
    method: 'POST',
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

/** 仪表盘统计 GET /api/system/dashboard/stats */
export async function getDashboardStats(options?: { [key: string]: any }) {
  return request<API.ResponseResult<{
    userCount: number;
    roleCount: number;
    menuCount: number;
    logCount: number;
  }>>('/api/system/dashboard/stats', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 系统状态 GET /api/system/dashboard/system-status */
export async function getSystemStatus(options?: { [key: string]: any }) {
  return request<API.ResponseResult<{
    cpuLoad: number;
    memUsage: number;
    uptime: number;
    nodeUptime: number;
  }>>('/api/system/dashboard/system-status', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 最近操作日志 GET /api/system/dashboard/recent-logs */
export async function getRecentLogs(options?: { [key: string]: any }) {
  return request<API.ResponseResult<Array<{
    title: string;
    username: string;
    businessType: string;
    createTime: string;
  }>>('/api/system/dashboard/recent-logs', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 公开主题配置 GET /api/system/config/public-theme */
export async function publicThemeConfig(options?: { [key: string]: any }) {
  return request<API.ResponseResult<API.SysConfig>>('/api/system/config/public-theme', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 公开系统配置 GET /api/system/config/public-system */
export async function publicSystemConfig(options?: { [key: string]: any }) {
  return request<API.ResponseResult<API.SysConfig[]>>('/api/system/config/public-system', {
    method: 'GET',
    ...(options || {}),
  });
}

let themeCurrentPromise: Promise<API.ResponseResult<API.SysConfig>> | undefined;
let systemCurrentPromise: Promise<API.ResponseResult<API.SysConfig[]>> | undefined;

/** 获取当前租户主题配置(鉴权) GET /api/system/theme/current */
export async function themeCurrent(options?: { [key: string]: any }) {
  if (!themeCurrentPromise) {
    themeCurrentPromise = request<API.ResponseResult<API.SysConfig>>('/api/system/theme/current', {
      method: 'GET',
      ...(options || {}),
    }).finally(() => {
      themeCurrentPromise = undefined;
    });
  }
  return themeCurrentPromise;
}

/** 获取当前租户系统配置(鉴权) GET /api/system/config/current */
export async function systemCurrent(options?: { [key: string]: any }) {
  if (!systemCurrentPromise) {
    systemCurrentPromise = request<API.ResponseResult<API.SysConfig[]>>('/api/system/config/current', {
      method: 'GET',
      ...(options || {}),
    }).finally(() => {
      systemCurrentPromise = undefined;
    });
  }
  return systemCurrentPromise;
}

/** 获取租户私有主题配置list GET /api/system/theme/list */
export async function themeList(options?: { [key: string]: any }) {
  return request<API.ResponseResult<API.SysConfig[]>>('/api/system/theme/list', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 新增租户主题配置 POST /api/system/theme/add */
export async function addTheme(
  body: API.SysConfig,
  options?: { [key: string]: any },
) {
  return request<API.ResponseResult<{ themeId: string }>>('/api/system/theme/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** 更新租户主题配置 PUT /api/system/theme/edit */
export async function updateTheme(
  body: API.SysConfig & { themeId: string },
  options?: { [key: string]: any },
) {
  return request<API.ResponseResult<null>>('/api/system/theme/edit', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
