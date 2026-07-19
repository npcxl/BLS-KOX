import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Tag, Select, Table, Statistic, Row, Col } from 'antd';
import { AuditOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';

const { TextArea } = Input;
const { Paragraph, Text } = Typography;
const riskColor: Record<string, string> = { high: '#ff4d4f', medium: '#faad14', low: '#52c41a', none: '#1890ff' };

export default function AiAuditPage() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const { stream, start, stop } = useAiStream();

  const handleAnalyze = async () => {
    try {
      const values = await form.validateFields();
      setResult(null);
      start('audit', { logType: values.logType, logData: values.logData, timeRange: values.timeRange });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请填写完整信息');
    }
  };

  const handleStreamDone = (content: string) => {
    try {
      const t = content.trim();
      const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, t];
      setResult(JSON.parse(m[1] || t));
    } catch {}
  };

  return (
    <PageContainer header={{ title: <Space><AuditOutlined /><span>审计分析</span></Space>, subTitle: '粘贴日志，AI 实时分析风险并给出建议' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Card>
          <Form form={form} layout="vertical" initialValues={{ logType: 'all' }}>
            <Form.Item name="logType" label="日志类型">
              <Select options={[{ label: '全部', value: 'all' }, { label: '登录', value: 'login' }, { label: '接口访问', value: 'api_access' }, { label: '限流', value: 'rate_limit' }, { label: '异常', value: 'error' }]} />
            </Form.Item>
            <Form.Item name="timeRange" label="时间范围（可选）"><Input placeholder="例如: 最近24小时" /></Form.Item>
            <Form.Item name="logData" label="日志数据" rules={[{ required: true }, { max: 10000 }]}>
              <TextArea rows={8} placeholder="粘贴日志内容..." maxLength={10000} showCount />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleAnalyze} size="large">流式分析</Button>
              {stream.loading && <Button onClick={stop} danger>停止</Button>}
              {!stream.loading && <Button onClick={() => { form.resetFields(); setResult(null); }}>重置</Button>}
            </Space>
          </Form>
        </Card>
        <div style={{ marginTop: 16 }}>
          <AiStreamOutput content={stream.content} loading={stream.loading} done={stream.done} onDone={handleStreamDone} />
        </div>
        {result && (
          <div style={{ marginTop: 16 }}>
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={24}>
                <Col xs={24} md={8} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: '#999' }}>风险等级</div>
                  <Tag color={riskColor[result.riskLevel] || 'blue'} style={{ fontSize: 20, padding: '4px 20px', marginTop: 8 }}>{result.riskLevel?.toUpperCase()}</Tag>
                </Col>
                {result.statistics && (<>
                  <Col xs={24} md={8}><Statistic title="事件总数" value={result.statistics.totalEvents || 0} /></Col>
                  <Col xs={24} md={8}><Statistic title="独立 IP" value={result.statistics.uniqueIps || 0} /></Col>
                </>)}
              </Row>
              {result.summary && <Paragraph style={{ marginTop: 16, marginBottom: 0 }}><Text strong>评估：</Text>{result.summary}</Paragraph>}
            </Card>
            {result.findings?.length > 0 && (
              <Card title={`发现 ${result.findings.length} 个问题`}>
                <Table dataSource={result.findings.map((f: any, i: number) => ({ ...f, key: i }))} pagination={false} size="small"
                  columns={[
                    { title: '严重度', dataIndex: 'severity', width: 80, render: (v: string) => <Tag color={v === 'high' ? 'red' : v === 'medium' ? 'orange' : 'green'}>{v}</Tag> },
                    { title: '类型', dataIndex: 'type', width: 120, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '描述', dataIndex: 'description' },
                    { title: '建议', dataIndex: 'recommendation', width: 250, render: (v: string) => <Text type="secondary">{v}</Text> },
                  ]}
                  expandable={{ expandedRowRender: (r: any) => r.evidence ? <pre style={{ background: '#f6f8fa', padding: 8, borderRadius: 4, fontSize: 12, margin: 0 }}>{r.evidence}</pre> : null }}
                />
              </Card>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
