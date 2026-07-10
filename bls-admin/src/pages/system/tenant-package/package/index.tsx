import type { ProFormColumnsType } from '@ant-design/pro-components';
import React, { useState } from 'react';
import { useDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import CrudTablePage from '@/components/CrudTablePage';
import MenuAuthModal from './components/MenuAuthModal';

export type PackageRecord = {
  packageId: string;
  packageName: string;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

function PackagePageInner() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const { proColumns } = usePageConfig('system_package');

  const formColumns: ProFormColumnsType<PackageRecord>[] = [
    { title: '套餐名称', dataIndex: 'packageName', formItemProps: { rules: [{ required: true, message: '请输入套餐名称' }] } },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      initialValue: '0',
      valueEnum: Object.fromEntries(Object.entries(statusValueEnum).map(([k, v]) => [k, v.text])),
    },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<PackageRecord | undefined>(undefined);

  return (
    <>
      <CrudTablePage<PackageRecord>
        title="套餐管理"
        rowKey="packageId"
        resource={{ basePath: '/api/system/package' }}
        columns={proColumns}
        formColumns={formColumns}
        modalWidth={600}
        excelMetaKey="system-package"
        permissions={{
          import: "system:package:import",
          export: "system:package:export",
          status: "system:package:status",
          create: "system:package:add",
          edit: "system:package:edit",
          remove: "system:package:remove",
        }}
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
      />
      <MenuAuthModal
        open={authModalVisible}
        onCancel={() => setAuthModalVisible(false)}
        record={currentRecord}
      />
    </>
  );
}

export default PackagePageInner;
