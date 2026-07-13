import { useRealtime } from '@/components/GlobalRealtimeProvider';
import { ReloadOutlined, RadarChartOutlined } from '@ant-design/icons';
import { ProCard, StatisticCard } from '@ant-design/pro-components';
import { Badge, Button, Descriptions, Progress, Space, Typography } from 'antd';
import React, { useMemo } from 'react';

function formatBytes(bytes: number) {
  const gb = bytes / 1024 / 1024 / 1024;
  return `${gb.toFixed(2)} GB`;
}

export default function DashboardRealtimeCard() {
  const { info, connected, reconnect } = useRealtime();

  const loadPercent = useMemo(() => info?.usedMemoryPercent ?? 0, [info]);

  return (
    <ProCard
      title={
        <Space>
          <RadarChartOutlined />
          <span>系统信息</span>
        </Space>
      }
      extra={
        <Space>
          <Badge status={connected ? 'success' : 'default'} text={connected ? '已连接' : '未连接'} />
          <Button icon={<ReloadOutlined />} onClick={reconnect}>重连</Button>
        </Space>
      }
    >
      {info ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <StatisticCard.Group direction="row">
            <StatisticCard statistic={{ title: '主机', value: info.hostname }} />
            <StatisticCard statistic={{ title: 'CPU 负载', value: `${info.cpuUsagePercent}%` }} />
            <StatisticCard statistic={{ title: '运行时长', value: `${Math.floor(info.uptimeSeconds / 3600)} 小时` }} />
          </StatisticCard.Group>
          <Progress percent={loadPercent} strokeColor="#2563eb" />
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="平台">{info.platform}</Descriptions.Item>
            <Descriptions.Item label="架构">{info.arch}</Descriptions.Item>
            <Descriptions.Item label="内存总量">{formatBytes(info.totalMemory)}</Descriptions.Item>
            <Descriptions.Item label="已使用">{formatBytes(info.usedMemory)}</Descriptions.Item>
            <Descriptions.Item label="空闲">{formatBytes(info.freeMemory)}</Descriptions.Item>
            <Descriptions.Item label="网络接口">{info.networkInterfaces}</Descriptions.Item>
          </Descriptions>
          <Typography.Text type="secondary">更新时间：{new Date(info.timestamp).toLocaleString()}</Typography.Text>
        </Space>
      ) : null}
    </ProCard>
  );
}
