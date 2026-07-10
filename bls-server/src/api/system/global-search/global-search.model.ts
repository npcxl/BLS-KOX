export interface GlobalSearchItem {
  id: string;
  title: string;
  subtitle: string | null;
  moduleKey: string;
  moduleName: string;
  routePath: string | null;
}

export interface GlobalSearchGroup {
  moduleKey: string;
  moduleName: string;
  routePath: string | null;
  list: GlobalSearchItem[];
}

export interface GlobalSearchQuery {
  keyword?: string;
}

export interface GlobalSearchResultRow {
  id: string;
  moduleKey: string;
  moduleName: string;
  title: string;
  subtitle: string | null;
  routePath: string | null;
}

export interface SearchConfigQuery {
  keyword?: string;
  moduleKey?: string;
  enabled?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface SearchConfigInput {
  searchId?: string;
  moduleKey: string;
  moduleName: string;
  permission: string;
  routePath?: string | null;
  sourceTable?: string | null;
  bizIdField?: string | null;
  titleField?: string | null;
  subtitleField?: string | null;
  contentFields?: string | null;
  tenantField?: string | null;
  ownerField?: string | null;
  deptField?: string | null;
  createdByField?: string | null;
  statusField?: string | null;
  deletedField?: string | null;
  enabled?: number;
  sort?: number;
  remark?: string | null;
}

export interface SearchConfigRecord {
  searchId: string;
  moduleKey: string;
  moduleName: string;
  permission: string;
  routePath: string | null;
  sourceTable: string | null;
  bizIdField: string | null;
  titleField: string | null;
  subtitleField: string | null;
  contentFields: string | null;
  tenantField: string | null;
  ownerField: string | null;
  deptField: string | null;
  createdByField: string | null;
  statusField: string | null;
  deletedField: string | null;
  enabled: number;
  sort: number;
  remark: string | null;
  createTime?: string | null;
  updateTime?: string | null;
}
