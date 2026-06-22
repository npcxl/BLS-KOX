export type PageConfigCode = 'system_user';

export type TableColumnValueType =
  | 'text'
  | 'textarea'
  | 'digit'
  | 'money'
  | 'date'
  | 'dateTime'
  | 'dateRange'
  | 'dateTimeRange'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'upload';

export interface PageConfig {
  pageId: string;
  pageCode: PageConfigCode | string;
  pageName: string;
  enabled: '0' | '1';
  sort?: number;
  remark?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface PageColumnConfig {
  columnId: string;
  pageCode: string;
  dataIndex: string;
  columnName: string;
  title: string;
  orderNum: number;
  visible: '0' | '1';
  searchable: '0' | '1';
  editable: '0' | '1';
  ellipsis?: '0' | '1';
  hidden?: '0' | '1';
  sorter?: '0' | '1';
  copyable?: '0' | '1';
  valueType?: TableColumnValueType | null;
  valueEnumKey?: string | null;
  width?: number | string | null;
  fixed?: 'left' | 'right' | null;
  formType?: string | null;
  placeholder?: string | null;
  required?: '0' | '1';
}

export const USER_PAGE_CODE = 'system_user';
