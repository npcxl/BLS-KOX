export interface SysConfig {
  configId: number;
  configKey: string;
  configValue: string;
  configName: string;
  configType: 'sys' | 'theme' | 'dict';
  remark: string | null;
  status: '0' | '1';
  tenantId: number;
  createTime: string;
  updateTime: string | null;
}

export interface ConfigQuery {
  configKey?: string;
  configName?: string;
  configType?: string;
  tenantId?: number | string;
  pageNum?: number | string;
  pageSize?: number | string;
}

export interface CreateConfigInput {
  configKey: string;
  configValue: string;
  configName: string;
  configType: 'sys' | 'theme' | 'dict';
  tenantId?: number;
  remark?: string;
  status?: '0' | '1';
}

export interface UpdateConfigInput extends CreateConfigInput {
  configId: number;
}
