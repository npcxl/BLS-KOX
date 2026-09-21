/**
 * 系统参数（sys_config）相关接口
 *
 * 批量保存走 `POST /api/system/config/batch`（后端单事务）：
 * 避免逐条 `PUT /edit` + `Promise.all` 造成的「部分成功」——
 * 例如人机验证的 provider 改成了 tianai 但类型没落库，会直接把登录锁死。
 * 后端会在保存前校验 Tianai 服务可用性，不可用则整体拒绝。
 */
import { request } from '@umijs/max';

export interface ConfigBatchItem {
  configKey: string;
  configValue: string;
  configName?: string;
  configType?: string;
  remark?: string;
}

export async function batchUpdateConfigs(items: ConfigBatchItem[], options?: Record<string, any>) {
  return request<API.ResponseResult<{ updated: number }>>('/api/system/config/batch', {
    method: 'POST',
    data: { items },
    ...(options || {}),
  });
}
