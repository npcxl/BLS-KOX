import type { ProFormColumnsType } from '@ant-design/pro-components';
import { message, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useMemo, useState } from 'react';
import { useMultiDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import { usePermission } from '@/hooks/usePermission';
import { refreshGlobalSettings } from '@/services/system/settings';
import CrudTablePage from '@/components/CrudTablePage';
import RebuildIndexModal from '@/components/RebuildIndexModal';
import CaptchaSettingPanel from './components/CaptchaSettingPanel';

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
  const { hasPermission } = usePermission(['system:config:edit', 'system:config:add']);

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

  const handleCaptchaSaved = useCallback(async () => {
    await refreshGlobalSettings();
  }, []);

  const toolbarExtra = useMemo(() => [
    // 登录人机验证的 8 个键全部收进这个按钮的弹窗（原来是一张占满宽度的卡片）
    <CaptchaSettingPanel key="captcha" canEdit={hasPermission} onSaved={handleCaptchaSaved} />,
    <Button key="rebuild" icon={<ReloadOutlined />} onClick={openRebuild}>
      重建索引
    </Button>,
  ], [openRebuild, hasPermission, handleCaptchaSaved]);

  const handleSaved = useCallback(async (_mode: 'create' | 'edit', values: Partial<ConfigRecord>) => {
    const key = String(values.configKey ?? '');
    // 人机验证统一使用扁平键（login_captcha_enabled / captcha_*）
    if (key === 'login_captcha_enabled' || key.startsWith('captcha_')) {
      message.success('登录人机验证配置已更新，立即生效');
      return;
    }
    if (['theme.default', 'sys.app.name', 'sys.demo.enabled', 'sys.upload.maxSize', 'sys.version', 'sys.user.defaultPassword'].includes(key)) {
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
