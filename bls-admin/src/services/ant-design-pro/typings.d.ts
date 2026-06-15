// @ts-ignore
/* eslint-disable */

declare namespace API {
  type ResponseResult<T = unknown> = {
    code?: number;
    message?: string;
    data?: T;
  };

  type MenuTreeItem = {
    menuId: string;
    parentId: string;
    menuName: string;
    icon?: string | null;
    path?: string | null;
    component?: string | null;
    perms?: string | null;
    menuType: '0' | '1' | '2' | string;
    sortNum?: number | string;
    children?: MenuTreeItem[];
  };

  type CurrentUser = {
    userId: string;
    username: string;
    nickname: string;
    avatar?: string | null;
    tenantId: string;
    isAdmin: '0' | '1';
    roles: string[];
    perms: string[];
    menus: MenuTreeItem[];
    name?: string;
    userid?: string;
    access?: string;
  };

  type LoginResult = {
    code?: number;
    message?: string;
    token?: string;
    refreshToken?: string;
    user?: CurrentUser;
    status?: string;
    type?: string;
    currentAuthority?: string;
  };

  type PageParams = {
    current?: number;
    pageSize?: number;
  };

  type RuleListItem = {
    key?: number;
    disabled?: boolean;
    href?: string;
    avatar?: string;
    name?: string;
    owner?: string;
    desc?: string;
    callNo?: number;
    status?: number;
    updatedAt?: string;
    createdAt?: string;
    progress?: number;
  };

  type RuleList = {
    data?: RuleListItem[];
    /** 列表的内容总数 */
    total?: number;
    success?: boolean;
  };

  type FakeCaptcha = {
    code?: number;
    status?: string;
  };

  type LoginParams = {
    username?: string;
    password?: string;
    autoLogin?: boolean;
    type?: string;
    tenantId?: string;
  };

  type TenantOption = {
    tenantId: string;
    tenantName: string;
  };

  type SysConfig = {
    configId?: string;
    themeId?: string;
    tenantId?: string;
    configKey?: string;
    configValue?: string;
    configName?: string;
    configType?: 'sys' | 'theme' | 'dict';
    status?: '0' | '1';
    remark?: string;
    navTheme?: 'light' | 'realDark';
    colorPrimary?: string;
    layout?: 'mix' | 'top' | 'side';
    contentWidth?: 'Fluid' | 'Fixed';
    fixedHeader?: number | boolean;
    fixSiderbar?: number | boolean;
    colorWeak?: number | boolean;
    title?: string;
    logo?: string | null;
    iconfontUrl?: string | null;
  };

  type ErrorResponse = {
    /** 业务约定的错误码 */
    errorCode: string;
    /** 业务上的错误信息 */
    errorMessage?: string;
    /** 业务上的请求是否成功 */
    success?: boolean;
  };

  type NoticeIconList = {
    data?: NoticeIconItem[];
    /** 列表的内容总数 */
    total?: number;
    success?: boolean;
  };

  type NoticeIconItemType = 'notification' | 'message' | 'event';

  type NoticeIconItem = {
    id?: string;
    extra?: string;
    key?: string;
    read?: boolean;
    avatar?: string;
    title?: string;
    status?: string;
    datetime?: string;
    description?: string;
    type?: NoticeIconItemType;
  };
}
