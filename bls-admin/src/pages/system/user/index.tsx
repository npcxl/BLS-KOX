import CrudTablePage from "@/components/CrudTablePage";
import { useMultiDict } from "@/hooks/useDict";
import { listResource } from "@/services/system/crud";
import type {
  ProColumns,
  ProFormColumnsType,
} from "@ant-design/pro-components";
import { request } from "@umijs/max";
import { useEffect, useState } from "react";
import { DeptRecord } from "../dept";
export type UserRecord = {
  userId: string;
  tenantId: string;
  username: string;
  nickname: string;
  realName?: string;
  avatar?: string;
  gender?: "0" | "1" | "2";
  email?: string;
  phone?: string;
  deptId?: string;
  deptName?: string;
  isAdmin: "0" | "1";
  status: "0" | "1";
  remark?: string;
  roleIds?: string[] | string;
  roleNames?: string[] | string;
  createTime?: string;
};

function UserPageInner() {
  const { sys_status, sys_gender, sys_yes_no } = useMultiDict([
    "sys_status",
    "sys_gender",
    "sys_yes_no",
  ]);

  // 获取角色列表用于多选器
  const [roleOptions, setRoleOptions] = useState<
    { label: string; value: string }[]
  >([]);
  useEffect(() => {
    request<{ data?: { roleId: string; roleName: string }[] }>(
      "/api/system/role/list",
      {
        method: "GET",
        params: { pageSize: 1000 },
      }
    ).then((res) => {
      const list = res?.data ?? [];
      setRoleOptions(
        list.map((item) => ({ label: item.roleName, value: item.roleId }))
      );
    });
  }, []);

  const statusValueEnum = sys_status?.valueEnum ?? {};
  const genderValueEnum = sys_gender?.valueEnum ?? {};
  const yesNoValueEnum = sys_yes_no?.valueEnum ?? {};
  const statusFormEnum = Object.fromEntries(
    Object.entries(statusValueEnum).map(([k, v]) => [k, v.text])
  );
  const genderFormEnum = Object.fromEntries(
    Object.entries(genderValueEnum).map(([k, v]) => [k, v.text])
  );
  const yesNoFormEnum = Object.fromEntries(
    Object.entries(yesNoValueEnum).map(([k, v]) => [k, v.text])
  );

  const columns: ProColumns<UserRecord>[] = [
    { title: "用户名", dataIndex: "username", copyable: true, ellipsis: true },
    { title: "昵称", dataIndex: "nickname", search: false },
    { title: "真实姓名", dataIndex: "realName", search: false },
    { title: "手机号", dataIndex: "phone", search: false },
    { title: "邮箱", dataIndex: "email", search: false, ellipsis: true },
    {
      title: "管理员",
      dataIndex: "isAdmin",
      search: false,
      valueEnum: yesNoValueEnum,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: statusValueEnum,
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      valueType: "dateTime",
      search: false,
    },
  ];

  function buildDeptTreeSelectData(depts: DeptRecord[] = []): any[] {
    return depts.map((item) => ({
      title: item.deptName,
      value: item.deptId,
      key: item.deptId,
      children: item.children
        ? buildDeptTreeSelectData(item.children)
        : undefined,
    }));
  }

  const [deptTree, setDeptTree] = useState<DeptRecord[]>([]);

  useEffect(() => {
    listResource<DeptRecord>({ basePath: "/api/system/dept" }).then((res) => {
      if (res.code === 200 && res.data) {
        setDeptTree(res.data);
      }
    });
  }, []);
  const formColumns: ProFormColumnsType<UserRecord>[] = [
    {
      title: "用户名",
      dataIndex: "username",
      formItemProps: { rules: [{ required: true, message: "请输入用户名" }] },
    },
    {
      title: "密码",
      dataIndex: "password",
      valueType: "password",
      tooltip: "新增时为空则使用默认密码 123456，编辑时留空不修改",
    } as any,
    {
      title: "昵称",
      dataIndex: "nickname",
      formItemProps: { rules: [{ required: true, message: "请输入昵称" }] },
    },
    { title: "真实姓名", dataIndex: "realName" },
    {
      title: "部门",
      dataIndex: "deptId",
      valueType: "treeSelect",
      fieldProps: {
        treeData: buildDeptTreeSelectData(deptTree),
        placeholder: "请选择部门",
      },
    },
    { title: "手机号", dataIndex: "phone" },
    { title: "邮箱", dataIndex: "email" },
    {
      title: "性别",
      dataIndex: "gender",
      valueType: "select",
      initialValue: "2",
      valueEnum: genderFormEnum,
    },
    {
      title: "管理员",
      dataIndex: "isAdmin",
      valueType: "select",
      initialValue: "0",
      valueEnum: yesNoFormEnum,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      initialValue: "0",
      valueEnum: statusFormEnum,
    },
    {
      title: "角色",
      dataIndex: "roleIds",
      valueType: "select",
      render: (_, record) => {
        const names = Array.isArray(record.roleNames)
          ? record.roleNames
          : typeof record.roleNames === "string"
          ? record.roleNames.split(",").filter(Boolean)
          : [];
        return names.length ? names.join(", ") : "-";
      },
      fieldProps: {
        mode: "multiple",
        options: roleOptions,
        placeholder: "请选择角色",
      },
      transform: (value) => ({ roleIds: Array.isArray(value) ? value : [] }),
    },
    { title: "备注", dataIndex: "remark", valueType: "textarea" },
  ];

  return (
    <CrudTablePage<UserRecord>
      title="用户管理"
      rowKey="userId"
      resource={{ basePath: "/api/system/user", status: false }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={820}
      beforeSubmit={(values, current) => {
        const hasRoleIds = Object.prototype.hasOwnProperty.call(
          values,
          "roleIds"
        );
        const nextRoleIds = hasRoleIds
          ? Array.isArray((values as any).roleIds)
            ? (values as any).roleIds
            : []
          : current?.roleIds;

        return {
          ...current,
          ...values,
          deptId:
            values.deptId !== undefined && values.deptId !== null
              ? values.deptId
              : current?.deptId,
          ...(hasRoleIds ? { roleIds: nextRoleIds } : {}),
        };
      }}
      permissions={{
        create: "system:user:create",
        edit: "system:user:edit",
        remove: "system:user:remove",
        status: "system:user:status",
        import: "system:user:import",
        export: "system:user:export",
      }}
    />
  );
}

export default UserPageInner;
