export interface PageConfig {
  pageConfigId: string;
  pageCode: string;
  pageName: string;
  enabled: boolean;
  sort: number;
  tenantId: string;
  remark?: string;
  deleted: number;
  createTime: string;
  updateTime: string;
}

export interface PageColumnConfig {
  columnId: string;
  pageCode: string;
  dataIndex: string;
  title: string;
  orderNum: number;
  visible: boolean;
  searchable: boolean;
  editable: boolean;
  copyable: boolean;
  ellipsis: boolean;
  valueType?: string;
  valueEnumCode?: string;
  placeholder?: string;
  required: boolean;
  tenantId: string;
  deleted: number;
  createTime: string;
  updateTime: string;
}

export interface PageConfigInput {
  pageCode: string;
  pageName: string;
  enabled?: boolean;
  sort?: number;
  remark?: string;
}

export interface PageColumnInput {
  columnId?: string;
  pageCode: string;
  dataIndex: string;
  title: string;
  orderNum: number;
  visible?: boolean;
  searchable?: boolean;
  editable?: boolean;
  copyable?: boolean;
  ellipsis?: boolean;
  valueType?: string;
  valueEnumCode?: string;
  placeholder?: string;
  required?: boolean;
}

export interface SavePageConfigInput {
  page: PageConfigInput;
  columns: PageColumnInput[];
}
