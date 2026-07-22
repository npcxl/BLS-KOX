import { PageContainer } from '@ant-design/pro-components';
import { Card, Col, Row, Statistic, Table, DatePicker, Select, Space } from 'antd';
import { BarChartOutlined, DollarOutlined, ThunderboltOutlined, ApiOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { request } from '@umijs/max';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface UsageStats {
  today: { count: number; totalTokens: number; totalCost: number; avgElapsedMs: number };
  dailyTrend: Array<{ date: string; count: number; totalTokens: number; totalCost: number }>;
  modelStats: Array<{ modelName: string; count: number; totalTokens: number; totalCost: number; avgElapsedMs: number }>;
  endpointStats: Array<{ endpoint: string; count: number; totalTokens: number; totalCost: number }>;
  userStats: Array<{ username: string; userId: string; count: number; totalTokens: number; totalCost: number }>;
}

interface UsageRecord {
  usageId: string;
  tenantId: string;
  userId: string;
  username: string;
  modelName: string;
  provider: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  elapsedMs: number;
  success: number;
  errorMsg?: string;
  streamMode: number;
  createdAt: string;
}

export default function AiUsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [recordLoading, setRecordLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await request<{ code: number; data: UsageStats }>('/api/system/ai-usage/stats', {
        params: { days },
      });
      if (res.code === 200) setStats(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchRecords = async (page = 1, pageSize = 10) => {
    setRecordLoading(true);
    try {
      const res = await request<{ code: number; data: UsageRecord[]; total: number }>(
        '/api/system/ai-usage/list',
        { params: { pageNum: page, pageSize } },
      );
      if (res.code === 200) {
        setRecords(res.data || []);
        setRecordTotal(res.total || 0);
      }
    } catch { /* ignore */ }
    setRecordLoading(false);
  };

  useEffect(() => { fetchStats(); }, [days]);
  useEffect(() => { fetchRecords(recordPage); }, [recordPage]);

  const formatTokens = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  };

  const formatCost = (v: number) => `$${v.toFixed(4)}`;

  const columns = [
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => v?.slice(0, 19) },
    { title: '用户', dataIndex: 'username', width: 100 },
    { title: '模型', dataIndex: 'modelName', width: 140 },
    { title: '端点', dataIndex: 'endpoint', width: 80 },
    { title: 'Prompt', dataIndex: 'promptTokens', width: 90, render: (v: number) => formatTokens(v) },
    { title: 'Completion', dataIndex: 'completionTokens', width: 100, render: (v: number) => formatTokens(v) },
    { title: '总计', dataIndex: 'totalTokens', width: 90, render: (v: number) => formatTokens(v) },
    { title: '费用', dataIndex: 'estimatedCost', width: 90, render: (v: number) => formatCost(v) },
    { title: '耗时', dataIndex: 'elapsedMs', width: 80, render: (v: number) => `${v}ms` },
    { title: '流式', dataIndex: 'streamMode', width: 60, render: (v: number) => v ? '是' : '否' },
    { title: '状态', dataIndex: 'success', width: 60, render: (v: number) => v ? '✅' : '❌' },
  ];

  return (
    <PageContainer>
      <Space style={{ marginBottom: 16 }}>
        <span>统计范围：</span>
        <Select value={days} onChange={setDays} style={{ width: 120 }}
          options={[
            { label: '今天', value: 1 },
            { label: '近 7 天', value: 7 },
            { label: '近 30 天', value: 30 },
            { label: '近 90 天', value: 90 },
          ]}
        />
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="今日调用" value={stats?.today.count ?? 0} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="今日 Token" value={formatTokens(stats?.today.totalTokens ?? 0)} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="今日费用" value={formatCost(stats?.today.totalCost ?? 0)} prefix={<DollarOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="平均耗时" value={`${stats?.today.avgElapsedMs ?? 0}ms`} prefix={<BarChartOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="按模型统计" loading={loading}>
            <Table
              dataSource={stats?.modelStats ?? []}
              rowKey="modelName"
              pagination={false}
              size="small"
              columns={[
                { title: '模型', dataIndex: 'modelName' },
                { title: '次数', dataIndex: 'count' },
                { title: 'Token', dataIndex: 'totalTokens', render: (v: number) => formatTokens(v) },
                { title: '费用', dataIndex: 'totalCost', render: (v: number) => formatCost(v) },
                { title: '平均耗时', dataIndex: 'avgElapsedMs', render: (v: number) => `${v}ms` },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="按端点统计" loading={loading}>
            <Table
              dataSource={stats?.endpointStats ?? []}
              rowKey="endpoint"
              pagination={false}
              size="small"
              columns={[
                { title: '端点', dataIndex: 'endpoint' },
                { title: '次数', dataIndex: 'count' },
                { title: 'Token', dataIndex: 'totalTokens', render: (v: number) => formatTokens(v) },
                { title: '费用', dataIndex: 'totalCost', render: (v: number) => formatCost(v) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="按用户统计 Top 10" loading={loading}>
            <Table
              dataSource={stats?.userStats ?? []}
              rowKey="userId"
              pagination={false}
              size="small"
              columns={[
                { title: '用户', dataIndex: 'username' },
                { title: '次数', dataIndex: 'count' },
                { title: 'Token', dataIndex: 'totalTokens', render: (v: number) => formatTokens(v) },
                { title: '费用', dataIndex: 'totalCost', render: (v: number) => formatCost(v) },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="每日趋势" loading={loading}>
            <Table
              dataSource={stats?.dailyTrend ?? []}
              rowKey="date"
              pagination={false}
              size="small"
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '次数', dataIndex: 'count' },
                { title: 'Token', dataIndex: 'totalTokens', render: (v: number) => formatTokens(v) },
                { title: '费用', dataIndex: 'totalCost', render: (v: number) => formatCost(v) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="调用明细">
        <Table<UsageRecord>
          dataSource={records}
          rowKey="usageId"
          columns={columns}
          loading={recordLoading}
          pagination={{
            current: recordPage,
            total: recordTotal,
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setRecordPage(p),
          }}
          size="small"
          scroll={{ x: 1000 }}
        />
      </Card>
    </PageContainer>
  );
}
