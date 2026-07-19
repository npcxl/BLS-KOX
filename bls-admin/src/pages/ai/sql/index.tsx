import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import {
  Card, Form, Input, Button, message, Typography, Space, Tag, Alert, Collapse,
} from 'antd';
import { ConsoleSqlOutlined, CopyOutlined, SendOutlined, SafetyOutlined } from '@ant-design/icons';
import { request } from '@umijs/max';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

export default function AiSqlPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setResult(null);
      const res = await request('/api/ai/sql/generate', {
        method: 'POST',
        data: {
          description: values.description,
          tables: values.tables ? values.tables.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        },
      });
      if (res.code === 0) {
        setResult(res.data);
        message.success('SQL 生成成功');
      } else {
        message.error(res.message || '生成失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'));
  };

  return (
    <PageContainer
      header={{
        title: <Space><ConsoleSqlOutlined /><span>SQL 助手</span></Space>,
        subTitle: '自然语言转只读 SQL，内置安全防护和租户隔离',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* 安全声明 */}
        <Alert
          type="warning"
          showIcon
          icon={<SafetyOutlined />}
          message="安全提示"
          description={
            <span>
              仅生成 <Tag color="green">SELECT</Tag> / <Tag color="green">SHOW</Tag> / <Tag color="green">DESCRIBE</Tag> / <Tag color="green">EXPLAIN</Tag> 只读语句。
              自动拦截 <Tag color="red">INSERT</Tag> <Tag color="red">UPDATE</Tag> <Tag color="red">DELETE</Tag> <Tag color="red">DROP</Tag> 等写操作。
              自动注入租户隔离条件（tenantId）。
            </span>
          }
          style={{ marginBottom: 16 }}
        />

        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              name="description"
              label="查询描述"
              rules={[
                { required: true, message: '请输入查询描述' },
                { max: 2000, message: '描述不能超过 2000 字' },
              ]}
            >
              <TextArea
                rows={4}
                placeholder={'例如：查询最近 7 天注册的用户中，状态为启用的用户列表\n或：统计各部门的用户数量，按数量降序排列'}
                maxLength={2000}
                showCount
              />
            </Form.Item>
            <Form.Item
              name="tables"
              label="已知表名（可选）"
            >
              <Input placeholder="多个表名用逗号分隔，如: sys_user, sys_dept" />
            </Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={loading}
                onClick={handleGenerate}
                size="large"
              >
                生成 SQL
              </Button>
              <Button onClick={() => { form.resetFields(); setResult(null); }}>
                重置
              </Button>
            </Space>
          </Form>
        </Card>

        {loading && (
          <Card style={{ marginTop: 16, textAlign: 'center', padding: 40 }}>
            <span>AI 正在生成 SQL...</span>
          </Card>
        )}

        {result && !loading && (
          <Card
            title="生成结果"
            extra={
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyText(result.sql)}
              >
                复制 SQL
              </Button>
            }
            style={{ marginTop: 16 }}
          >
            <pre style={{
              background: '#1e1e1e', color: '#d4d4d4', padding: 20, borderRadius: 8,
              overflow: 'auto', fontSize: 14, lineHeight: 1.7, margin: 0,
              fontFamily: "'Fira Code', 'Consolas', monospace",
            }}>
              {result.sql}
            </pre>
            <div style={{ marginTop: 12 }}>
              <Space>
                {result.tenantIsolated
                  ? <Tag color="green">已注入租户隔离</Tag>
                  : <Tag color="orange">无租户信息</Tag>
                }
              </Space>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
