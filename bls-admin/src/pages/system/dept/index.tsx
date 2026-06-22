import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { useEffect, useMemo, useState } from 'react';
import { request } from '@umijs/max';
import CrudTablePage from '@/components/CrudTablePage';
import { useDict } from '@/hooks/useDict';
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

type UiFieldMeta = {
  fieldKey: string;
  fieldLabel: string;
  fieldScope: '0' | '1' | '2';
  fieldType: 'text' | 'password' | 'select' | 'digit' | 'textarea' | 'dateTime' | 'treeSelect' | 'upload';
  valueEnumKey?: string | null;
  isSearch: boolean;
  isRequired: boolean;
  isCopyable: boolean;
  isEllipsis: boolean;
  isFormVisible: boolean;
  isTableVisible: boolean;
  width?: number | null;
  sortNum: number;
  defaultValue?: string | null;
  placeholder?: string | null;
  propsJson?: Record<string, unknown> | null;
  renderCode?: string | null;
  beforeSubmitCode?: string | null;
};

type PageConfig = {
  pageCode: string;
  pageName: string;
  title: string;
  resourcePath: string;
  rowKey: string;
  statusKey?: string;
  isTree: boolean;
  parentKey?: string | null;
  fields: UiFieldMeta[];
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

  const [deptTree, setDeptTree] = useState<DeptRecord[]>([]);
  const [pageConfig, setPageConfig] = useState<PageConfig | null>(null);

  useEffect(() => {
    listResource<DeptRecord>({ basePath: '/api/system/dept' }).then((res) => {
      if (res.code === 200 && res.data) setDeptTree(res.data);
    });
  }, []);

  // useEffect(() => {
  //   request<PageConfig>('/api/system/page-config/system_dept', { method: 'GET' }).then((res: any) => {
  //     if (res?.code === 200 && res?.data) setPageConfig(res.data);
  //   });
  // }, []);

  const deptTreeData = useMemo(
    () => [
      { title: '根部门', value: '000000', key: '000000' },
      ...buildDeptTreeSelectData(deptTree),
    ],
    [deptTree],
  );

  const visibleFields = useMemo(
    () => (pageConfig?.fields ?? []).filter((field) => field.fieldScope !== '1' && field.isTableVisible),
    [pageConfig],
  );

  const formFields = useMemo(
    () => (pageConfig?.fields ?? []).filter((field) => field.fieldScope !== '0' && field.isFormVisible),
    [pageConfig],
  );

  const columns: ProColumns<DeptRecord>[] = visibleFields.length
    ? visibleFields.map((field) => {
        const base: ProColumns<DeptRecord> = {
          title: field.fieldLabel,
          dataIndex: field.fieldKey as keyof DeptRecord,
          search: field.isSearch,
          copyable: field.isCopyable,
          ellipsis: field.isEllipsis,
          width: field.width ?? undefined,
          valueType: field.fieldType === 'select' ? 'select' : field.fieldType,
          valueEnum: field.valueEnumKey === 'sys_status' ? statusValueEnum : undefined,
        };
        if (field.fieldKey === 'status') base.valueEnum = statusValueEnum;
        return base;
      })
    : [
        { title: '部门名称', dataIndex: 'deptName', ellipsis: true },
        { title: '排序', dataIndex: 'sortNum', search: false, width: 80 },
        { title: '状态', dataIndex: 'status', valueType: 'select', valueEnum: statusValueEnum },
        { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
      ];

  const formColumns: ProFormColumnsType<DeptRecord>[] = formFields.length
    ? formFields.map((field) => {
        const common: ProFormColumnsType<DeptRecord> = {
          title: field.fieldLabel,
          dataIndex: field.fieldKey as keyof DeptRecord,
          valueType: field.fieldType === 'select' ? 'select' : field.fieldType,
          initialValue: field.defaultValue ?? undefined,
          fieldProps: field.propsJson ?? undefined,
          formItemProps: field.isRequired
            ? { rules: [{ required: true, message: `请输入${field.fieldLabel}` }] }
            : undefined,
        };

        if (field.fieldKey === 'parentId') {
          common.initialValue = '000000';
          common.fieldProps = {
            treeData: deptTreeData,
            placeholder: field.placeholder ?? '请选择上级部门',
            treeDefaultExpandAll: true,
            allowClear: false,
            showSearch: true,
            treeNodeFilterProp: 'title',
          };
        }

        if (field.fieldKey === 'status') {
          common.initialValue = '0';
          common.valueEnum = statusFormEnum;
        }

        return common;
      })
    : [
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
      title={pageConfig?.title ?? '部门管理'}
      rowKey="deptId"
      resource={{ basePath: pageConfig?.resourcePath ?? '/api/system/dept', status: false }}
      columns={columns}
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
