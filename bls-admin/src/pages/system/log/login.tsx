import CrudTablePage from "@/components/CrudTablePage";
import { useDict } from "@/hooks/useDict";
import { type LoginLogRecord } from "@/services/system/log";
import type { ProColumns } from "@ant-design/pro-components";
import { Tag } from "antd";

export default function LoginLogPage() {
  const { valueEnum: loginTypeValueEnum } = useDict("sys_login_type");
  const { valueEnum: statusValueEnum } = useDict("sys_status");

  const columns: ProColumns<LoginLogRecord>[] = [
    { title: "用户名", dataIndex: "username", copyable: true },
    { title: "租户ID", dataIndex: "tenantId", search: false, copyable: true },
    {
      title: "登录类型",
      dataIndex: "loginType",
      valueType: "select",
      valueEnum: loginTypeValueEnum,
      render: (_, record) =>
        loginTypeValueEnum?.[record.loginType ?? ""]?.text ??
        record.loginType ??
        "-",
    },
    {
      title: "状态",
      dataIndex: "loginStatus",
      valueType: "select",
      valueEnum: statusValueEnum,
      render: (_, record) => (
        <Tag color={statusValueEnum[record.loginStatus]?.color ?? 'default'}>
          {statusValueEnum[record.loginStatus]?.text ?? record.loginStatus}
        </Tag>
      ),
    },
    {
      title: "失败原因",
      dataIndex: "failReason",
      search: false,
      ellipsis: true,
    },
    { title: "登录IP", dataIndex: "loginIp", search: true, copyable: true },
    {
      title: "requestId",
      dataIndex: "requestId",
      search: false,
      copyable: true,
    },
    {
      title: "userAgent",
      dataIndex: "userAgent",
      ellipsis: true,
      search: false,
      copyable: true,
    },
    {
      title: "登录时间",
      dataIndex: "loginTime",
      valueType: "dateTime",
      search: false,
    },
  ];

  return (
    <CrudTablePage
      title="登录日志"
      rowKey="logId"
      resource={{ basePath: "/api/system/log/login", list: "", status: false }}
      columns={columns}
      formColumns={[]}
      modalWidth={760}
      excelMetaKey="system-log-login"
      permissions={{
        import: "system:log:import",
        export: "system:log:export",
        status: "system:log:status",
        remove: "system:log:remove",
      }}
    />
  );
}
