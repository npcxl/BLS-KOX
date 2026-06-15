import { DashboardOutlined } from '@ant-design/icons';
import { PageContainer, ProCard, StatisticCard } from '@ant-design/pro-components';
import { Col, Row } from 'antd';

export default function DashboardPage() {
  return (
    <PageContainer title="仪表盘" subTitle="多租户系统总览占位页">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard statistic={{ title: '当前租户', value: '平台租户' }} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard statistic={{ title: '在线用户', value: 0 }} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard statistic={{ title: '今日请求', value: 0 }} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard statistic={{ title: '系统状态', value: '正常' }} />
        </Col>
      </Row>

      <ProCard
        style={{ marginTop: 16 }}
        title="欢迎使用 "
        headerBordered
        extra={<DashboardOutlined />}
      >
        仪表盘页面已接入，后续可以在这里扩展租户概览、用户增长、系统告警、访问趋势和快捷入口。
      </ProCard>
    </PageContainer>
  );
}
