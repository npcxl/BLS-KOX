import type { ProFormColumnsType } from '@ant-design/pro-components';
import { useEffect, useMemo, useState } from 'react';
import CrudTablePage from '@/components/CrudTablePage';
import { useDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import { listResource } from '@/services/system/crud';

export type DeptRecord = {
  deptId: string;
  tenantId: string;
  parentId: string;
  deptName: string;
  sortNum?: number;
  status: '0' | '1';
  createTime?: string;
  children?: DeptRecord[];
};

function buildDeptTreeSelectData(depts: DeptRecord[] = []): any[] {
  return depts.map((item) => ({
    title: item.deptName,
    value: item.deptId,
    key: item.deptId,
    children: item.children ? buildDeptTreeSelectData(item.children) : undefined,
  }));
}

function mapValueEnum(valueEnum: Record<string, { text: string }>) {
  return Object.fromEntries(Object.entries(valueEnum).map(([k, v]) => [k, v.text]));
}

function DeptPageInner() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const statusFormEnum = useMemo(() => mapValueEnum(statusValueEnum), [statusValueEnum]);
  const { proColumns } = usePageConfig('system_dept');

  const [deptTree, setDeptTree] = useState<DeptRecord[]>([]);

  useEffect(() => {
    listResource<DeptRecord>({ basePath: '/api/system/dept' }).then((res) => {
      if (res.code === 200 && res.data) setDeptTree(res.data);
    });
  }, []);

  const deptTreeData = useMemo(
    () => [
      { title: '根部门', value: '000000', key: '000000' },
      ...buildDeptTreeSelectData(deptTree),
    ],
    [deptTree],
  );

  const formColumns: ProFormColumnsType<DeptRecord, "text">[] = [
    {
      title: '上级部门',
      dataIndex: 'parentId',
      valueType: 'treeSelect',
      initialValue: '000000',
      formItemProps: { rules: [{ required: true, message: '请选择上级部门' }] },
      fieldProps: {
        treeData: deptTreeData,
        placeholder: '请选择上级部门',
        treeDefaultExpandAll: true,
        allowClear: false,
        showSearch: true,
        treeNodeFilterProp: 'title',
      },
    },
    { title: '部门名称', dataIndex: 'deptName', formItemProps: { rules: [{ required: true, message: '请输入部门名称' }] } },
    { title: '排序', dataIndex: 'sortNum', valueType: 'digit', initialValue: 0 },
    { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: statusFormEnum },
  ];

  return (
    <CrudTablePage<DeptRecord>
      title="部门管理"
      rowKey="deptId"
      resource={{ basePath: '/api/system/dept', status: false }}
      columns={proColumns}
      formColumns={formColumns}
      pagination={false}
      expandable={{ defaultExpandAllRows: true }}
      excelMetaKey="system-dept"
      permissions={{
        import: "system:dept:import",
        export: "system:dept:export",
        status: "system:dept:status",
        create: "system:dept:add",
        edit: "system:dept:edit",
        remove: "system:dept:remove",
      }}
    />
  );
}

export default DeptPageInner;
