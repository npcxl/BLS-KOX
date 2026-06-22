import { useCrudTable } from "@/hooks/useCrudTable";
import { usePermission } from "@/hooks/usePermission";
import type { CrudResource } from "@/services/system/crud";
import { InfoCircleOutlined, PlusOutlined } from "@ant-design/icons";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";
import {
  BetaSchemaForm,
  PageContainer,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Space, Switch, Tooltip } from "antd";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import ExcelToolbar from "@/components/ExcelToolbar";

export type CrudTablePageColumnConfig<T extends Record<string, any>> = {
  dataIndex: keyof T | string;
  title?: string;
  visible?: boolean;
  searchable?: boolean;
};

export type CrudTablePageProps<T extends Record<string, any>> = {
  title: string;
  rowKey: keyof T;
  resource: CrudResource;
  columns: ProColumns<T>[];
  formColumns: ProFormColumnsType<T>[];
  columnConfig?: CrudTablePageColumnConfig<T>[];
  statusKey?: keyof T;
  createButtonText?: string;
  showCreateButton?: boolean;
  modalWidth?: number;
  pagination?: false | { defaultPageSize?: number; showSizeChanger?: boolean };
  scroll?: { x?: number | string; y?: number };
  expandable?: Record<string, any>;
  extraActions?: (record: T) => ReactNode[];
  toolbarExtra?: ReactNode[];
  beforeSubmit?: (values: Partial<T>, current?: T) => Partial<T>;
  onSaved?: (
    mode: "create" | "edit",
    values: Partial<T>,
    current?: T
  ) => void | Promise<void>;
  embedded?: boolean;
  formGrid?: boolean;
  formColProps?: Record<string, any>;
  defaultSearchMode?: "fuzzy" | "exact";
  showSearchModeToggle?: boolean;
  permissions?: {
    create?: string | string[];
    edit?: string | string[];
    remove?: string | string[];
    status?: string | string[];
    import?: string | string[];
    export?: string | string[];
  };
  excelMetaKey?: string;
};

function getStatusLabel(
  valueEnum: Record<string, any> | undefined,
  value: string
): string {
  if (!valueEnum || !Object.keys(valueEnum).length) {
    return value === "0" ? "正常" : "停用";
  }

  const entry = valueEnum[value];

  if (typeof entry === "string") return entry;
  if (entry?.text) return entry.text;

  return value === "0" ? "正常" : "停用";
}

function getNextStatusLabel(
  valueEnum: Record<string, any> | undefined,
  currentValue: string
): string {
  const nextValue = currentValue === "0" ? "1" : "0";
  return getStatusLabel(valueEnum, nextValue);
}

export default function CrudTablePage<T extends Record<string, any>>({
  title,
  rowKey,
  resource,
  columns,
  formColumns,
  columnConfig,
  statusKey = "status",
  createButtonText = "新增",
  showCreateButton = true, // 特殊表不需要新增。
  modalWidth = 640,
  pagination = { defaultPageSize: 10, showSizeChanger: true },
  scroll,
  expandable,
  extraActions,
  toolbarExtra,
  beforeSubmit,
  onSaved,
  embedded = false,
  formGrid = true,
  formColProps = { xs: 24, md: 12 },
  defaultSearchMode = "fuzzy",
  showSearchModeToggle = true,
  permissions,
  excelMetaKey,
}: CrudTablePageProps<T>) {
  const [searchMode, setSearchMode] = useState<"fuzzy" | "exact">(
    defaultSearchMode
  );
  const crud = useCrudTable<T>(resource, rowKey, {
    beforeSubmit,
    onSaved,
    searchMode,
  });

  const handleSearchModeChange = (checked: boolean) => {
    const nextMode = checked ? "fuzzy" : "exact";
    setSearchMode(nextMode);
    crud.actionRef.current?.reload(true);
  };
  const permission = usePermission();

  const canCreate = permissions?.create
    ? permission.can(permissions.create)
    : true;
  const canEdit = permissions?.edit ? permission.can(permissions.edit) : true;
  const canRemove = permissions?.remove
    ? permission.can(permissions.remove)
    : true;
  const canChangeStatus = permissions?.status
    ? permission.can(permissions.status)
    : true;
  const canImport = permissions?.import
    ? permission.can(permissions.import)
    : true;
  const canExport = permissions?.export
    ? permission.can(permissions.export)
    : true;
  const statusColumnDef = columns.find((col) => col.dataIndex === statusKey);
  const statusValueEnum = statusColumnDef?.valueEnum as
    | Record<string, any>
    | undefined;
  const visibleColumns = useMemo(() => {
    if (!columnConfig?.length) return columns;

    const configMap = new Map(
      columnConfig.map((item) => [String(item.dataIndex), item])
    );

    return columns.filter((column) => {
      const dataIndex = String(column.dataIndex ?? "");
      const config = configMap.get(dataIndex);
      if (!config) return true;
      return config.visible !== false;
    });
  }, [columnConfig, columns]);

  const searchColumns = useMemo(() => {
    if (!columnConfig?.length) return visibleColumns;

    const configMap = new Map(
      columnConfig.map((item) => [String(item.dataIndex), item])
    );

    return visibleColumns.map((column) => {
      const dataIndex = String(column.dataIndex ?? "");
      const config = configMap.get(dataIndex);
      if (!config?.searchable) {
        return { ...column, search: false } as ProColumns<T>;
      }
      return column;
    });
  }, [columnConfig, visibleColumns]);

  const formKey = `${String(resource.basePath)}-${crud.mode}-${
    crud.modalOpen ? String(crud.current?.[rowKey] ?? "new") : "closed"
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
    [formColProps, formColumns, formGrid]
  );

  const normalizedInitialValues = useMemo(() => {
    if (crud.mode === "create") {
      return crud.createDefaults as T | undefined;
    }

    if (crud.mode !== "edit" || !crud.current) return undefined;

    const initialValues = { ...crud.current } as Record<string, any>;

    normalizedFormColumns.forEach((column) => {
      const dataIndex = column.dataIndex as string | undefined;
      if (!dataIndex) return;

      const value = initialValues[dataIndex];
      const fieldProps = column.fieldProps as Record<string, any> | undefined;
      const valueType = column.valueType as string | undefined;
      const isMultiple = fieldProps?.mode === "multiple";

      if (valueType === "switch") {
        initialValues[dataIndex] =
          value === 1 || value === "1" || value === true;
        return;
      }

      if (
        valueType === "textarea" &&
        typeof value === "string" &&
        /json$/i.test(dataIndex)
      ) {
        try {
          initialValues[dataIndex] = JSON.stringify(JSON.parse(value), null, 2);
        } catch {
          initialValues[dataIndex] = value;
        }
        return;
      }

      if (
        valueType === "textarea" &&
        value &&
        typeof value === "object" &&
        /json$/i.test(dataIndex)
      ) {
        try {
          initialValues[dataIndex] = JSON.stringify(value, null, 2);
        } catch {
          initialValues[dataIndex] = String(value);
        }
        return;
      }

      if (isMultiple && typeof value === "string") {
        initialValues[dataIndex] = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (isMultiple && Array.isArray(value)) {
        initialValues[dataIndex] = value.map(String);
      }

      if (!isMultiple && value !== undefined && value !== null) {
        if (valueType === "treeSelect" || valueType === "select") {
          initialValues[dataIndex] = String(value);
        }
      }
    });

    return initialValues as T;
  }, [crud.current, crud.mode, normalizedFormColumns]);

  const actionColumn: ProColumns<T> = {
    title: "操作",
    valueType: "option",
    width: 160,
    render: (_, record) => (
      <Space size="small" wrap>
        {canEdit && <a onClick={() => crud.openEdit(record)}>编辑</a>}

        {canChangeStatus &&
          record[statusKey] !== undefined &&
          resource.status !== false && (
            <a
              onClick={() =>
                crud.changeStatus(record, record[statusKey] === "0" ? "1" : "0")
              }
            >
              {getNextStatusLabel(statusValueEnum, record[statusKey] as string)}
            </a>
          )}

        {extraActions?.(record)}

        {canRemove && resource.remove !== false && (
          <a style={{ color: "#ff4d4f" }} onClick={() => crud.remove([record])}>
            删除
          </a>
        )}
      </Space>
    ),
  };

  const content = (
    <>
      <ProTable<T>
        rowKey={String(rowKey)}
        actionRef={crud.actionRef}
        columns={[...searchColumns, actionColumn]}
        request={crud.request}
        search={{ labelWidth: 96 }}
        pagination={pagination}
        scroll={scroll}
        expandable={expandable}
        toolBarRender={() => [
          ...(showSearchModeToggle
            ? [
                <Space key="search-mode" align="center">
                  <Tooltip title="切换搜索模式后会自动刷新列表">
                    <InfoCircleOutlined /> <span>搜索模式</span>
                  </Tooltip>
                  <Switch
                    checked={searchMode === "fuzzy"}
                    checkedChildren="模糊"
                    unCheckedChildren="精确"
                    onChange={handleSearchModeChange}
                  />
                </Space>,
              ]
            : []),
          ...(excelMetaKey
            ? [
                <ExcelToolbar
                  key="excel-toolbar"
                  metaKey={excelMetaKey}
                  queryParams={crud.lastRequestParams.current}
                />,
              ]
            : []),
          ...((toolbarExtra ?? []) as any[]),
          canCreate && showCreateButton ? (
            <Button
              key="create"
              type="primary"
              icon={<PlusOutlined />}
              onClick={crud.openCreate}
            >
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
          title={crud.mode === "edit" ? `编辑${title}` : `新增${title}`}
          width={modalWidth}
          layoutType="ModalForm"
          grid={formGrid}
          rowProps={{ gutter: 16 }}
          open={crud.modalOpen}
          // 重点：控制高度写在这里
          modalProps={{
            destroyOnHidden: true,
            onCancel: crud.closeModal,
            // 2. 表单内容区域高度控制（核心）
            bodyStyle: {
              // 方案1：固定像素高度
              // maxHeight: '600px',
              // 方案2：自适应屏幕（推荐，视口高度80%，减去标题+底部按钮）
              maxHeight: "calc(80vh - 120px)",
              overflowY: "auto", // 内容超出出现垂直滚动
              overflowX: "hidden",
            },
          }}
          columns={normalizedFormColumns}
          initialValues={
            crud.mode === "edit" ? normalizedInitialValues : undefined
          }
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
