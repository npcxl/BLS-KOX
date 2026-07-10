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
import { useMemo, useState } from "react";
import { usePageConfig } from "@/hooks/usePageConfig";

function OperationAuditTable() {
  const { valueEnum: businessTypeValueEnum } = useDict("sys_business_type");
  const { valueEnum: uploadStatusValueEnum } = useDict("sys_upload_status");
  const { proColumns: baseColumns } = usePageConfig("system_log_operation");

  const columns: ProColumns<OperationLogRecord>[] = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === "businessType") {
      return {
        ...col,
        valueEnum: businessTypeValueEnum,
        render: (_: any, record: OperationLogRecord) =>
          businessTypeValueEnum?.[record.businessType]?.text ?? record.businessType,
      };
    }
    if (col.dataIndex === "success") {
      return {
        ...col,
        valueEnum: uploadStatusValueEnum,
        render: (_: any, record: OperationLogRecord) => (
          <Tag color={uploadStatusValueEnum[record.success]?.color ?? 'default'}>
            {uploadStatusValueEnum[record.success]?.text ?? record.success}
          </Tag>
        ),
      };
    }
    return col;
  }), [baseColumns, businessTypeValueEnum, uploadStatusValueEnum]);

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
  const { proColumns: baseColumns } = usePageConfig("system_log_upload");

  const columns: ProColumns<UploadAuditRecord>[] = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === "accessType") {
      return {
        ...col,
        valueEnum: sys_access_type?.valueEnum,
        render: (_: any, record: UploadAuditRecord) =>
          sys_access_type?.valueEnum?.[record.accessType]?.text ?? record.accessType,
      };
    }
    if (col.dataIndex === "uploadStatus") {
      return {
        ...col,
        valueEnum: sys_upload_status?.valueEnum,
        render: (_: any, record: UploadAuditRecord) => (
          <Tag color={sys_upload_status?.valueEnum?.[record.uploadStatus]?.color ?? 'default'}>
            {sys_upload_status?.valueEnum?.[record.uploadStatus]?.text ?? record.uploadStatus}
          </Tag>
        ),
      };
    }
    return col;
  }), [baseColumns, sys_access_type, sys_upload_status]);

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
