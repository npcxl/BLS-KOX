import CrudTablePage from "@/components/CrudTablePage";
import { useDict } from "@/hooks/useDict";
import { usePageConfig } from "@/hooks/usePageConfig";
import { type LoginLogRecord } from "@/services/system/log";
import type { ProColumns } from "@ant-design/pro-components";
import { Tag } from "antd";
import { useMemo } from "react";

export default function LoginLogPage() {
  const { valueEnum: loginTypeValueEnum } = useDict("sys_login_type");
  const { valueEnum: successValueEnum } = useDict("sys_upload_status");
  const { proColumns: baseColumns } = usePageConfig("system_log_login");

  const columns: ProColumns<LoginLogRecord>[] = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === "loginType") {
      return {
        ...col,
        valueEnum: loginTypeValueEnum,
        render: (_: any, record: LoginLogRecord) =>
          loginTypeValueEnum?.[record.loginType ?? ""]?.text ??
          record.loginType ??
          "-",
      };
    }
    if (col.dataIndex === "loginStatus") {
      return {
        ...col,
        valueEnum: successValueEnum,
        render: (_: any, record: LoginLogRecord) => (
          <Tag color={successValueEnum[record.loginStatus]?.color ?? 'default'}>
            {successValueEnum[record.loginStatus]?.text ?? record.loginStatus}
          </Tag>
        ),
      };
    }
    return col;
  }), [baseColumns, loginTypeValueEnum, successValueEnum]);

  return (
    <CrudTablePage
      title="登录日志"
      rowKey="logId"
      resource={{ basePath: "/api/system/log/login", list: "", status: false }}
      columns={columns}
      formColumns={[]}
      modalWidth={760}
      permissions={{
        import: "system:log:import",
        export: "system:log:export",
        status: "system:log:status",
        remove: "system:log:remove",
      }}
    />
  );
}
