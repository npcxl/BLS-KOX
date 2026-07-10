import type { ProFormColumnsType } from '@ant-design/pro-components';
import { message, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useMemo, useState } from 'react';
import { useMultiDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import { refreshGlobalSettings } from '@/services/system/settings';
import CrudTablePage from '@/components/CrudTablePage';
import RebuildIndexModal from '@/components/RebuildIndexModal';

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
  const { proColumns } = usePageConfig('system_config');
  const [rebuildOpen, setRebuildOpen] = useState(false);

  const statusFormEnum = Object.fromEntries(Object.entries(sys_status?.valueEnum ?? {}).map(([k, v]) => [k, v.text]));
  const configTypeFormEnum = Object.fromEntries(Object.entries(sys_config_type?.valueEnum ?? {}).map(([k, v]) => [k, v.text]));

  const formColumns: ProFormColumnsType<ConfigRecord>[] = [
    { title: '参数名称', dataIndex: 'configName', formItemProps: { rules: [{ required: true, message: '请输入参数名称' }] } },
    { title: '参数键名', dataIndex: 'configKey', formItemProps: { rules: [{ required: true, message: '请输入参数键名' }] } },
    { title: '参数键值', dataIndex: 'configValue', valueType: 'textarea', formItemProps: { rules: [{ required: true, message: '请输入参数键值' }] } },
    { title: '参数类型', dataIndex: 'configType', valueType: 'select', initialValue: 'sys', valueEnum: configTypeFormEnum },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: statusFormEnum },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  const openRebuild = useCallback(() => setRebuildOpen(true), []);
  const closeRebuild = useCallback(() => setRebuildOpen(false), []);

  const toolbarExtra = useMemo(() => [
    <Button key="rebuild" icon={<ReloadOutlined />} onClick={openRebuild}>
      重建索引
    </Button>,
  ], [openRebuild]);

  const handleSaved = useCallback(async (_mode: 'create' | 'edit', values: Partial<ConfigRecord>) => {
    if (['theme.default', 'sys.app.name', 'sys.demo.enabled', 'sys.upload.maxSize', 'sys.version', 'sys.user.defaultPassword'].includes(
      String(values.configKey),
    )) {
      await refreshGlobalSettings();
      message.success('前端配置已刷新');
    }
  }, []);

  return (
    <>
      <CrudTablePage<ConfigRecord>
        title="系统参数"
        rowKey="configId"
        resource={{ basePath: '/api/system/config', remove: false, status: false }}
        columns={proColumns}
        formColumns={formColumns}
        modalWidth={760}
        excelMetaKey="system-config"
        permissions={{
          import: "system:config:import",
          export: "system:config:export",
          status: "system:config:status",
          create: "system:config:add",
          edit: "system:config:edit",
          remove: "system:config:remove",
        }}
        scroll={{ x: 'max-content' }}
        toolbarExtra={toolbarExtra}
        onSaved={handleSaved}
      />
      <RebuildIndexModal open={rebuildOpen} onClose={closeRebuild} />
    </>
  );
}

export default ConfigPageInner;
