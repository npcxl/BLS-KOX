export interface DictType {
  dictTypeId: string;
  dictName: string;
  dictType: string;
  status: '0' | '1';
  remark: string | null;
  tenantId: string;
  createTime: string;
  updateTime: string | null;
}

export interface DictData {
  dictDataId: string;
  dictTypeId: string;
  dictLabel: string;
  dictValue: string;
  dictSort: number;
  status: '0' | '1';
  remark: string | null;
  tenantId: string;
  createTime: string;
  updateTime: string | null;
}

export interface DictTypeQuery {
  dictName?: string;
  dictType?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface DictDataQuery {
  dictTypeId?: string;
  dictType?: string;
  dictLabel?: string;
  status?: string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface DictTypeInput {
  dictTypeId?: string;
  dictName: string;
  dictType: string;
  status?: '0' | '1';
  remark?: string | null;
}

export interface DictDataInput {
  dictDataId?: string;
  dictTypeId: string;
  dictLabel: string;
  dictValue: string;
  dictSort?: number;
  status?: '0' | '1';
  remark?: string | null;
}
