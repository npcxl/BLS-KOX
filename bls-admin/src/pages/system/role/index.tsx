import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import React, { useState } from 'react';
import { useDict } from '@/hooks/useDict';
import CrudTablePage from '@/components/CrudTablePage';
import MenuAuthModal from './components/MenuAuthModal';

export type RoleRecord = {
  roleId: string;
  tenantId: string;
  roleName: string;
  roleKey: string;
  sortNum?: number;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

function RolePageInner() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const statusFormEnum = Object.fromEntries(Object.entries(statusValueEnum).map(([k, v]) => [k, v.text]));

  const columns: ProColumns<RoleRecord>[] = [
    { title: '角色名称', dataIndex: 'roleName', ellipsis: true },
    { title: '角色标识', dataIndex: 'roleKey', search: false, copyable: true },
    { title: '排序', dataIndex: 'sortNum', search: false, width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: statusValueEnum,
    },
    { title: '备注', dataIndex: 'remark', search: false, ellipsis: true },
    { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
  ];

  const formColumns: ProFormColumnsType<RoleRecord>[] = [
    { title: '角色名称', dataIndex: 'roleName', formItemProps: { rules: [{ required: true, message: '请输入角色名称' }] } },
    { title: '角色标识', dataIndex: 'roleKey', formItemProps: { rules: [{ required: true, message: '请输入角色标识' }] } },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: statusFormEnum },
    { title: '排序', dataIndex: 'sortNum', valueType: 'digit', initialValue: 0 },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<RoleRecord | undefined>(undefined);

  return (
    <>
      <CrudTablePage<RoleRecord>
        title="角色管理"
        rowKey="roleId"
        resource={{ basePath: '/api/system/role' }}
        columns={columns}
        formColumns={formColumns}
        extraActions={(record) => [
          <a
            key="auth"
            onClick={() => {
              setCurrentRecord(record);
              setAuthModalVisible(true);
            }}
          >
            菜单权限
          </a>,
        ]}
        excelMetaKey="system-role"
        permissions={{
          create: "system:role:add",
          edit: "system:role:edit",
          remove: "system:role:remove",
          status: "system:role:status",
          import: "system:role:import",
          export: "system:role:export",
        }}
      />
      <MenuAuthModal
        open={authModalVisible}
        onCancel={() => setAuthModalVisible(false)}
        record={currentRecord}
      />
    </>
  );
}

export default RolePageInner;
