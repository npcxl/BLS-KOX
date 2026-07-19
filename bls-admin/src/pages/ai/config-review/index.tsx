import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import {
  Card, Form, Input, Button, message, Typography, Space, Tag, Table,
  Select, Row, Col, Descriptions, Progress, Alert,
} from 'antd';
import {
  SafetyOutlined, SendOutlined, WarningFilled, ExclamationCircleFilled,
  InfoCircleFilled, CheckCircleFilled,
} from '@ant-design/icons';
import { request } from '@umijs/max';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

const severityIconMap: Record<string, React.ReactNode> = {
  critical: <WarningFilled style={{ color: '#ff4d4f', fontSize: 16 }} />,
  high: <ExclamationCircleFilled style={{ color: '#ff7a45', fontSize: 16 }} />,
  medium: <InfoCircleFilled style={{ color: '#faad14', fontSize: 16 }} />,
  low: <InfoCircleFilled style={{ color: '#1677ff', fontSize: 16 }} />,
};

const severityColorMap: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue',
};

const categoryLabelMap: Record<string, string> = {
  weak_password: '弱密码',
  default_secret: '默认密钥',
  public_redis: '公网 Redis',
  root_database: 'root 数据库',
  unsafe_cors: 'CORS 不安全',
  insecure_protocol: '协议不安全',
  missing_encryption: '缺少加密',
  exposed_port: '端口暴露',
  other: '其他',
};

const overallRiskColor: Record<string, string> = {
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#52c41a',
  safe: '#1890ff',
};

const overallRiskLabel: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  safe: '安全',
};

const configTypeOptions = [
  { label: '全部类型', value: 'all' },
  { label: '.env 环境变量', value: 'env' },
  { label: 'Docker Compose', value: 'docker' },
  { label: 'Spring YAML', value: 'yml' },
];

const exampleContent: Record<string, string> = {
  env: `DB_PASSWORD=123456
REDIS_HOST=0.0.0.0
REDIS_PASSWORD=
JWT_SECRET=CHANGE_TO_A_STRONG_JWT_SECRET
CORS_ORIGIN=*`,
  docker: `services:
  app:
    ports:
      - "3306:3306"
    environment:
      - DB_USER=root
      - DB_PASSWORD=admin123`,
  yml: `spring:
  datasource:
    username: root
    password: password
server:
  port: 8080`,
};

export default function AiConfigReviewPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [configType, setConfigType] = useState<string>('all');

  const handleReview = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setResult(null);
      const res = await request('/api/ai/config/review', {
        method: 'POST',
        data: values,
      });
      if (res.code === 0) {
        setResult(res.data);
        message.success('配置审查完成');
      } else {
        message.error(res.message || '审查失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const fillExample = () => {
    const example = exampleContent[configType] || exampleContent.env;
    form.setFieldsValue({ configContent: example });
  };

  return (
    <PageContainer
      header={{
        title: <Space><SafetyOutlined /><span>配置审查</span></Space>,
        subTitle: '检查配置文件安全性，发现弱密码、默认密钥、不安全配置等问题',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Card>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ configType: 'all' }}
          >
            <Form.Item name="configType" label="配置类型">
              <Select
                options={configTypeOptions}
                onChange={(val) => setConfigType(val)}
              />
            </Form.Item>
            <Form.Item
              name="configContent"
              label="配置内容"
              rules={[
                { required: true, message: '请输入配置内容' },
                { max: 20000, message: '内容不能超过 20000 字' },
              ]}
            >
              <TextArea
                rows={12}
                placeholder={`粘贴配置文件内容...

示例：
DB_PASSWORD=123456
REDIS_HOST=0.0.0.0
JWT_SECRET=CHANGE_TO_ME
...`}
                maxLength={20000}
                showCount
              />
            </Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={loading}
                onClick={handleReview}
                size="large"
              >
                提交审查
              </Button>
              <Button onClick={fillExample}>填充示例</Button>
              <Button onClick={() => { form.resetFields(); setResult(null); }}>
                重置
              </Button>
            </Space>
          </Form>
        </Card>

        {loading && (
          <Card style={{ marginTop: 16, textAlign: 'center', padding: 40 }}>
            <span>AI 正在审查配置...</span>
          </Card>
        )}

        {result && !loading && (
          <div style={{ marginTop: 16 }}>
            {/* 总览 */}
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={24} align="middle">
                <Col xs={24} md={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>安全评分</div>
                    <div style={{ fontSize: 48, fontWeight: 700, color: overallRiskColor[result.overallRisk] || '#1890ff' }}>
                      {result.complianceScore ?? '-'}
                    </div>
                    <Tag
                      color={overallRiskColor[result.overallRisk] || 'blue'}
                      style={{ marginTop: 8, fontSize: 14 }}
                    >
                      {overallRiskLabel[result.overallRisk] || result.overallRisk}
                    </Tag>
                  </div>
                </Col>
                <Col xs={24} md={16}>
                  {result.summary && (
                    <>
                      <Text strong>总体评估：</Text>
                      <Paragraph style={{ marginTop: 8 }}>{result.summary}</Paragraph>
                    </>
                  )}
                </Col>
              </Row>
            </Card>

            {/* 问题列表 */}
            {result.issues && result.issues.length > 0 && (
              <Card title={`发现 ${result.issues.length} 个安全问题`} style={{ marginBottom: 16 }}>
                <Table
                  dataSource={result.issues.map((item: any, i: number) => ({ ...item, key: i }))}
                  pagination={false}
                  columns={[
                    {
                      title: '严重度', dataIndex: 'severity', key: 'severity', width: 80,
                      render: (v: string) => (
                        <Space>
                          {severityIconMap[v]}
                          <Tag color={severityColorMap[v]}>{v.toUpperCase()}</Tag>
                        </Space>
                      ),
                    },
                    {
                      title: '分类', dataIndex: 'category', key: 'category', width: 120,
                      render: (v: string) => (
                        <Tag>{categoryLabelMap[v] || v}</Tag>
                      ),
                    },
                    {
                      title: '问题', dataIndex: 'title', key: 'title',
                      render: (v: string, record: any) => (
                        <div>
                          <Text strong>{v}</Text>
                          {record.location && (
                            <div><Text type="secondary" style={{ fontSize: 12 }}>位置: {record.location}</Text></div>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: '当前值', dataIndex: 'current', key: 'current', width: 160,
                      render: (v: string) => <Text code type="danger">{v}</Text>,
                    },
                    {
                      title: '风险说明', dataIndex: 'risk', key: 'risk', width: 200,
                      render: (v: string) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text>,
                    },
                    {
                      title: '修复建议', dataIndex: 'fix', key: 'fix', width: 250,
                      render: (v: string) => <Text type="success" style={{ fontSize: 13 }}>{v}</Text>,
                    },
                  ]}
                  size="small"
                />
              </Card>
            )}

            {/* 最佳实践建议 */}
            {result.bestPractices && result.bestPractices.length > 0 && (
              <Card title="最佳实践建议">
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {result.bestPractices.map((bp: string, i: number) => (
                    <li key={i} style={{ marginBottom: 6, color: '#555' }}>
                      <CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />
                      {bp}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
