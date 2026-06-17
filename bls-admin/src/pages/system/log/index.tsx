import { useDict, useMultiDict } from "@/hooks/useDict";
import {
  listOperationLogs,
  listUploadAudits,
  type OperationLogRecord,
  type UploadAuditRecord,
} from "@/services/system/log";
import type { ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { Tabs, Tag } from "antd";
import { useState } from "react";

function OperationAuditTable() {
  const { valueEnum: businessTypeValueEnum } = useDict("sys_business_type");

  const columns: ProColumns<OperationLogRecord>[] = [
    { title: "用户名", dataIndex: "username", copyable: true },
    { title: "模块", dataIndex: "moduleName", search: true },
    {
      title: "业务类型",
      dataIndex: "businessType",
      valueType: "select",
      valueEnum: businessTypeValueEnum,
      render: (_, record) =>
        businessTypeValueEnum?.[record.businessType]?.text ??
        record.businessType,
    },
    { title: "标题", dataIndex: "title", ellipsis: true },
    {
      title: "结果",
      dataIndex: "success",
      valueType: "select",
      valueEnum: {
        1: { text: "成功", status: "Success" },
        "0": { text: "失败", status: "Error" },
      },
      render: (_, record) => (
        <Tag color={record.success === 1 ? "success" : "error"}>
          {record.success === 1 ? "成功" : "失败"}
        </Tag>
      ),
    },
    { title: "请求方法", dataIndex: "requestMethod", search: false },
    {
      title: "请求地址",
      dataIndex: "requestUrl",
      search: false,
      ellipsis: true,
    },
    { title: "IP", dataIndex: "clientIp", search: true },
    // {
    //   title: "requestId",
    //   dataIndex: "requestId",
    //   search: false,
    //   copyable: true,
    // },
    {
      title: "操作时间",
      dataIndex: "operatorTime",
      valueType: "operatorTime",
      search: false,
    },
  ];

  return (
    <ProTable<OperationLogRecord>
      rowKey="logId"
      columns={columns}
      request={async (params) => {
        const res = await listOperationLogs({
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
  );
}

function UploadAuditTable() {
  const { sys_access_type, sys_upload_status } = useMultiDict([
    "sys_access_type",
    "sys_upload_status",
  ]);

  const columns: ProColumns<UploadAuditRecord>[] = [
    { title: "用户名", dataIndex: "username", copyable: true },
    { title: "模块", dataIndex: "moduleName", search: true },
    {
      title: "文件名",
      dataIndex: "originalName",
      search: true,
      ellipsis: true,
    },
    { title: "清洗名", dataIndex: "safeName", search: false, ellipsis: true },
    {
      title: "访问类型",
      dataIndex: "accessType",
      valueType: "select",
      valueEnum: sys_access_type?.valueEnum,
      render: (_, record) =>
        sys_access_type?.valueEnum?.[record.accessType]?.text ??
        record.accessType,
    },
    { title: "存储类型", dataIndex: "storageType", search: false },
    {
      title: "上传状态",
      dataIndex: "uploadStatus",
      valueType: "select",
      valueEnum: sys_upload_status?.valueEnum,
      render: (_, record) => (
        <Tag color={record.uploadStatus === "1" ? "success" : "error"}>
          {record.uploadStatus === "1" ? "成功" : "失败"}
        </Tag>
      ),
    },
    {
      title: "失败原因",
      dataIndex: "failReason",
      search: false,
      ellipsis: true,
    },
    { title: "IP", dataIndex: "clientIp", search: true },
    {
      title: "requestId",
      dataIndex: "requestId",
      search: false,
      copyable: true,
    },
    {
      title: "上传时间",
      dataIndex: "createTime",
      valueType: "dateTime",
      search: false,
    },
  ];

  return (
    <ProTable<UploadAuditRecord>
      rowKey="auditId"
      columns={columns}
      request={async (params) => {
        const res = await listUploadAudits({
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
  );
}

export default function SystemLogPage() {
  const [activeTab, setActiveTab] = useState("operation");

  return (
    <PageContainer title="日志中心" subTitle="操作审计与上传审计">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "operation",
            label: "操作审计",
            children: <OperationAuditTable />,
          },
          { key: "upload", label: "上传审计", children: <UploadAuditTable /> },
        ]}
      />
    </PageContainer>
  );
}
