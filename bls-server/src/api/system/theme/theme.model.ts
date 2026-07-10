export interface ThemeConfig {
  themeId: string;
  tenantId: string;
  navTheme: 'light' | 'dark' | 'realDark';
  colorPrimary: string;
  layout: 'side' | 'top' | 'mix';
  contentWidth: 'Fluid' | 'Fixed';
  fixedHeader: 0 | 1;
  fixSiderbar: 0 | 1;
  colorWeak: 0 | 1;
  title: string;
  logo: string | null;
  iconfontUrl: string | null;
  tokenJson: string | null;
  status: '0' | '1';
  remark: string | null;
  createTime: string;
  updateTime: string | null;
}

export interface ThemeQuery {
  title?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface ThemeInput {
  themeId?: string;
  navTheme?: 'light' | 'dark' | 'realDark';
  colorPrimary?: string;
  layout?: 'side' | 'top' | 'mix';
  contentWidth?: 'Fluid' | 'Fixed';
  fixedHeader?: 0 | 1;
  fixSiderbar?: 0 | 1;
  colorWeak?: 0 | 1;
  title: string;
  logo?: string | null;
  iconfontUrl?: string | null;
  tokenJson?: string | null;
  status?: '0' | '1';
  remark?: string | null;
  tenantId?: string;
}
