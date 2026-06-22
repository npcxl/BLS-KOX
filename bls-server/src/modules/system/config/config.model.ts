export interface SysConfig {
  configId: string;
  configKey: string;
  configValue: string;
  configName: string;
  configType: 'sys' | 'theme' | 'dict';
  remark: string | null;
  status: '0' | '1';
  tenantId: string;
  createTime: string;
  updateTime: string | null;
}

export interface ConfigQuery {
  configKey?: string;
  configName?: string;
  configType?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface CreateConfigInput {
  configId?: string;
  configKey: string;
  configValue: string;
  configName: string;
  configType: 'sys' | 'theme' | 'dict';
  remark?: string | null;
  status?: '0' | '1';
  tenantId?: string;
}

export interface UpdateConfigInput extends CreateConfigInput {
  configId: string;
}

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
  | 'textarea'
  | 'upload';

export interface TableColumnQueryDto {
  tableCode?: string;
  tableName?: string;
  columnKey?: string;
  title?: string;
  dataIndex?: string;
  search?: boolean;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface TableColumnConfigDto {
  configId?: string;
  tableCode: string;
  tableName: string;
  columnKey: string;
  title: string;
  dataIndex: string;
  search?: boolean;
  ellipsis?: boolean;
  hidden?: boolean;
  sorter?: boolean;
  copyable?: boolean;
  valueType?: TableColumnValueType;
  valueEnumKey?: string | null;
  width?: number | string | null;
  fixed?: 'left' | 'right';
  orderNo?: number | string | null;
  remark?: string | null;
  status?: '0' | '1';
  tenantId?: string;
  createTime?: string;
  updateTime?: string | null;
}

export interface CreateTableColumnConfigInput {
  configId?: string;
  tableCode: string;
  tableName: string;
  columnKey: string;
  title: string;
  dataIndex: string;
  search?: boolean;
  ellipsis?: boolean;
  hidden?: boolean;
  sorter?: boolean;
  copyable?: boolean;
  valueType?: TableColumnValueType;
  valueEnumKey?: string | null;
  width?: number | string | null;
  fixed?: 'left' | 'right';
  orderNo?: number | string | null;
  remark?: string | null;
  status?: '0' | '1';
  tenantId?: string;
}

export interface UpdateTableColumnConfigInput extends CreateTableColumnConfigInput {
  configId: string;
}
