import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Tag, Alert } from 'antd';
import { ConsoleSqlOutlined, CopyOutlined, ThunderboltOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';

const { TextArea } = Input;
const { Title, Text } = Typography;

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

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'));
  };

  return (
    <PageContainer
      header={{
        title: <Space><ConsoleSqlOutlined /><span>SQL 助手</span></Space>,
        subTitle: '自然语言转只读 SQL，实时观看生成过程',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Alert
          type="warning" showIcon icon={<SafetyOutlined />}
          message="仅生成 SELECT/SHOW/DESCRIBE/EXPLAIN 只读语句，自动拦截写操作"
          style={{ marginBottom: 16 }}
        />
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item name="description" label="查询描述" rules={[{ required: true }, { max: 2000 }]}>
              <TextArea rows={4} placeholder="例如：查询最近 7 天注册的用户中，状态为启用的用户列表" maxLength={2000} showCount />
            </Form.Item>
            <Form.Item name="tables" label="已知表名（可选）">
              <Input placeholder="多个表名逗号分隔，如: sys_user, sys_dept" />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleGenerate} size="large">流式生成</Button>
              {stream.loading && <Button onClick={stop}>停止</Button>}
              {!stream.loading && <Button onClick={() => form.resetFields()}>重置</Button>}
            </Space>
          </Form>
        </Card>

        {/* 流式输出 */}
        {(stream.loading || stream.content) && (
          <Card
            title={<Space><ThunderboltOutlined style={{ color: '#1677ff' }} /><span>SQL 生成过程</span></Space>}
            extra={stream.done && stream.content ? <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(stream.content)}>复制</Button> : null}
            style={{ marginTop: 16 }}
          >
            <AiStreamOutput content={stream.content} loading={stream.loading} done={stream.done} language="sql" />
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
