import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { request } from '@umijs/max';
import { useDict } from '@/hooks/useDict';
import CrudTablePage from '@/components/CrudTablePage';

export type TenantRecord = {
  tenantId: string;
  tenantName: string;
  packageId?: string;
  expireTime?: string;
  domainName?: string;
  contactUser?: string;
  contactPhone?: string;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

function TenantPageInner() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const statusFormEnum = Object.fromEntries(Object.entries(statusValueEnum).map(([k, v]) => [k, v.text]));

  const columns: ProColumns<TenantRecord>[] = [
    { title: '租户名称', dataIndex: 'tenantName', ellipsis: true },
    { title: '绑定域名', dataIndex: 'domainName', search: false, ellipsis: true },
    { title: '联系人', dataIndex: 'contactUser', search: false },
    { title: '联系电话', dataIndex: 'contactPhone', search: false },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: statusValueEnum,
    },
    { title: '到期时间', dataIndex: 'expireTime', valueType: 'dateTime', search: false },
    { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
  ];

  const formColumns: ProFormColumnsType<TenantRecord>[] = [
    { title: '租户名称', dataIndex: 'tenantName', formItemProps: { rules: [{ required: true, message: '请输入租户名称' }] } },
    {
      title: '套餐',
      dataIndex: 'packageId',
      valueType: 'select',
      request: async () => {
        const res = await request('/api/system/package/options');
        return res?.data?.map((item: any) => ({ label: item.packageName, value: item.packageId })) || [];
      },
      formItemProps: { rules: [{ required: true, message: '请选择套餐' }] },
    },
    { title: '到期时间', dataIndex: 'expireTime', valueType: 'dateTime' },
    { title: '绑定域名', dataIndex: 'domainName' },
    { title: '联系人', dataIndex: 'contactUser' },
    { title: '联系电话', dataIndex: 'contactPhone' },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      initialValue: '0',
      valueEnum: statusFormEnum,
    },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  return (
    <CrudTablePage<TenantRecord>
      title="租户管理"
      rowKey="tenantId"
      resource={{ basePath: '/api/system/tenant' }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={720}
      excelMetaKey="system-tenant"
      permissions={{
        import: "system:tenant:import",
        export: "system:tenant:export",
        status: "system:tenant:status",
        create: "system:tenant:add",
        edit: "system:tenant:edit",
        remove: "system:tenant:remove",
      }}
      />
  );
}

export default TenantPageInner;
