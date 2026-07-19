import { PageContainer } from '@ant-design/pro-components';
import { Card, Form, Input, Button, message, Typography, Space, Tag, Alert } from 'antd';
import { ConsoleSqlOutlined, CopyOutlined, ThunderboltOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';

const { TextArea } = Input;

export default function AiSqlPage() {
  const [form] = Form.useForm();
  const { stream, start, stop } = useAiStream();

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      const tables = values.tables ? values.tables.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      start('sql', { description: values.description, tables });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请填写完整信息');
    }
  };

  const copyText = (text: string) => navigator.clipboard.writeText(text).then(() => message.success('已复制'));

  return (
    <PageContainer header={{ title: <Space><ConsoleSqlOutlined /><span>SQL 助手</span></Space>, subTitle: '自然语言描述，AI 实时生成只读 SQL' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Alert type="warning" showIcon icon={<SafetyOutlined />} message="仅生成 SELECT/SHOW/DESCRIBE/EXPLAIN，自动拦截写操作，注入租户隔离" style={{ marginBottom: 16 }} />
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item name="description" label="查询描述" rules={[{ required: true }, { max: 2000 }]}>
              <TextArea rows={4} placeholder="例如：查询最近 7 天注册的用户中，状态为启用的用户列表" maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="tables" label="已知表名（可选）">
              <Input placeholder="多个表名逗号分隔: sys_user, sys_dept" />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleGenerate} size="large">流式生成</Button>
              {stream.loading && <Button onClick={stop} danger>停止</Button>}
              {!stream.loading && <Button onClick={() => form.resetFields()}>重置</Button>}
            </Space>
          </Form>
        </Card>
        <div style={{ marginTop: 16 }}>
          <AiStreamOutput content={stream.content} loading={stream.loading} done={stream.done} />
        </div>
        {stream.done && stream.content && (
          <Card title="最终 SQL" extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(stream.content)}>复制</Button>} style={{ marginTop: 16 }}>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 20, borderRadius: 8, fontSize: 14, lineHeight: 1.7, margin: 0, fontFamily: "'Fira Code', 'Consolas', monospace" }}>{stream.content}</pre>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
