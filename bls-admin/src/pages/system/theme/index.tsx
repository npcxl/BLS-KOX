import type { ProFormColumnsType } from '@ant-design/pro-components';
import { useDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import { useMemo } from 'react';
import CrudTablePage from '@/components/CrudTablePage';

export type ThemeRecord = {
  themeId: string;
  tenantId: string;
  navTheme: 'light' | 'dark' | 'realDark';
  colorPrimary: string;
  layout: 'side' | 'top' | 'mix';
  contentWidth: 'Fluid' | 'Fixed';
  fixedHeader: 0 | 1 | boolean;
  fixSiderbar: 0 | 1 | boolean;
  colorWeak: 0 | 1 | boolean;
  title: string;
  logo?: string | null;
  iconfontUrl?: string | null;
  tokenJson?: string | null;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

function ThemePageInner() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const { valueEnum: yesNoValueEnum } = useDict('sys_yes_no');
  const { valueEnum: navThemeValueEnum } = useDict('sys_nav_theme');
  const { valueEnum: layoutValueEnum } = useDict('sys_layout_type');
  const { valueEnum: contentWidthValueEnum } = useDict('sys_content_width');
  const { proColumns: baseColumns } = usePageConfig('system_theme');

  const columns = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === 'layout') return { ...col, valueEnum: layoutValueEnum };
    if (col.dataIndex === 'fixedHeader') return { ...col, valueEnum: yesNoValueEnum };
    if (col.dataIndex === 'fixSiderbar') return { ...col, valueEnum: yesNoValueEnum };
    if (col.dataIndex === 'colorWeak') return { ...col, valueEnum: yesNoValueEnum };
    return col;
  }), [baseColumns, layoutValueEnum, yesNoValueEnum]);

  const formColumns: ProFormColumnsType<ThemeRecord>[] = [
    // { title: '标题', dataIndex: 'title', formItemProps: { rules: [{ required: true, message: '请输入系统标题' }] } },
    {
      title: '导航主题',
      dataIndex: 'navTheme',
      valueType: 'select',
      initialValue: 'light',
      valueEnum: navThemeValueEnum,
    },
    { title: '主色', dataIndex: 'colorPrimary', valueType: 'color', initialValue: '#1677ff' },
    {
      title: '布局',
      dataIndex: 'layout',
      valueType: 'select',
      initialValue: 'mix',
      valueEnum: layoutValueEnum,
    },
    {
      title: '内容宽度',
      dataIndex: 'contentWidth',
      valueType: 'select',
      initialValue: 'Fluid',
      valueEnum: contentWidthValueEnum,
    },
    { title: '固定头部', dataIndex: 'fixedHeader', valueType: 'switch', initialValue: false },
    { title: '固定侧栏', dataIndex: 'fixSiderbar', valueType: 'switch', initialValue: true },
    { title: '色弱模式', dataIndex: 'colorWeak', valueType: 'switch', initialValue: false },
    { title: 'Logo', dataIndex: 'logo' },
    { title: 'Iconfont URL', dataIndex: 'iconfontUrl' },
    { title: 'Token JSON', dataIndex: 'tokenJson', valueType: 'textarea', tooltip: '可填写 Ant Design token JSON' },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: Object.fromEntries(Object.entries(statusValueEnum).map(([k, v]) => [k, v.text])) },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  function normalizeColorValue(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      const maybeColor = value as { value?: unknown; color?: unknown };
      if (typeof maybeColor.value === 'string') return maybeColor.value.trim();
      if (typeof maybeColor.color === 'string') return maybeColor.color.trim();
    }
    return fallback;
  }

  return (
    <CrudTablePage<ThemeRecord>
      title="主题配置"
      rowKey="themeId"
      resource={{ basePath: '/api/system/theme', status: false }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={860}
      beforeSubmit={(values, current) => {
        const themeId = String(current?.themeId ?? values.themeId ?? '').trim();
        const colorPrimary = normalizeColorValue(values.colorPrimary, current?.colorPrimary ?? '#1677ff');
        return {
          themeId,
          title: String(values.title ?? current?.title ?? '').trim(),
          navTheme: values.navTheme ?? current?.navTheme,
          colorPrimary,
          layout: values.layout ?? current?.layout,
          contentWidth: values.contentWidth ?? current?.contentWidth,
          fixedHeader: values.fixedHeader ? 1 : 0,
          fixSiderbar: values.fixSiderbar ? 1 : 0,
          colorWeak: values.colorWeak ? 1 : 0,
          logo: values.logo ?? current?.logo ?? null,
          iconfontUrl: values.iconfontUrl ?? current?.iconfontUrl ?? null,
          tokenJson: values.tokenJson || current?.tokenJson || '{}',
          status: values.status ?? current?.status ?? '0',
          remark: values.remark ?? current?.remark ?? '',
        };
      }}
      permissions={{
        create: "system:theme:create",
        edit: "system:theme:edit",
        remove: "system:theme:remove",
        status: "system:theme:status",
        import: "system:theme:import",
        export: "system:theme:export",
      }}
      />
  );
}

export default ThemePageInner;
