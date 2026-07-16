export namespace API {
  /** POST /api/auth/login */
  export type POST_API_LOGIN_ACCOUNT_PAYLOAD = {
    username: string;
    password: string;
    autoLogin?: boolean;
    tenantId?: string;
  };

  export type POST_API_LOGIN_ACCOUNT_RES = {
    token?: string;
    refreshToken?: string;
    user?: Record<string, any>;
  };

  /** GET /api/auth/profile */
  export type GET_API_CURRENT_USER_RES = {
    data: {
      userId: string;
      username: string;
      nickname: string;
      avatar?: string;
      tenantId: string;
      isAdmin: '0' | '1';
      roles: string[];
      perms: string[];
      menus: any[];
    };
  };

  /** Page params */
  export type PageParams = {
    current?: number;
    pageSize?: number;
  };

  /** Generic list result */
  export type ListResult<T = any> = {
    data: T[];
    total: number;
  };

  /** Generic API response */
  export type ResponseResult<T = any> = {
    code: number;
    message?: string;
    data?: T;
  };
}
