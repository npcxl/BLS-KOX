import { DashboardOutlined, DownOutlined, LineChartOutlined, RiseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components';
import { Column, Line, Pie } from '@ant-design/plots';
import { Badge, Button, Col, List, Progress, Row, Space, Tag, Typography } from 'antd';
import DashboardRealtimeCard from '@/components/DashboardRealtimeCard';

const trendData = [
  { day: '06-17', value: 82000 },
  { day: '06-18', value: 86000 },
  { day: '06-19', value: 91000 },
  { day: '06-20', value: 88000 },
  { day: '06-21', value: 104000 },
  { day: '06-22', value: 98000 },
  { day: '06-23', value: 101000 },
  { day: '06-24', value: 128560 },
];

const orderProductData = [
  { day: '06-18', type: '订单', value: 980 },
  { day: '06-18', type: '产品', value: 1040 },
  { day: '06-19', type: '订单', value: 760 },
  { day: '06-19', type: '产品', value: 830 },
  { day: '06-20', type: '订单', value: 690 },
  { day: '06-20', type: '产品', value: 780 },
  { day: '06-21', type: '订单', value: 1400 },
  { day: '06-21', type: '产品', value: 1180 },
  { day: '06-22', type: '订单', value: 760 },
  { day: '06-22', type: '产品', value: 920 },
  { day: '06-23', type: '订单', value: 880 },
  { day: '06-23', type: '产品', value: 1100 },
  { day: '06-24', type: '订单', value: 1320 },
  { day: '06-24', type: '产品', value: 1180 },
];

const categoryData = [
  { type: '电子元件', value: 32.6 },
  { type: '机械设备', value: 28.1 },
  { type: '五金配件', value: 18.7 },
  { type: '塑料制品', value: 11.3 },
  { type: '其他', value: 9.3 },
];

const recentOrders = [
  { no: 'SO20260524001', customer: '华东电子有限公司', product: '电阻器 10KΩ', amount: '28,560.00', status: '已完成', time: '2026-05-24 09:45' },
  { no: 'SO20260523008', customer: '深圳精密科技', product: '精密轴承 6205', amount: '16,800.00', status: '生产中', time: '2026-05-23 16:20' },
  { no: 'SO20260523007', customer: '杭州智能设备', product: '伺服电机 200W', amount: '42,300.00', status: '待发货', time: '2026-05-23 14:10' },
  { no: 'SO20260522015', customer: '苏州制造中心', product: '不锈钢螺丝 M8', amount: '6,780.00', status: '已发货', time: '2026-05-22 11:30' },
];

const notices = [
  { title: '原材料库存低于安全线', time: '09:20', color: 'red' },
  { title: '今日新增订单 12 笔', time: '10:30', color: 'blue' },
  { title: '设备巡检任务已完成', time: '14:00', color: 'green' },
  { title: '系统备份已成功', time: '16:10', color: 'gold' },
];

const shortcuts = ['新增订单', '生产计划', '库存盘点', '设备巡检', '报表中心', '客户管理'];

const orderStatusMap = {
  已完成: 'green',
  待发货: 'gold',
  生产中: 'processing',
  已发货: 'blue',
} as const;

export default function DashboardPage() {
  const lineConfig = {
    data: trendData,
    xField: 'day',
    yField: 'value',
    smooth: true,
    autoFit: true,
    height: 280,
    padding: [24, 8, 24, 8],
    color: '#2563eb',
    areaStyle: { fill: 'l(90) 0:#dbeafe 1:#eff6ff' },
    lineStyle: { lineWidth: 3 },
    point: { size: 4, shape: 'circle' },
    xAxis: { tickLine: null, line: { style: { stroke: '#e2e8f0' } } },
    yAxis: { label: { formatter: (v: string) => `${Number(v) / 1000}k` } },
    tooltip: { formatter: (datum: { value: number }) => ({ name: '销售额', value: `¥ ${datum.value.toLocaleString()}` }) },
  };

  const columnConfig = {
    data: orderProductData,
    xField: 'day',
    yField: 'value',
    seriesField: 'type',
    isGroup: true,
    autoFit: true,
    height: 280,
    padding: [24, 8, 24, 8],
    columnWidthRatio: 0.64,
    color: ['#2563eb', '#22c55e'],
    legend: { position: 'top-left' as const },
  };

  const pieConfig = {
    data: categoryData,
    angleField: 'value',
    colorField: 'type',
    radius: 0.92,
    innerRadius: 0.68,
    legend: { position: 'bottom' as const },
    label: { type: 'inner', offset: '-50%', content: '{value}%', style: { fill: '#fff', fontSize: 12, textAlign: 'center' as const } },
    statistic: {
      title: { content: '产品总数' },
      content: { style: { fontSize: '24px', fontWeight: 700 }, content: '2,856' },
    },
  };

  return (
    <PageContainer title="仪表盘" subTitle="经营数据总览、任务提醒与快速操作" contentStyle={{ paddingInline: 0 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatisticCard statistic={{ title: '今日销售额', value: '¥ 128,560', description: <Tag color="green">较昨日 +12.5%</Tag> }} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatisticCard statistic={{ title: '本月订单量', value: 1286, description: <Tag color="green">较上月 +8.7%</Tag> }} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatisticCard statistic={{ title: '库存预警', value: 32, description: <Tag color="red">较昨日 +5</Tag> }} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatisticCard statistic={{ title: '生产完成率', value: '92.6%', description: <Tag color="green">较昨日 +4.1%</Tag> }} />
        </Col>
      </Row>

      <div style={{ marginTop: 16, columnGap: 16, columnCount: 2 }}>
        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard
            title={
              <Space>
                <LineChartOutlined />
                <span>销售趋势</span>
              </Space>
            }
            extra={
              <Space>
                <Button type="text" size="small">近7天</Button>
                <Button type="text" size="small">近30天</Button>
                <Button type="text" size="small">近90天</Button>
              </Space>
            }
          >
            <Line {...lineConfig} />
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard
            title={
              <Space>
                <ThunderboltOutlined />
                <span>产品分类占比</span>
              </Space>
            }
          >
            <Pie {...pieConfig} />
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard
            title={
              <Space>
                <RiseOutlined />
                <span>订单 / 产品对比</span>
              </Space>
            }
          >
            <Column {...columnConfig} />
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard
            title={
              <Space>
                <Badge status="processing" />
                <span>最近通知</span>
              </Space>
            }
            extra={<Button type="link" size="small">查看更多</Button>}
          >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              {notices.map((item) => (
                <Space key={item.title} style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Space size={10}>
                    <Badge color={item.color} />
                    <Typography.Text>{item.title}</Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">{item.time}</Typography.Text>
                </Space>
              ))}
            </Space>
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard title="最近订单" extra={<Button type="link" size="small">查看全部</Button>}>
            <List
              itemLayout="vertical"
              dataSource={recentOrders}
              split={false}
              renderItem={(item) => (
                <List.Item style={{ paddingInline: 0, paddingBlock: 14, borderBottom: '1px solid #f1f5f9' }}>
                  <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} md={7}>
                      <Space direction="vertical" size={2}>
                        <Typography.Text strong>{item.no}</Typography.Text>
                        <Typography.Text type="secondary">{item.customer}</Typography.Text>
                      </Space>
                    </Col>
                    <Col xs={24} md={6}>
                      <Typography.Text>{item.product}</Typography.Text>
                    </Col>
                    <Col xs={12} md={4}>
                      <Typography.Text strong>¥ {item.amount}</Typography.Text>
                    </Col>
                    <Col xs={12} md={3}>
                      <Tag color={orderStatusMap[item.status as keyof typeof orderStatusMap]}>{item.status}</Tag>
                    </Col>
                    <Col xs={24} md={4}>
                      <Typography.Text type="secondary">{item.time}</Typography.Text>
                    </Col>
                  </Row>
                </List.Item>
              )}
            />
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard title="快捷入口" bodyStyle={{ paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {shortcuts.map((item, index) => (
                <Button
                  key={item}
                  icon={index % 2 === 0 ? <RiseOutlined /> : <ThunderboltOutlined />}
                  style={{
                    height: 72,
                    borderRadius: 14,
                    justifyContent: 'flex-start',
                    paddingInline: 16,
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  <Space direction="vertical" size={0} align="start">
                    <span>{item}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>快速进入</span>
                  </Space>
                </Button>
              ))}
            </div>
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard bodyStyle={{ padding: 20 }}>
            <Space align="start" size={14}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'grid', placeItems: 'center', color: '#2563eb' }}>
                <DashboardOutlined />
              </div>
              <Space direction="vertical" size={4} style={{ flex: 1 }}>
                <Typography.Text strong>运营状态</Typography.Text>
                <Typography.Text type="secondary">今日更新于 2026-06-24 10:30</Typography.Text>
                <Progress percent={92} strokeColor="#2563eb" size={8} />
              </Space>
            </Space>
          </ProCard>
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <DashboardRealtimeCard />
        </div>

        <div style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <ProCard bodyStyle={{ padding: 20 }}>
            <Space align="start" size={14}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecfdf5', display: 'grid', placeItems: 'center', color: '#16a34a' }}>
                <DownOutlined />
              </div>
              <Space direction="vertical" size={4} style={{ flex: 1 }}>
                <Typography.Text strong>数据说明</Typography.Text>
                <Typography.Text type="secondary">当前页面为演示数据，只做演示使用。</Typography.Text>
                <Progress percent={100} strokeColor="#16a34a" size={8} showInfo={false} />
              </Space>
            </Space>
          </ProCard>
        </div>
      </div>
    </PageContainer>
  );
}
