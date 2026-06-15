import { PlusOutlined } from '@ant-design/icons';
import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { BetaSchemaForm, PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, Space, Tag } from 'antd';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useCrudTable } from '@/hooks/useCrudTable';
import { usePermission } from '@/hooks/usePermission';
import type { CrudResource } from '@/services/system/crud';

export type CrudTablePageProps<T extends Record<string, any>> = {
  title: string;
  rowKey: keyof T;
  resource: CrudResource;
  columns: ProColumns<T>[];
  formColumns: ProFormColumnsType<T>[];
  statusKey?: keyof T;
  createButtonText?: string;
  modalWidth?: number;
  pagination?: false | { defaultPageSize?: number; showSizeChanger?: boolean };
  expandable?: Record<string, any>;
  extraActions?: (record: T) => ReactNode[];
  beforeSubmit?: (values: Partial<T>, current?: T) => Partial<T>;
  onSaved?: (mode: 'create' | 'edit', values: Partial<T>, current?: T) => void | Promise<void>;
  embedded?: boolean;
  formGrid?: boolean;
  formColProps?: Record<string, any>;
  permissions?: {
    create?: string | string[];
    edit?: string | string[];
    remove?: string | string[];
    status?: string | string[];
    import?: string | string[];
    export?: string | string[];
  };
};

function getStatusLabel(valueEnum: Record<string, any> | undefined, value: string): string {
  if (!valueEnum || !Object.keys(valueEnum).length) {
    return value === '0' ? '正常' : '停用';
  }

  const entry = valueEnum[value];

  if (typeof entry === 'string') return entry;
  if (entry?.text) return entry.text;

  return value === '0' ? '正常' : '停用';
}

function getNextStatusLabel(
  valueEnum: Record<string, any> | undefined,
  currentValue: string,
): string {
  const nextValue = currentValue === '0' ? '1' : '0';
  return getStatusLabel(valueEnum, nextValue);
}

export default function CrudTablePage<T extends Record<string, any>>({
  title,
  rowKey,
  resource,
  columns,
  formColumns,
  statusKey = 'status',
  createButtonText = '新增',
  modalWidth = 640,
  pagination = { defaultPageSize: 10, showSizeChanger: true },
  expandable,
  extraActions,
  beforeSubmit,
  onSaved,
  embedded = false,
  formGrid = true,
  formColProps = { xs: 24, md: 12 },
  permissions,
}: CrudTablePageProps<T>) {
  const crud = useCrudTable<T>(resource, rowKey, { beforeSubmit, onSaved });
  const permission = usePermission();

  const canCreate = permissions?.create ? permission.can(permissions.create) : true;
  const canEdit = permissions?.edit ? permission.can(permissions.edit) : true;
  const canRemove = permissions?.remove ? permission.can(permissions.remove) : true;
  const canChangeStatus = permissions?.status ? permission.can(permissions.status) : true;
  const canImport = permissions?.import ? permission.can(permissions.import) : true;
  const canExport = permissions?.export ? permission.can(permissions.export) : true;

  const statusColumnDef = columns.find((col) => col.dataIndex === statusKey);
  const statusValueEnum = statusColumnDef?.valueEnum as Record<string, any> | undefined;

  const formKey = `${String(resource.basePath)}-${crud.mode}-${
    crud.modalOpen ? String(crud.current?.[rowKey] ?? 'new') : 'closed'
  }`;

  const normalizedFormColumns = useMemo(
    () =>
      formGrid
        ? formColumns.map((column) => ({
            ...column,
            colProps: {
              ...formColProps,
              ...column.colProps,
            },
          }))
        : formColumns,
    [formColProps, formColumns, formGrid],
  );

  const normalizedInitialValues = useMemo(() => {
    if (crud.mode !== 'edit' || !crud.current) return undefined;

    const initialValues = { ...crud.current } as Record<string, any>;

    normalizedFormColumns.forEach((column) => {
      const dataIndex = column.dataIndex as string | undefined;
      if (!dataIndex) return;

      const value = initialValues[dataIndex];
      const fieldProps = column.fieldProps as Record<string, any> | undefined;
      const isMultiple = fieldProps?.mode === 'multiple';

      if (isMultiple && typeof value === 'string') {
        initialValues[dataIndex] = value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (isMultiple && Array.isArray(value)) {
        initialValues[dataIndex] = value.map(String);
      }

      if (!isMultiple && value !== undefined && value !== null) {
        const valueType = column.valueType as string | undefined;

        if (valueType === 'treeSelect' || valueType === 'select') {
          initialValues[dataIndex] = String(value);
        }
      }
    });

    return initialValues as T;
  }, [crud.current, crud.mode, normalizedFormColumns]);

  const actionColumn: ProColumns<T> = {
    title: '操作',
    valueType: 'option',
    width: 220,
    render: (_, record) => (
      <Space size="small" wrap>
        {canEdit && (
          <a
            onClick={() => {
              console.log('[CrudTablePage] edit click', record);
              crud.openEdit(record);
            }}
          >
            编辑
          </a>
        )}

        {canChangeStatus && record[statusKey] !== undefined && resource.status !== false && (
          <a onClick={() => crud.changeStatus(record, record[statusKey] === '0' ? '1' : '0')}>
            {getNextStatusLabel(statusValueEnum, record[statusKey] as string)}
          </a>
        )}

        {extraActions?.(record)}

        {canRemove && resource.remove !== false && (
          <a style={{ color: '#ff4d4f' }} onClick={() => crud.remove([record])}>
            删除
          </a>
        )}
      </Space>
    ),
  };

  const mergedColumns = columns.map((column) => {
    if (column.dataIndex === statusKey && !column.render) {
      const colValueEnum = column.valueEnum as Record<string, any> | undefined;

      return {
        ...column,
        render: (_, record) => {
          const val = record[statusKey] as string;
          const label = getStatusLabel(colValueEnum, val);

          return <Tag color={val === '0' ? 'success' : 'default'}>{label}</Tag>;
        },
      } as ProColumns<T>;
    }

    return column;
  });

  const content = (
    <>
      <ProTable<T>
        rowKey={String(rowKey)}
        actionRef={crud.actionRef}
        columns={[...mergedColumns, actionColumn]}
        request={crud.request}
        search={{ labelWidth: 96 }}
        pagination={pagination}
        expandable={expandable}
        toolBarRender={() => [
          canImport ? (
            <Button key="import" onClick={() => undefined}>
              导入
            </Button>
          ) : null,
          canExport ? (
            <Button key="export" onClick={() => undefined}>
              导出
            </Button>
          ) : null,
          canCreate ? (
            <Button key="create" type="primary" icon={<PlusOutlined />} onClick={crud.openCreate}>
              {createButtonText}
            </Button>
          ) : null,
        ]}
        rowSelection={canRemove && resource.remove !== false ? {} : false}
        tableAlertOptionRender={({ selectedRows, onCleanSelected }) =>
          canRemove ? (
            <Space size={16}>
              <a
                onClick={() => {
                  crud.remove(selectedRows as T[]);
                  onCleanSelected();
                }}
              >
                批量删除
              </a>
            </Space>
          ) : null
        }
      />

      {crud.modalOpen && (
        <BetaSchemaForm<T>
          key={formKey}
          title={crud.mode === 'edit' ? `编辑${title}` : `新增${title}`}
          width={modalWidth}
          layoutType="ModalForm"
          grid={formGrid}
          rowProps={{ gutter: 16 }}
          open={crud.modalOpen}
          modalProps={{
            destroyOnHidden: true,
            onCancel: crud.closeModal,
          }}
          columns={normalizedFormColumns}
          initialValues={crud.mode === 'edit' ? normalizedInitialValues : undefined}
          onOpenChange={(open) => {
            if (!open) crud.closeModal();
          }}
          onFinish={async (values) => crud.submit(values)}
        />
      )}
    </>
  );

  if (embedded) return content;

  return <PageContainer title={title}>{content}</PageContainer>;
}