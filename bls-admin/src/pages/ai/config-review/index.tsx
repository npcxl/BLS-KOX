import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Tag, Table, Select, Row, Col } from 'antd';
import { SafetyOutlined, ThunderboltOutlined, WarningFilled, ExclamationCircleFilled, InfoCircleFilled, CheckCircleFilled } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';

const { TextArea } = Input;
const { Paragraph, Text } = Typography;

const severityIcon: Record<string, React.ReactNode> = {
  critical: <WarningFilled style={{ color: '#ff4d4f' }} />,
  high: <ExclamationCircleFilled style={{ color: '#ff7a45' }} />,
  medium: <InfoCircleFilled style={{ color: '#faad14' }} />,
  low: <InfoCircleFilled style={{ color: '#1677ff' }} />,
};
const riskColor: Record<string, string> = { high: '#ff4d4f', medium: '#faad14', low: '#52c41a', safe: '#1890ff' };
const catLabel: Record<string, string> = {
  weak_password: '弱密码', default_secret: '默认密钥', public_redis: '公网Redis', root_database: 'root数据库',
  unsafe_cors: 'CORS', insecure_protocol: '协议', missing_encryption: '加密', exposed_port: '端口', other: '其他',
};

const examples: Record<string, string> = {
  env: 'DB_PASSWORD=123456\nREDIS_HOST=0.0.0.0\nJWT_SECRET=CHANGE_TO_ME\nCORS_ORIGIN=*',
  docker: 'services:\n  app:\n    ports:\n      - "3306:3306"\n    environment:\n      - DB_USER=root\n      - DB_PASSWORD=admin123',
  yml: 'spring:\n  datasource:\n    username: root\n    password: password',
};

export default function AiConfigReviewPage() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const [configType, setConfigType] = useState<string>('all');
  const { stream, start, stop } = useAiStream();

  const handleReview = async () => {
    try {
      const values = await form.validateFields();
      setResult(null);
      start('config', { configType: values.configType, configContent: values.configContent });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请填写完整信息');
    }
  };

  const tryParseResult = (content: string) => {
    try {
      const trimmed = content.trim();
      const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed];
      setResult(JSON.parse(match[1] || trimmed));
    } catch {}
  };

  return (
    <PageContainer header={{ title: <Space><SafetyOutlined /><span>配置审查</span></Space>, subTitle: '检查配置文件安全性，实时观看分析过程' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Card>
          <Form form={form} layout="vertical" initialValues={{ configType: 'all' }}>
            <Form.Item name="configType" label="配置类型">
              <Select options={[{ label: '全部', value: 'all' }, { label: '.env', value: 'env' }, { label: 'Docker Compose', value: 'docker' }, { label: 'YAML', value: 'yml' }]} onChange={(v) => setConfigType(v)} />
            </Form.Item>
            <Form.Item name="configContent" label="配置内容" rules={[{ required: true }, { max: 20000 }]}>
              <TextArea rows={12} placeholder="粘贴配置文件内容..." maxLength={20000} showCount />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleReview} size="large">流式审查</Button>
              {stream.loading && <Button onClick={stop}>停止</Button>}
              <Button onClick={() => form.setFieldsValue({ configContent: examples[configType] || examples.env })}>填充示例</Button>
              {!stream.loading && <Button onClick={() => { form.resetFields(); setResult(null); }}>重置</Button>}
              {stream.done && stream.content && !result && <Button onClick={() => tryParseResult(stream.content)}>解析结果</Button>}
            </Space>
          </Form>
        </Card>

        {/* 流式输出 */}
        {(stream.loading || stream.content) && (
          <Card title={<Space><ThunderboltOutlined style={{ color: '#1677ff' }} /><span>审查过程</span></Space>} style={{ marginTop: 16 }}>
            <AiStreamOutput content={stream.content} loading={stream.loading} done={stream.done} language="json" />
          </Card>
        )}

        {/* 结构化结果 */}
        {result && (
          <div style={{ marginTop: 16 }}>
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={24} align="middle">
                <Col xs={24} md={8} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: '#999' }}>安全评分</div>
                  <div style={{ fontSize: 48, fontWeight: 700, color: riskColor[result.overallRisk] || '#1890ff' }}>{result.complianceScore ?? '-'}</div>
                  <Tag color={riskColor[result.overallRisk]} style={{ marginTop: 8 }}>{result.overallRisk?.toUpperCase()}</Tag>
                </Col>
                <Col xs={24} md={16}>{result.summary && <Paragraph style={{ marginTop: 8 }}><Text strong>总体评估：</Text>{result.summary}</Paragraph>}</Col>
              </Row>
            </Card>
            {result.issues?.length > 0 && (
              <Card title={`发现 ${result.issues.length} 个安全问题`} style={{ marginBottom: 16 }}>
                <Table
                  dataSource={result.issues.map((i: any, k: number) => ({ ...i, key: k }))}
                  pagination={false} size="small"
                  columns={[
                    { title: '严重度', dataIndex: 'severity', width: 80, render: (v: string) => <Space>{severityIcon[v]}<Tag>{v}</Tag></Space> },
                    { title: '分类', dataIndex: 'category', width: 100, render: (v: string) => <Tag>{catLabel[v] || v}</Tag> },
                    { title: '问题', dataIndex: 'title' },
                    { title: '当前值', dataIndex: 'current', width: 140, render: (v: string) => <Text code type="danger">{v}</Text> },
                    { title: '风险', dataIndex: 'risk', width: 180, render: (v: string) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text> },
                    { title: '修复建议', dataIndex: 'fix', width: 220, render: (v: string) => <Text style={{ fontSize: 13, color: '#52c41a' }}>{v}</Text> },
                  ]}
                />
              </Card>
            )}
            {result.bestPractices?.length > 0 && (
              <Card title="最佳实践建议">
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {result.bestPractices.map((bp: string, i: number) => (
                    <li key={i} style={{ marginBottom: 6, color: '#555' }}><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />{bp}</li>
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
