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
