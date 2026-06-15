export type UiFieldType =
  | 'text'
  | 'password'
  | 'select'
  | 'digit'
  | 'textarea'
  | 'dateTime'
  | 'treeSelect'
  | 'upload';

export interface UiFieldMeta {
  fieldKey: string;
  fieldLabel: string;
  fieldScope: '0' | '1' | '2';
  fieldType: UiFieldType;
  valueEnumKey?: string | null;
  isSearch: boolean;
  isRequired: boolean;
  isCopyable: boolean;
  isEllipsis: boolean;
  isFormVisible: boolean;
  isTableVisible: boolean;
  width?: number | null;
  sortNum: number;
  defaultValue?: string | null;
  placeholder?: string | null;
  propsJson?: Record<string, unknown> | null;
  renderCode?: string | null;
  beforeSubmitCode?: string | null;
}

export interface PageConfigMeta {
  pageCode: string;
  pageName: string;
  title: string;
  resourcePath: string;
  rowKey: string;
  statusKey?: string;
  isTree: boolean;
  parentKey?: string | null;
  status: '0' | '1';
  remark?: string | null;
  fields: UiFieldMeta[];
}
