import { PageContainer } from '@ant-design/pro-components';
import { Card, Form, Input, Button, message, Space, Alert } from 'antd';
import { ConsoleSqlOutlined, CopyOutlined, ThunderboltOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';
import { useState } from 'react';

const { TextArea } = Input;

export default function AiSqlPage() {
  const [form] = Form.useForm();
  const [userPrompt, setUserPrompt] = useState('');
  const { stream, start, stop } = useAiStream();

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      const tables = values.tables ? values.tables.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      setUserPrompt(values.description + (tables.length ? `\n表: ${tables.join(', ')}` : ''));
      start('sql', { description: values.description, tables });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请填写完整信息');
    }
  };

  const copyText = (text: string) => navigator.clipboard.writeText(text).then(() => message.success('已复制'));

  return (
    <PageContainer header={{ title: <Space><ConsoleSqlOutlined /><span>SQL 助手</span></Space>, subTitle: '自然语言转只读 SQL' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Alert type="warning" showIcon icon={<SafetyOutlined />} message="仅生成 SELECT/SHOW/DESCRIBE/EXPLAIN，自动拦截写操作" style={{ marginBottom: 16 }} />
        <Card>
          <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Form.Item name="description" label="查询描述" rules={[{ required: true }]}>
              <TextArea rows={2} placeholder="查询最近 7 天注册的用户" style={{ width: 360 }} maxLength={2000} />
            </Form.Item>
            <Form.Item name="tables" label="表名">
              <Input placeholder="sys_user, sys_dept" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleGenerate} size="large">流式生成</Button>
                {stream.loading && <Button onClick={stop} danger>停止</Button>}
                {!stream.loading && <Button onClick={() => form.resetFields()}>重置</Button>}
              </Space>
            </Form.Item>
          </Form>
        </Card>
        <Card title="AI 对话" style={{ marginTop: 16 }} styles={{ body: { padding: '8px 16px' } }}>
          <AiStreamOutput content={stream.content} loading={stream.loading} done={stream.done} userPrompt={userPrompt} />
          {!stream.loading && !stream.content && (
            <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
              <ConsoleSqlOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 12 }} />
              <div>输入查询描述，点击"流式生成"</div>
            </div>
          )}
        </Card>
        {stream.done && stream.content && (
          <Card title="生成的 SQL" extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(stream.content)}>复制</Button>} style={{ marginTop: 16 }}>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 20, borderRadius: 8, fontSize: 14, lineHeight: 1.7, margin: 0, fontFamily: "'Fira Code', 'Consolas', monospace" }}>{stream.content}</pre>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
