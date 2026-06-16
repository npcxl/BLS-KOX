import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { message, Switch } from 'antd';
import { request } from '@umijs/max';
import CrudTablePage from '@/components/CrudTablePage';
import { useDict } from '@/hooks/useDict';

export type StorageRecord = {
  storageId: string;
  tenantId: string;
  storageName: string;
  storageType: 'minio' | 'aliyun_oss' | 'tencent_cos' | 'qiniu_kodo' | 'huawei_obs' | 'aws_s3' | 'local';
  endpoint?: string | null;
  region?: string | null;
  port?: number | null;
  useSsl?: 0 | 1 | boolean;
  accessKey?: string | null;
  secretKey?: string | null;
  publicBucket?: string | null;
  privateBucket?: string | null;
  publicBaseUrl?: string | null;
  privateBaseUrl?: string | null;
  pathStyle?: 0 | 1 | boolean;
  configJson?: Record<string, any> | string | null;
  policyJson?: Record<string, any> | string | null;
  isDefault: '0' | '1' | 0 | 1 | boolean;
  status: '0' | '1' | 0 | 1;
  remark?: string | null;
  createTime?: string;
};

function toJsonString(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export default function StoragePage() {
  const { options: storageTypeOptions } = useDict('sys_storage_type');
  const { options: statusOptions } = useDict('sys_status');

  const storageTypeValueEnum = Object.fromEntries(storageTypeOptions.map((item) => [item.value, { text: item.label }]));
  const statusValueEnum = Object.fromEntries(statusOptions.map((item) => [item.value, { text: item.label }]));

  const columns: ProColumns<StorageRecord>[] = [
    { title: '存储名称', dataIndex: 'storageName', ellipsis: true },
    { title: '存储类型', dataIndex: 'storageType', valueType: 'select', valueEnum: storageTypeValueEnum },
    { title: 'Endpoint', dataIndex: 'endpoint', search: false, ellipsis: true },
    { title: 'Region', dataIndex: 'region', search: false },
    { title: '端口', dataIndex: 'port', search: false, width: 90 },
    { title: '公共桶', dataIndex: 'publicBucket', search: false, ellipsis: true },
    { title: '私有桶', dataIndex: 'privateBucket', search: false, ellipsis: true },
    { title: '公共地址', dataIndex: 'publicBaseUrl', search: false, ellipsis: true },
    {
      title: '是否默认',
      dataIndex: 'isDefault',
      search: false,
      render: (_, record) => (
        <Switch
          checked={String(record.isDefault) === '1'}
          onChange={async (checked) => {
            const res = await request('/api/system/storage/edit', {
              method: 'PUT',
              data: { ...record, isDefault: checked ? '1' : '0' },
            });
            if (res?.code === 200) {
              message.success('默认存储已更新');
              window.location.reload();
            }
          }}
        />
      ),
    },
    { title: '状态', dataIndex: 'status', valueType: 'select', valueEnum: statusValueEnum },
    { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
  ];

  const formColumns: ProFormColumnsType<StorageRecord>[] = [
    { title: '存储名称', dataIndex: 'storageName', formItemProps: { rules: [{ required: true, message: '请输入存储名称' }] } },
    { title: '存储类型', dataIndex: 'storageType', valueType: 'select', initialValue: 'minio', valueEnum: storageTypeValueEnum },
    { title: 'Endpoint', dataIndex: 'endpoint', formItemProps: { rules: [{ required: true, message: '请输入 Endpoint' }] } },
    { title: 'Region', dataIndex: 'region' },
    { title: '端口', dataIndex: 'port', valueType: 'digit', initialValue: 443 },
    { title: '是否 HTTPS', dataIndex: 'useSsl', valueType: 'switch', initialValue: true },
    { title: 'AccessKey', dataIndex: 'accessKey', formItemProps: { rules: [{ required: true, message: '请输入 AccessKey' }] } },
    { title: 'SecretKey', dataIndex: 'secretKey', valueType: 'password', formItemProps: { rules: [{ required: true, message: '请输入 SecretKey' }] } },
    { title: '公共桶', dataIndex: 'publicBucket', formItemProps: { rules: [{ required: true, message: '请输入公共桶名称' }] } },
    { title: '私有桶', dataIndex: 'privateBucket' },
    { title: '公共地址', dataIndex: 'publicBaseUrl' },
    { title: '私有地址', dataIndex: 'privateBaseUrl' },
    { title: '路径风格', dataIndex: 'pathStyle', valueType: 'switch', initialValue: true },
    { title: '配置 JSON', dataIndex: 'configJson', valueType: 'textarea', fieldProps: { autoSize: { minRows: 4, maxRows: 10 } } },
    { title: '策略 JSON', dataIndex: 'policyJson', valueType: 'textarea', fieldProps: { autoSize: { minRows: 4, maxRows: 10 } } },
    { title: '是否默认', dataIndex: 'isDefault', valueType: 'switch', initialValue: false },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '1', valueEnum: statusValueEnum },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  return (
    <CrudTablePage<StorageRecord>
      title="OSS存储"
      rowKey="storageId"
      resource={{ basePath: '/api/system/storage', status: false }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={920}
      beforeSubmit={(values, current) => ({
        ...(current ?? {}),
        ...values,
        useSsl: values.useSsl ? 1 : 0,
        pathStyle: values.pathStyle ? 1 : 0,
        isDefault: String(values.isDefault ?? current?.isDefault ?? '0') as '0' | '1',
        status: String(values.status ?? current?.status ?? '1') as '0' | '1',
        configJson: toJsonString(values.configJson || current?.configJson || ''),
        policyJson: toJsonString(values.policyJson || current?.policyJson || ''),
      })}
    />
  );
}
