import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { message } from 'antd';
import { useMultiDict } from '@/hooks/useDict';
import { refreshGlobalSettings } from '@/services/system/settings';
import CrudTablePage from '@/components/CrudTablePage';

export type ConfigRecord = {
  configId: string;
  tenantId: string;
  configKey: string;
  configValue: string;
  configName: string;
  configType: 'sys' | 'theme' | 'dict';
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

function ConfigPageInner() {
  const { sys_status, sys_config_type } = useMultiDict(['sys_status', 'sys_config_type']);

  const statusValueEnum = sys_status?.valueEnum ?? {};
  const configTypeValueEnum = sys_config_type?.valueEnum ?? {};
  const statusFormEnum = Object.fromEntries(Object.entries(statusValueEnum).map(([k, v]) => [k, v.text]));
  const configTypeFormEnum = Object.fromEntries(Object.entries(configTypeValueEnum).map(([k, v]) => [k, v.text]));

  const columns: ProColumns<ConfigRecord>[] = [
    { title: '参数名称', dataIndex: 'configName', ellipsis: true },
    { title: '参数键名', dataIndex: 'configKey', copyable: true, ellipsis: true },
    { title: '参数键值', dataIndex: 'configValue', search: false, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'configType',
      valueType: 'select',
      valueEnum: configTypeValueEnum,
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: statusValueEnum,
    },
    { title: '备注', dataIndex: 'remark', search: false, ellipsis: true },
    { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
  ];

  const formColumns: ProFormColumnsType<ConfigRecord>[] = [
    { title: '参数名称', dataIndex: 'configName', formItemProps: { rules: [{ required: true, message: '请输入参数名称' }] } },
    { title: '参数键名', dataIndex: 'configKey', formItemProps: { rules: [{ required: true, message: '请输入参数键名' }] } },
    { title: '参数键值', dataIndex: 'configValue', valueType: 'textarea', formItemProps: { rules: [{ required: true, message: '请输入参数键值' }] } },
    { title: '参数类型', dataIndex: 'configType', valueType: 'select', initialValue: 'sys', valueEnum: configTypeFormEnum },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: statusFormEnum },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  return (
    <CrudTablePage<ConfigRecord>
      title="系统参数"
      rowKey="configId"
      resource={{ basePath: '/api/system/config', remove: false, status: false }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={760}
      onSaved={async (_mode, values) => {
        if (
          ['theme.default', 'sys.app.name', 'sys.demo.enabled', 'sys.upload.maxSize', 'sys.version', 'sys.user.defaultPassword'].includes(
            String(values.configKey),
          )
        ) {
          await refreshGlobalSettings();
          message.success('前端配置已刷新');
        }
      }}
    />
  );
}

export default ConfigPageInner;
