import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Card, Col, Row, Statistic, Select, Space } from 'antd';
import { BarChartOutlined, DollarOutlined, ThunderboltOutlined, ApiOutlined } from '@ant-design/icons';
import { useEffect, useState, useRef, useMemo } from 'react';
import { request } from '@umijs/max';
import type { ProColumns, ActionType } from '@ant-design/pro-components';

interface UsageStats {
  today: { count: number; totalTokens: number; totalCost: number; avgElapsedMs: number };
  dailyTrend: Array<{ date: string; count: number; totalTokens: number; totalCost: number }>;
  modelStats: Array<{ modelName: string; count: number; totalTokens: number; totalCost: number; avgElapsedMs: number }>;
  endpointStats: Array<{ endpoint: string; count: number; totalTokens: number; totalCost: number }>;
  userStats: Array<{ username: string; userId: string; count: number; totalTokens: number; totalCost: number }>;
}

interface UsageRecord {
  usageId: string;
  username: string;
  modelName: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  elapsedMs: number;
  success: number;
  streamMode: number;
  createdAt: string;
}

const formatTokens = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};
const formatCost = (v: number | string) => `$${Number(v).toFixed(4)}`;

export default function AiUsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);
  const actionRef = useRef<ActionType>(undefined);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await request<{ code: number; data: UsageStats }>('/api/system/ai-usage/stats', { params: { days } });
      if (res.code === 200) setStats(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, [days]);

  const detailColumns: ProColumns<UsageRecord>[] = useMemo(() => [
    { title: '时间', dataIndex: 'createdAt', width: 160, valueType: 'dateTime', search: false },
    { title: '用户', dataIndex: 'username', width: 100, ellipsis: true },
    { title: '模型', dataIndex: 'modelName', width: 140 },
    { title: '端点', dataIndex: 'endpoint', width: 80 },
    { title: '总 Token', dataIndex: 'totalTokens', width: 100, search: false, render: (_, r) => formatTokens(r.totalTokens) },
    { title: '费用', dataIndex: 'estimatedCost', width: 100, search: false, render: (_, r) => formatCost(r.estimatedCost) },
    { title: '耗时', dataIndex: 'elapsedMs', width: 80, search: false, render: (_, r) => `${r.elapsedMs}ms` },
    {
      title: '状态', dataIndex: 'success', width: 70, search: false,
      valueEnum: { 1: { text: '成功', status: 'Success' }, 0: { text: '失败', status: 'Error' } },
    },
  ], []);

  const empty = <span style={{ color: '#999' }}>-</span>;

  return (
    <PageContainer>
      <Space style={{ marginBottom: 16 }}>
        <span>统计范围：</span>
        <Select value={days} onChange={setDays} style={{ width: 120 }}
          options={[
            { label: '今天', value: 1 }, { label: '近 7 天', value: 7 },
            { label: '近 30 天', value: 30 }, { label: '近 90 天', value: 90 },
          ]}
        />
      </Space>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="今日调用" value={stats?.today.count ?? 0} prefix={<ApiOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="今日 Token" value={formatTokens(stats?.today.totalTokens ?? 0)} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="今日费用" value={formatCost(stats?.today.totalCost ?? 0)} prefix={<DollarOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="平均耗时" value={`${stats?.today.avgElapsedMs ?? 0}ms`} prefix={<BarChartOutlined />} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="按模型统计" loading={loading}>
            <ProTable<UsageStats['modelStats'][number]>
              dataSource={stats?.modelStats ?? []}
              rowKey="modelName"
              search={false}
              options={false}
              pagination={false}
              columns={[
                { title: '模型', dataIndex: 'modelName' },
                { title: '次数', dataIndex: 'count', width: 80 },
                { title: 'Token', dataIndex: 'totalTokens', width: 100, render: (_, r) => formatTokens(r.totalTokens) },
                { title: '费用', dataIndex: 'totalCost', width: 100, render: (_, r) => formatCost(r.totalCost) },
                { title: '平均耗时', dataIndex: 'avgElapsedMs', width: 100, render: (_, r) => r.avgElapsedMs ? `${r.avgElapsedMs}ms` : empty },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="按端点统计" loading={loading}>
            <ProTable<UsageStats['endpointStats'][number]>
              dataSource={stats?.endpointStats ?? []}
              rowKey="endpoint"
              search={false}
              options={false}
              pagination={false}
              columns={[
                { title: '端点', dataIndex: 'endpoint' },
                { title: '次数', dataIndex: 'count', width: 80 },
                { title: 'Token', dataIndex: 'totalTokens', width: 100, render: (_, r) => formatTokens(r.totalTokens) },
                { title: '费用', dataIndex: 'totalCost', width: 100, render: (_, r) => formatCost(r.totalCost) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="按用户统计 Top 10" loading={loading}>
            <ProTable<UsageStats['userStats'][number]>
              dataSource={stats?.userStats ?? []}
              rowKey="userId"
              search={false}
              options={false}
              pagination={false}
              columns={[
                { title: '用户', dataIndex: 'username' },
                { title: '次数', dataIndex: 'count', width: 80 },
                { title: 'Token', dataIndex: 'totalTokens', width: 100, render: (_, r) => formatTokens(r.totalTokens) },
                { title: '费用', dataIndex: 'totalCost', width: 100, render: (_, r) => formatCost(r.totalCost) },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="每日趋势" loading={loading}>
            <ProTable<UsageStats['dailyTrend'][number]>
              dataSource={stats?.dailyTrend ?? []}
              rowKey="date"
              search={false}
              options={false}
              pagination={false}
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '次数', dataIndex: 'count', width: 80 },
                { title: 'Token', dataIndex: 'totalTokens', width: 100, render: (_, r) => formatTokens(r.totalTokens) },
                { title: '费用', dataIndex: 'totalCost', width: 100, render: (_, r) => formatCost(r.totalCost) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="调用明细">
        <ProTable<UsageRecord>
          actionRef={actionRef}
          rowKey="usageId"
          columns={detailColumns}
          request={async (params) => {
            const res = await request<{ code: number; data: UsageRecord[]; total: number }>('/api/system/ai-usage/list', {
              params: { pageNum: params.current, pageSize: params.pageSize },
            });
            return { data: res.data ?? [], total: res.total ?? 0, success: res.code === 200 };
          }}
          search={false}
          scroll={{ x: 900 }}
        />
      </Card>
    </PageContainer>
  );
}
