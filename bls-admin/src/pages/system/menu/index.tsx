import CrudTablePage from "@/components/CrudTablePage";
import IconPicker, { getAntdIcon } from "@/components/IconPicker";
import { useDict } from "@/hooks/useDict";
import { editResource, listResource } from "@/services/system/crud";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";
import { App } from "antd";
import { useEffect, useState } from "react";

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

  const columns: ProColumns<MenuRecord>[] = [
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
    },
    { title: "排序", dataIndex: "sortNum", search: false, width: 80 },
  ];

  const formColumns: ProFormColumnsType<MenuRecord>[] = [
    {
      title: "上级菜单",
      dataIndex: "parentId",
      valueType: "treeSelect",
      initialValue: "000000",
      colProps: { xs: 24, md: 12 },
      formItemProps: { rules: [{ required: true, message: "请选择上级菜单" }] },
      fieldProps: {
        treeData: [
          { title: "根目录", value: "000000", key: "000000" },
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
      formItemProps: { rules: [{ required: true, message: "请输入菜单名称" }] },
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
  ];

  return (
    <>
      <CrudTablePage<MenuRecord>
        title="菜单管理"
        rowKey="menuId"
        resource={{ basePath: "/api/system/menu", status: false }}
        columns={columns}
        formColumns={formColumns}
        pagination={false}
        expandable={{ defaultExpandAllRows: true }}
        modalWidth={760}
        extraActions={(record) => [
          record.menuType !== "2" && (
            <a
              key="icon"
              onClick={() => {
                setIconTarget(record);
                setIconValue(record.icon);
              }}
            >
              图标
            </a>
          ),
        ]}
      />

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
    </>
  );
}
