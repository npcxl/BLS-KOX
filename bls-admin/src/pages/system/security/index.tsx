/**
 * P10: Security Center Dashboard
 */
import { request } from '@umijs/max';
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components';
import { Badge, Button, message, Popconfirm, Space, Tag, Typography, Descriptions } from 'antd';
import { ReloadOutlined, SafetyCertificateOutlined, FireOutlined, KeyOutlined, BugOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';

const riskColorMap: Record<string, string> = {
  LOW: 'green', MEDIUM: 'orange', HIGH: 'red', CRITICAL: 'magenta',
};

interface SecurityStats {
  recentEvents: number;
  tempBlockedIps: number;
  permBlockedIps: number;
  byRisk: Record<string, number>;
}

interface RiskRule {
  id: string;
  name: string;
  eventTypes: string[];
  threshold: number;
  windowSeconds: number;
  riskLevel: string;
  actions: string[];
  weight: number;
}

export default function SecurityCenterPage() {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        request<{ data: SecurityStats }>('/api/system/security/stats'),
        request<{ data: RiskRule[] }>('/api/system/security/rules'),
      ]);
      setStats(sRes.data ?? null);
      setRules(rRes.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <PageContainer
      header={{
        title: <Space><SafetyCertificateOutlined />安全中心</Space>,
      }}
    >
      {/* ====== 统计卡片 ====== */}
      <ProCard
        title="安全态势"
        extra={<Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading}>刷新</Button>}
        style={{ marginBottom: 16 }}
      >
        <StatisticCard.Group>
          <StatisticCard
            statistic={{
              title: '24h 安全事件',
              value: stats?.recentEvents ?? '-',
              icon: <BugOutlined />,
            }}
          />
          <StatisticCard
            statistic={{
              title: '临时封禁 IP',
              value: stats?.tempBlockedIps ?? '-',
              icon: <KeyOutlined />,
            }}
          />
          <StatisticCard
            statistic={{
              title: '黑名单 IP',
              value: stats?.permBlockedIps ?? '-',
              icon: <FireOutlined />,
            }}
          />
          <StatisticCard
            statistic={{
              title: '风险分布',
              value: ' ',
              description: (
                <Space size={4} wrap>
                  {stats?.byRisk ? Object.entries(stats.byRisk).map(([level, count]) => (
                    <Tag key={level} color={riskColorMap[level] ?? 'default'}>
                      {level}: {count}
                    </Tag>
                  )) : null}
                </Space>
              ),
            }}
          />
        </StatisticCard.Group>
      </ProCard>

      {/* ====== 风险规则 ====== */}
      <ProCard title="风险规则引擎" style={{ marginBottom: 16 }}>
        <ProTable<RiskRule>
          rowKey="id"
          dataSource={rules}
          search={false}
          pagination={false}
          options={false}
          columns={[
            { title: '规则名称', dataIndex: 'name' },
            { title: '事件类型', dataIndex: 'eventTypes', render: (_, r) => (
              <Space size={2} wrap>{r.eventTypes.map(t => <Tag key={t}>{t}</Tag>)}</Space>
            )},
            { title: '阈值', dataIndex: 'threshold', render: (_, r) => `${r.threshold} 次 / ${r.windowSeconds}s` },
            {
              title: '风险等级', dataIndex: 'riskLevel',
              render: (_, r) => <Tag color={riskColorMap[r.riskLevel]}>{r.riskLevel}</Tag>,
            },
            { title: '处置', dataIndex: 'actions', render: (_, r) => r.actions.join(', ') },
          ]}
        />
      </ProCard>

      {/* ====== 安全事件流 ====== */}
      <ProCard title="最近安全事件">
        <ProTable<any>
          rowKey="log_id"
          request={async (params) => {
            const res = await request<{ data: any[]; total: number }>('/api/system/security/events', {
              params: { pageNum: params.current, pageSize: params.pageSize, ...params },
            });
            return { data: res.data ?? [], total: res.total ?? 0, success: true };
          }}
          columns={[
            { title: '时间', dataIndex: 'createTime', width: 160, valueType: 'dateTime' },
            { title: '事件类型', dataIndex: 'eventType', width: 160 },
            { title: '标题', dataIndex: 'title', ellipsis: true },
            {
              title: '风险等级', dataIndex: 'riskLevel', width: 100,
              render: (_, r) => <Tag color={riskColorMap[r.riskLevel]}>{r.riskLevel}</Tag>,
            },
            { title: '用户', dataIndex: 'username', width: 100 },
            { title: 'IP', dataIndex: 'clientIp', width: 130 },
          ]}
          search={{ labelWidth: 80 }}
          pagination={{ defaultPageSize: 15 }}
        />
      </ProCard>

      {/* ====== IP 黑名单 ====== */}
      <ProCard title="IP 黑名单" style={{ marginTop: 16 }}>
        <ProTable<any>
          rowKey="id"
          request={async (params) => {
            const res = await request<{ data: any[]; total: number }>('/api/system/security/blacklist', {
              params: { pageNum: params.current, pageSize: params.pageSize, ip: (params as any).ip },
            });
            return { data: res.data ?? [], total: res.total ?? 0, success: true };
          }}
          columns={[
            { title: 'IP 地址', dataIndex: 'ipAddress', width: 150 },
            { title: '原因', dataIndex: 'reason', ellipsis: true },
            {
              title: '来源', dataIndex: 'source', width: 80,
              render: (_, r) => r.source === 'auto' ? <Tag>自动</Tag> : <Tag color="blue">手动</Tag>,
            },
            { title: '过期时间', dataIndex: 'expireAt', width: 160, valueType: 'dateTime' },
            { title: '创建人', dataIndex: 'createBy', width: 100 },
            {
              title: '操作', width: 80,
              render: (_, record) => (
                <Popconfirm title="确定解封?" onConfirm={async () => {
                  await request(`/api/system/security/blacklist/${record.id}`, { method: 'DELETE' });
                  message.success('已解封');
                }}>
                  <a>解封</a>
                </Popconfirm>
              ),
            },
          ]}
          search={{ labelWidth: 60 }}
          pagination={{ defaultPageSize: 10 }}
        />
      </ProCard>
    </PageContainer>
  );
}
