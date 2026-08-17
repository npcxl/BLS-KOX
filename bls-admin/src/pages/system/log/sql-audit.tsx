import { PageContainer, ProTable } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import { listSqlAudits, type SqlAuditRecord } from "@/services/system/log";
import { Tag, Tooltip } from "antd";
import { useState } from "react";

const operationColor: Record<string, string> = {
  query: 'blue',
  query_one: 'geekblue',
  execute: 'orange',
  transaction: 'purple',
};

const ellipsisText = (value?: string | null, width = 240) =>
  value ? (
    <Tooltip title={value}>
      <span style={{ display: 'inline-block', maxWidth: width }} className="ellipsis-text">
        {value}
      </span>
    </Tooltip>
  ) : (
    '-'
  );

export default function SqlAuditPage() {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const columns: ProColumns<SqlAuditRecord>[] = [
    {
      title: '操作类型',
      dataIndex: 'operation',
      width: 110,
      render: (_, r) => (
        <Tag color={operationColor[r.operation] ?? 'default'}>{r.operation}</Tag>
      ),
    },
    { title: '用户名', dataIndex: 'username', width: 110, search: true },
    { title: '错误码', dataIndex: 'errorCode', width: 120, render: (_, r) => ellipsisText(r.errorCode, 100) },
    { title: '错误信息', dataIndex: 'errorMessage', ellipsis: true, render: (_, r) => ellipsisText(r.errorMessage) },
    { title: '客户端IP', dataIndex: 'clientIp', width: 130, search: true },
    {
      title: 'SQL 语句',
      dataIndex: 'sqlText',
      ellipsis: true,
      search: false,
      render: (_, r) => {
        const expanded = expandedRows[r.auditId];
        const text = r.sqlText ?? '';
        return (
          <div style={{ cursor: 'pointer' }} onClick={() => setExpandedRows((s) => ({ ...s, [r.auditId]: !s[r.auditId] }))}>
            <pre style={{
              margin: 0,
              whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 480,
              fontFamily: 'monospace',
              fontSize: 12,
              background: expanded ? '#f5f5f5' : undefined,
              padding: expanded ? 8 : 0,
              borderRadius: 4,
            }}>
              {expanded ? text : text.slice(0, 120) + (text.length > 120 ? ' …' : '')}
            </pre>
          </div>
        );
      },
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      valueType: 'dateTime',
      search: false,
    },
  ];

  return (
    <PageContainer title="SQL 审计" subTitle="记录所有执行报错的 SQL 语句">
      <ProTable<SqlAuditRecord>
        rowKey="auditId"
        columns={columns}
        request={async (params) => {
          const res = await listSqlAudits({
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
        options={{ density: false }}
        scroll={{ x: 1200 }}
      />
    </PageContainer>
  );
}
