import { useDict } from "@/hooks/useDict";
import { listLoginLogs, type LoginLogRecord } from "@/services/system/log";
import type { ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
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
        <Tag color={record.loginStatus === "0" ? "success" : "default"}>
          {record.loginStatus === "0" ? "成功" : "失败"}
        </Tag>
      ),
    },
    {
      title: "失败原因",
      dataIndex: "failReason",
      search: false,
      ellipsis: true,
    },
    { title: "登录IP", dataIndex: "loginIp", search: true },
    {
      title: "requestId",
      dataIndex: "requestId",
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
    <PageContainer title="登录日志" subTitle="查看系统用户登录记录">
      <ProTable<LoginLogRecord>
        rowKey="logId"
        columns={columns}
        request={async (params) => {
          const res = await listLoginLogs({
            ...params,
            pageNum: params.current,
            pageSize: params.pageSize,
          });
          return {
            data: res.data ?? [],
            total: res.total ?? res.data?.length ?? 0,
            success: res.code === 200 || res.success !== false,
          };
        }}
        search={{ labelWidth: 96 }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
      />
    </PageContainer>
  );
}
