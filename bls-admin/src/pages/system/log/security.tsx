import CrudTablePage from "@/components/CrudTablePage";
import { usePageConfig } from "@/hooks/usePageConfig";
import { Tag } from "antd";
import { useMemo } from "react";

const riskColor: Record<string, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red', CRITICAL: 'red' };

type SecurityLogRecord = {
  logId: string; eventType: string; riskLevel: string; title: string;
  username?: string; route?: string; method?: string; clientIp?: string; source?: string; createTime: string;
};

export default function SecurityLogPage() {
  const { proColumns: baseColumns } = usePageConfig("system_log_security");

  const columns = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === "riskLevel") {
      return { ...col, render: (_: any, r: SecurityLogRecord) => <Tag color={riskColor[r.riskLevel] ?? 'default'}>{r.riskLevel}</Tag> };
    }
    return col;
  }), [baseColumns]);

  return (
    <CrudTablePage
      title="安全日志"
      rowKey="logId"
      resource={{ basePath: "/api/system/log/security", list: "" }}
      columns={columns}
      formColumns={[]}
      showCreateButton={false}
      showEditAction={false}
    />
  );
}
