import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import {
  Card, Form, Input, Button, message, Typography, Space, Tag, Select, Table,
  Descriptions, Statistic, Row, Col, Progress, Collapse,
} from 'antd';
import {
  AuditOutlined, SendOutlined, WarningOutlined, SafetyOutlined,
  CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { request } from '@umijs/max';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

const riskColorMap: Record<string, string> = {
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#52c41a',
  none: '#1890ff',
};

const riskLabelMap: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  none: '无风险',
};

const severityColorMap: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'green',
};

export default function AiAuditPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setResult(null);
      const res = await request('/api/ai/audit/analyze', {
        method: 'POST',
        data: values,
      });
      if (res.code === 0) {
        setResult(res.data);
        message.success('分析完成');
      } else {
        message.error(res.message || '分析失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer
      header={{
        title: <Space><AuditOutlined /><span>审计分析</span></Space>,
        subTitle: '分析安全日志，识别风险并给出应对建议',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Card>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ logType: 'all' }}
          >
            <Form.Item name="logType" label="日志类型">
              <Select
                options={[
                  { label: '全部类型', value: 'all' },
                  { label: '登录日志', value: 'login' },
                  { label: '接口访问', value: 'api_access' },
                  { label: '限流触发', value: 'rate_limit' },
                  { label: '异常日志', value: 'error' },
                ]}
              />
            </Form.Item>
            <Form.Item name="timeRange" label="时间范围（可选）">
              <Input placeholder="例如: 最近24小时、2026-07-18 至 2026-07-19" />
            </Form.Item>
            <Form.Item
              name="logData"
              label="日志数据"
              rules={[
                { required: true, message: '请输入日志数据' },
                { max: 10000, message: '日志数据不能超过 10000 字' },
              ]}
            >
              <TextArea
                rows={8}
                placeholder={`粘贴日志内容，支持多行...

示例格式：
2026-07-19 03:15:23 login_fail ip=192.168.1.100 user=admin attempt=5
2026-07-19 03:15:25 login_fail ip=192.168.1.100 user=admin attempt=6
2026-07-19 03:16:00 login_success ip=10.0.0.1 user=support
2026-07-19 04:30:00 rate_limit_trigger ip=203.0.113.50 path=/api/user/list`}
                maxLength={10000}
                showCount
              />
            </Form.Item>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={loading}
              onClick={handleAnalyze}
              size="large"
            >
              开始分析
            </Button>
          </Form>
        </Card>

        {loading && (
          <Card style={{ marginTop: 16, textAlign: 'center', padding: 40 }}>
            <span>AI 正在分析日志...</span>
          </Card>
        )}

        {result && !loading && (
          <div style={{ marginTop: 16 }}>
            {/* 风险总览 */}
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={24}>
                <Col xs={24} md={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>风险等级</div>
                    <Tag
                      color={riskColorMap[result.riskLevel] || '#1890ff'}
                      style={{ fontSize: 20, padding: '4px 20px' }}
                    >
                      {riskLabelMap[result.riskLevel] || result.riskLevel}
                    </Tag>
                  </div>
                </Col>
                {result.statistics && (
                  <>
                    <Col xs={24} md={8}>
                      <Statistic title="事件总数" value={result.statistics.totalEvents || 0} />
                    </Col>
                    <Col xs={24} md={8}>
                      <Statistic title="独立 IP 数" value={result.statistics.uniqueIps || 0} />
                    </Col>
                  </>
                )}
              </Row>
              {result.summary && (
                <Paragraph style={{ marginTop: 16, marginBottom: 0, fontSize: 14 }}>
                  <Text strong>总体评估：</Text>{result.summary}
                </Paragraph>
              )}
            </Card>

            {/* 发现问题列表 */}
            {result.findings && result.findings.length > 0 && (
              <Card title={`发现 ${result.findings.length} 个问题`}>
                <Table
                  dataSource={result.findings.map((f: any, i: number) => ({ ...f, key: i }))}
                  pagination={false}
                  columns={[
                    {
                      title: '严重程度', dataIndex: 'severity', key: 'severity', width: 100,
                      render: (v: string) => (
                        <Tag color={severityColorMap[v] || 'default'}>{v.toUpperCase()}</Tag>
                      ),
                    },
                    {
                      title: '类型', dataIndex: 'type', key: 'type', width: 140,
                      render: (v: string) => <Tag>{v}</Tag>,
                    },
                    { title: '描述', dataIndex: 'description', key: 'description' },
                    {
                      title: '建议', dataIndex: 'recommendation', key: 'recommendation', width: 300,
                      render: (v: string) => <Text type="secondary">{v}</Text>,
                    },
                  ]}
                  expandable={{
                    expandedRowRender: (record: any) => (
                      <div style={{ padding: '8px 0' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>证据：</Text>
                        <pre style={{
                          background: '#f6f8fa', padding: 8, borderRadius: 4,
                          fontSize: 12, margin: '8px 0 0 0', maxHeight: 200, overflow: 'auto',
                        }}>
                          {record.evidence}
                        </pre>
                      </div>
                    ),
                  }}
                  size="small"
                />
              </Card>
            )}

            {/* 最频繁事件类型 */}
            {result.statistics?.topEventType && (
              <Card style={{ marginTop: 16 }}>
                <Space>
                  <InfoCircleOutlined style={{ color: '#1677ff' }} />
                  <Text>最频繁事件类型：</Text>
                  <Tag color="blue">{result.statistics.topEventType}</Tag>
                </Space>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
