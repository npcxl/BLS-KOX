import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Tag, Space, Table, Descriptions, Row, Col, Spin } from 'antd';
import { CodeOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';

const { TextArea } = Input;
const { Title } = Typography;

export default function AiCrudPage() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const { stream, start, stop } = useAiStream();

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setResult(null);
      setUserPrompt(`表名: ${values.tableName}\n描述: ${values.description}`);
      start('crud', { tableName: values.tableName, description: values.description });
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

  const copyText = (text: string) => navigator.clipboard.writeText(text).then(() => message.success('已复制'));

  return (
    <PageContainer header={{ title: <Space><CodeOutlined /><span>CRUD 生成器</span></Space>, subTitle: '描述需求，AI 实时生成建表 SQL 和 CRUD 配置' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Card style={{ marginBottom: 16 }}>
          <Form form={form} layout="inline" initialValues={{ tenantIsolation: true }} style={{ flexWrap: 'wrap', gap: 8 }}>
            <Form.Item name="tableName" label="表名" rules={[{ required: true }, { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/ }]}>
              <Input placeholder="sys_product" style={{ width: 180 }} maxLength={64} />
            </Form.Item>
            <Form.Item name="description" label="描述" rules={[{ required: true }, { max: 2000 }]}>
              <TextArea rows={2} placeholder="商品管理模块，包含名称、分类、价格、库存、状态" style={{ width: 400 }} maxLength={2000} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleGenerate} size="large">
                  流式生成
                </Button>
                {stream.loading && <Button onClick={stop} danger>停止</Button>}
                {!stream.loading && <Button onClick={() => { form.resetFields(); setResult(null); }}>重置</Button>}
              </Space>
            </Form.Item>
          </Form>
        </Card>

        <Row gutter={16}>
          {/* 左边: 对话流 */}
          <Col xs={24} lg={result ? 12 : 24}>
            <Card
              title="AI 对话"
              styles={{ body: { padding: '8px 16px' } }}
            >
              <AiStreamOutput
                content={stream.content}
                loading={stream.loading}
                done={stream.done}
                userPrompt={userPrompt}
                onDone={handleStreamDone}
              />
              {!stream.loading && !stream.content && (
                <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                  <CodeOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 12 }} />
                  <div>填写表名和描述后点击"流式生成"</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>AI 将逐字输出生成过程</div>
                </div>
              )}
            </Card>
          </Col>

          {/* 右边: 结构化结果 */}
          {result && (
            <Col xs={24} lg={12}>
              <div style={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
                <Card title="建表 SQL" size="small" extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(result.sql)}>复制</Button>} style={{ marginBottom: 12 }}>
                  <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 6, fontSize: 13, lineHeight: 1.6, margin: 0, overflow: 'auto', maxHeight: 200 }}>{result.sql}</pre>
                </Card>
                {result.crudConfig?.columns && (
                  <Card title="字段配置" size="small" style={{ marginBottom: 12 }}>
                    <Table dataSource={result.crudConfig.columns.map((c: any, i: number) => ({ ...c, key: i }))}
                      pagination={false} size="small"
                      columns={[
                        { title: '字段', dataIndex: 'field', width: 130 },
                        { title: '显示名', dataIndex: 'label', width: 100 },
                        { title: '类型', dataIndex: 'type', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
                        { title: '必填', dataIndex: 'required', width: 60, render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
                        { title: '搜索', dataIndex: 'searchable', width: 60, render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag> },
                      ]}
                    />
                  </Card>
                )}
                {result.menuSuggestion && (
                  <Card title="菜单建议" size="small" style={{ marginBottom: 12 }}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="名称">{result.menuSuggestion.name}</Descriptions.Item>
                      <Descriptions.Item label="图标">{result.menuSuggestion.icon}</Descriptions.Item>
                      <Descriptions.Item label="路由">{result.menuSuggestion.parentPath}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
                {result.permissionCodes?.length > 0 && (
                  <Card title="权限码" size="small" style={{ marginBottom: 12 }}>
                    <Space wrap>{result.permissionCodes.map((c: string) => <Tag key={c} color="purple">{c}</Tag>)}</Space>
                  </Card>
                )}
              </div>
            </Col>
          )}
        </Row>
      </div>
    </PageContainer>
  );
}
