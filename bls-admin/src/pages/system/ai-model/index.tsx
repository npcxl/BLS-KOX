import type { ProFormColumnsType } from '@ant-design/pro-components';
import CrudTablePage from '@/components/CrudTablePage';
import { usePermission } from '@/hooks/usePermission';
import { Tag } from 'antd';
import { CloudOutlined, DesktopOutlined } from '@ant-design/icons';

export interface AiModelRecord {
  configId: string;
  tenantId: string;
  modelName: string;
  modelType: 'api' | 'local';
  provider: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  isDefault: '0' | '1';
  status: '0' | '1';
  sortNum: number;
  remark?: string;
}

const modelTypeEnum = { api: 'API 模型', local: '本地模型' };
const providerEnum: Record<string, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  custom: '自定义API',
  ollama: 'Ollama',
};
const statusEnum = { '0': '启用', '1': '停用' };
const isDefaultEnum = { '0': '否', '1': '是' };

export default function AiModelConfigPage() {
  const { can } = usePermission();

  const formColumns: ProFormColumnsType<AiModelRecord>[] = [
    {
      title: '模型名称',
      dataIndex: 'modelName',
      formItemProps: { rules: [{ required: true, message: '请输入模型显示名称' }] },
      fieldProps: { placeholder: '如: Qwen Coder 7B' },
    },
    {
      title: '模型类型',
      dataIndex: 'modelType',
      valueType: 'select',
      initialValue: 'local',
      valueEnum: modelTypeEnum,
      formItemProps: { rules: [{ required: true }] },
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      valueType: 'select',
      initialValue: 'ollama',
      valueEnum: providerEnum,
      formItemProps: { rules: [{ required: true }] },
    },
    {
      title: '模型标识',
      dataIndex: 'modelId',
      tooltip: 'API 模型填 deepseek-chat 等，本地模型填 qwen2.5:7b 等',
      formItemProps: { rules: [{ required: true, message: '请输入模型标识' }] },
      fieldProps: { placeholder: '如: qwen2.5-coder:7b' },
    },
    {
      title: 'API 密钥',
      dataIndex: 'apiKey',
      valueType: 'password',
      tooltip: 'API 模型必填，本地模型可不填',
    },
    {
      title: 'API 地址',
      dataIndex: 'baseUrl',
      tooltip: '本地模型填 Ollama 地址，API 模型填官方地址',
      fieldProps: { placeholder: '如: http://ollama:11434/v1' },
    },
    {
      title: '温度',
      dataIndex: 'temperature',
      valueType: 'digit',
      initialValue: 0.3,
      fieldProps: { min: 0, max: 2, step: 0.1 },
    },
    {
      title: '最大Token',
      dataIndex: 'maxTokens',
      valueType: 'digit',
      initialValue: 4096,
      fieldProps: { min: 1, max: 131072 },
    },
    {
      title: '超时(ms)',
      dataIndex: 'timeoutMs',
      valueType: 'digit',
      initialValue: 60000,
      fieldProps: { min: 5000, max: 300000 },
    },
    {
      title: '设为默认',
      dataIndex: 'isDefault',
      valueType: 'select',
      initialValue: '0',
      valueEnum: isDefaultEnum,
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      initialValue: '0',
      valueEnum: statusEnum,
    },
    {
      title: '排序',
      dataIndex: 'sortNum',
      valueType: 'digit',
      initialValue: 0,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      valueType: 'textarea',
    },
  ];

  return (
    <CrudTablePage<AiModelRecord>
      title="AI 模型配置"
      rowKey="configId"
      resource={{ basePath: '/api/system/ai-model', status: false }}
      columns={[
        {
          title: '模型名称',
          dataIndex: 'modelName',
          key: 'modelName',
          width: 220,
          render: (_: any, r: AiModelRecord) => (
            <span>
              {r.isDefault === '1' && (
                <Tag color="blue" style={{ marginRight: 6, fontSize: 11 }}>默认</Tag>
              )}
              {r.modelName}
            </span>
          ),
        },
        {
          title: '类型',
          dataIndex: 'modelType',
          key: 'modelType',
          width: 90,
          render: (_: any, r: AiModelRecord) => (
            <Tag
              icon={r.modelType === 'local' ? <DesktopOutlined /> : <CloudOutlined />}
              color={r.modelType === 'local' ? 'green' : 'blue'}
            >
              {r.modelType === 'local' ? '本地' : 'API'}
            </Tag>
          ),
        },
        {
          title: '模型标识',
          dataIndex: 'modelId',
          key: 'modelId',
          ellipsis: true,
          width: 200,
          render: (_: any, r: AiModelRecord) => (
            <code style={{ fontSize: 12, background: '#f5f5f5', padding: '1px 6px', borderRadius: 4 }}>
              {r.modelId}
            </code>
          ),
        },
        {
          title: '提供商',
          dataIndex: 'provider',
          key: 'provider',
          width: 90,
          render: (_: any, r: AiModelRecord) => providerEnum[r.provider] ?? r.provider,
        },
        {
          title: '地址',
          dataIndex: 'baseUrl',
          key: 'baseUrl',
          ellipsis: true,
          width: 200,
          render: (_: any, r: AiModelRecord) => (
            <span style={{ fontSize: 12, color: '#888' }}>{r.baseUrl || '-'}</span>
          ),
        },
        {
          title: '状态',
          dataIndex: 'status',
          key: 'status',
          width: 70,
          render: (_: any, r: AiModelRecord) => (
            <Tag color={r.status === '0' ? 'success' : 'default'}>
              {statusEnum[r.status]}
            </Tag>
          ),
        },
        { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, width: 150 },
      ] as any}
      formColumns={formColumns}
      modalWidth={720}
      permissions={{
        create: can('system:ai-model:add'),
        edit: can('system:ai-model:edit'),
        remove: can('system:ai-model:remove'),
        status: can('system:ai-model:status'),
      } as any}
    />
  );
}
