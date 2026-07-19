import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import {
  Card, Form, Input, Button, message, Typography, Descriptions, Tag, Space,
  Table, Alert, Collapse, Spin,
} from 'antd';
import { CodeOutlined, CopyOutlined, SendOutlined } from '@ant-design/icons';
import { request } from '@umijs/max';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

export default function AiCrudPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setResult(null);
      const res = await request('/api/ai/crud/generate', {
        method: 'POST',
        data: values,
      });
      if (res.code === 0) {
        setResult(res.data);
        message.success('CRUD 配置生成成功');
      } else {
        message.error(res.message || '生成失败');
      }
    } catch (err: any) {
      // 表单校验错误不弹 message
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
        title: <Space><CodeOutlined /><span>CRUD 生成器</span></Space>,
        subTitle: '根据自然语言描述，生成数据库建表 SQL 和 CRUD 配置',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Card>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ tenantIsolation: true }}
          >
            <Form.Item
              name="tableName"
              label="表名"
              rules={[
                { required: true, message: '请输入表名' },
                { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '表名格式不合法（字母/下划线开头）' },
              ]}
            >
              <Input placeholder="例如: sys_product" maxLength={64} />
            </Form.Item>
            <Form.Item
              name="description"
              label="模块描述"
              rules={[
                { required: true, message: '请输入模块描述' },
                { max: 2000, message: '描述不能超过 2000 字' },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="例如：商品管理模块，包含商品名称、分类、价格、库存、状态、创建时间"
                maxLength={2000}
                showCount
              />
            </Form.Item>
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={loading}
                onClick={handleGenerate}
                size="large"
              >
                开始生成
              </Button>
              <Button onClick={() => { form.resetFields(); setResult(null); }}>
                重置
              </Button>
            </Space>
          </Form>
        </Card>

        {loading && (
          <Card style={{ marginTop: 16, textAlign: 'center', padding: 60 }}>
            <Spin size="large" tip="AI 正在分析需求并生成配置..." />
          </Card>
        )}

        {result && !loading && (
          <div style={{ marginTop: 16 }}>
            {/* 建表 SQL */}
            <Card
              title="建表 SQL"
              extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(result.sql)}>复制</Button>}
              style={{ marginBottom: 16 }}
            >
              <pre style={{
                background: '#f6f8fa', padding: 16, borderRadius: 6,
                overflow: 'auto', fontSize: 13, lineHeight: 1.6, margin: 0,
              }}>
                {result.sql}
              </pre>
            </Card>

            {/* CRUD 列配置 */}
            {result.crudConfig?.columns && (
              <Card title="字段配置" style={{ marginBottom: 16 }}>
                <Table
                  dataSource={result.crudConfig.columns.map((col: any, i: number) => ({ ...col, key: i }))}
                  columns={[
                    { title: '字段名', dataIndex: 'field', key: 'field', width: 150 },
                    { title: '显示名', dataIndex: 'label', key: 'label', width: 120 },
                    {
                      title: '类型', dataIndex: 'type', key: 'type', width: 100,
                      render: (v: string) => <Tag color="blue">{v}</Tag>,
                    },
                    {
                      title: '必填', dataIndex: 'required', key: 'required', width: 70,
                      render: (v: boolean) => v ? <Tag color="red">必填</Tag> : <Tag>可选</Tag>,
                    },
                    {
                      title: '可搜索', dataIndex: 'searchable', key: 'searchable', width: 80,
                      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
                    },
                    {
                      title: '可排序', dataIndex: 'sortable', key: 'sortable', width: 80,
                      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
                    },
                  ]}
                  pagination={false}
                  size="small"
                  bordered
                />
              </Card>
            )}

            {/* 菜单建议 */}
            {result.menuSuggestion && (
              <Card title="菜单建议" style={{ marginBottom: 16 }}>
                <Descriptions column={3} size="small" bordered>
                  <Descriptions.Item label="菜单名称">{result.menuSuggestion.name}</Descriptions.Item>
                  <Descriptions.Item label="建议图标">{result.menuSuggestion.icon}</Descriptions.Item>
                  <Descriptions.Item label="父级路由">{result.menuSuggestion.parentPath}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* 权限码建议 */}
            {result.permissionCodes && result.permissionCodes.length > 0 && (
              <Card title="权限码建议" style={{ marginBottom: 16 }}>
                <Space wrap>
                  {result.permissionCodes.map((code: string) => (
                    <Tag key={code} color="purple">{code}</Tag>
                  ))}
                </Space>
              </Card>
            )}

            {/* 动态列配置 JSON */}
            {result.dynamicColumns && (
              <Card
                title="动态列配置 JSON"
                extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(JSON.stringify(result.dynamicColumns, null, 2))}>复制</Button>}
              >
                <Alert
                  type="info"
                  message="以下 JSON 可用于页面配置中的动态列配置"
                  style={{ marginBottom: 8 }}
                />
                <pre style={{
                  background: '#f6f8fa', padding: 16, borderRadius: 6,
                  overflow: 'auto', fontSize: 13, lineHeight: 1.6, margin: 0,
                  maxHeight: 400,
                }}>
                  {JSON.stringify(result.dynamicColumns, null, 2)}
                </pre>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
