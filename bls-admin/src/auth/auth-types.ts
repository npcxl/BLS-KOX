/**
 * 认证模块类型定义
 */

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthState =
  | 'anonymous'
  | 'valid'
  | 'refreshing'
  | 'expired';

export enum AuthFailureReason {
  ACCESS_EXPIRED = 'ACCESS_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  REFRESH_EXPIRED = 'REFRESH_EXPIRED',
  REFRESH_REUSE = 'REFRESH_REUSE',
  USER_DISABLED = 'USER_DISABLED',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
}

/** 请求扩展选项：区分"不弹错误提示"与"不刷新 Token" */
export type AuthRequestOptions = {
  /** 不弹错误提示，但仍允许 Refresh */
  skipErrorMessage?: boolean;
  /** 跳过自动 Refresh（仅 login / refresh / public endpoint 使用） */
  skipAuthRefresh?: boolean;
  /** 标记此请求已 Retry 过一次，禁止再次 Refresh */
  _authRetried?: boolean;
};
