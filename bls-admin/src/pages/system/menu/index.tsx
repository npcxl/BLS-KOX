import IconPicker, { getAntdIcon } from "@/components/IconPicker";
import { useCrudTable } from "@/hooks/useCrudTable";
import { useDict } from "@/hooks/useDict";
import { editResource, listResource } from "@/services/system/crud";
import type { ProColumns, ProFormColumnsType } from "@ant-design/pro-components";
import {
  BetaSchemaForm,
  PageContainer,
  ProTable,
} from "@ant-design/pro-components";
import { App, Button, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";

const ROOT_PARENT_ID = "000000";

export type MenuRecord = {
  menuId: string;
  parentId: string;
  menuName: string;
  icon?: string;
  path?: string;
  component?: string;
  perms?: string;
  menuType: "0" | "1" | "2";
  sortNum?: number;
  status: "0" | "1";
  children?: MenuRecord[];
};

function menuToTreeData(menus: MenuRecord[]): any[] {
  return menus
    .filter((item) => item.menuType !== "2")
    .map((item) => ({
      title: item.menuName,
      value: String(item.menuId),
      key: String(item.menuId),
      children: item.children ? menuToTreeData(item.children) : undefined,
    }));
}

export default function MenuPage() {
  const { message } = App.useApp();
  const { valueEnum: menuTypeValueEnum } = useDict("sys_menu_type");
  const { valueEnum: statusValueEnum } = useDict("sys_status");
  const [menuTree, setMenuTree] = useState<any[]>([]);
  const [iconTarget, setIconTarget] = useState<MenuRecord | null>(null);
  const [iconValue, setIconValue] = useState<string | undefined>();
  const crud = useCrudTable<MenuRecord>(
    { basePath: "/api/system/menu", status: false },
    "menuId",
    {
      beforeSubmit: (values, current) => ({
        ...values,
        parentId: values.parentId ?? current?.parentId ?? ROOT_PARENT_ID,
      }),
      onSaved: async () => {
        await refreshMenuTree();
      },
    }
  );

  const refreshMenuTree = async () => {
    const res = await listResource<MenuRecord>({
      basePath: "/api/system/menu",
    });

    if (res.code === 200 && res.data) {
      setMenuTree(menuToTreeData(res.data));
    }
  };

  useEffect(() => {
    refreshMenuTree();
  }, []);

  const columns: ProColumns<MenuRecord>[] = useMemo(
    () => [
      { title: "菜单名称", dataIndex: "menuName", ellipsis: true },
      {
        title: "图标",
        dataIndex: "icon",
        search: false,
        width: 80,
        align: "center",
        render: (_, record) => getAntdIcon(record.icon) || record.icon || "-",
      },
      { title: "路由地址", dataIndex: "path", search: false, copyable: true },
      {
        title: "组件路径",
        dataIndex: "component",
        search: false,
        ellipsis: true,
      },
      { title: "权限标识", dataIndex: "perms", search: false, copyable: true },
      {
        title: "类型",
        dataIndex: "menuType",
        valueType: "select",
        valueEnum: menuTypeValueEnum,
      },
      {
        title: "状态",
        dataIndex: "status",
        valueType: "select",
        valueEnum: statusValueEnum,
        render: (_, record) => (
          <Tag color={record.status === "0" ? "success" : "error"}>
            {statusValueEnum?.[record.status]?.text ?? "error"}
          </Tag>
        ),
      },
      { title: "排序", dataIndex: "sortNum", search: false, width: 80 },
    ],
    [menuTypeValueEnum, statusValueEnum]
  );

  const formColumns: ProFormColumnsType<MenuRecord>[] = useMemo(
    () => [
      {
        title: "上级菜单",
        dataIndex: "parentId",
        valueType: "treeSelect",
        initialValue: ROOT_PARENT_ID,
        colProps: { xs: 24, md: 12 },
        formItemProps: {
          rules: [{ required: true, message: "请选择上级菜单" }],
        },
        fieldProps: {
          treeData: [
            { title: "根目录", value: ROOT_PARENT_ID, key: ROOT_PARENT_ID },
            ...menuTree,
          ],
          placeholder: "请选择上级菜单",
          treeDefaultExpandAll: true,
          allowClear: true,
          showSearch: true,
          treeNodeFilterProp: "title",
        },
      },
      {
        title: "菜单名称",
        dataIndex: "menuName",
        colProps: { xs: 24, md: 12 },
        formItemProps: {
          rules: [{ required: true, message: "请输入菜单名称" }],
        },
      },
      {
        title: "菜单类型",
        dataIndex: "menuType",
        valueType: "select",
        initialValue: "1",
        colProps: { xs: 24, md: 12 },
        valueEnum: menuTypeValueEnum,
      },
      { title: "路由地址", dataIndex: "path", colProps: { xs: 24, md: 12 } },
      { title: "组件路径", dataIndex: "component", colProps: { xs: 24, md: 12 } },
      { title: "权限标识", dataIndex: "perms", colProps: { xs: 24, md: 12 } },
      {
        title: "状态",
        dataIndex: "status",
        valueType: "select",
        initialValue: "0",
        colProps: { xs: 24, md: 12 },
        valueEnum: statusValueEnum,
      },
      {
        title: "排序",
        dataIndex: "sortNum",
        valueType: "digit",
        initialValue: 0,
        colProps: { xs: 24, md: 12 },
      },
    ],
    [menuTree, menuTypeValueEnum, statusValueEnum]
  );

  return (
    <PageContainer title="菜单管理">
      <ProTable<MenuRecord>
        rowKey="menuId"
        actionRef={crud.actionRef}
        columns={columns}
        request={crud.request}
        search={{ labelWidth: 96 }}
        pagination={false}
        expandable={{ defaultExpandAllRows: true }}
        toolBarRender={() => [
          <Button key="create" type="primary" onClick={() => crud.openCreate()}>
            新增
          </Button>,
        ]}
        rowSelection={false}
        options={false}
      />

      {crud.modalOpen && (
        <BetaSchemaForm<MenuRecord>
          key={`${crud.mode}-${crud.current?.menuId ?? "new"}`}
          title={crud.mode === "edit" ? "编辑菜单" : "新增菜单"}
          width={760}
          layoutType="ModalForm"
          grid
          rowProps={{ gutter: 16 }}
          open={crud.modalOpen}
          modalProps={{
            destroyOnHidden: true,
            onCancel: crud.closeModal,
            bodyStyle: {
              maxHeight: "calc(80vh - 120px)",
              overflowY: "auto",
              overflowX: "hidden",
            },
          }}
          columns={formColumns}
          initialValues={crud.mode === "edit" ? (crud.current as MenuRecord) : undefined}
          onOpenChange={(open) => {
            if (!open) crud.closeModal();
          }}
          onFinish={async (values) => crud.submit(values)}
        />
      )}

      <IconPicker
        open={!!iconTarget}
        value={iconValue}
        onChange={setIconValue}
        onOpenChange={(open) => {
          if (!open) setIconTarget(null);
        }}
        onConfirm={async (value) => {
          if (!iconTarget) return;
          await editResource(
            { basePath: "/api/system/menu" },
            { ...iconTarget, icon: value }
          );

          await refreshMenuTree();
          message.success("图标已更新");
          setIconTarget(null);
        }}
      />
    </PageContainer>
  );
}
