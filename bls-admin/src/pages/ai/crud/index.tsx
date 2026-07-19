import { PageContainer } from '@ant-design/pro-components';
import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Descriptions, Tag, Space, Table } from 'antd';
import { CodeOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAiStream } from '@/hooks/useAiStream';
import AiStreamOutput from '@/components/AiStreamOutput';

const { TextArea } = Input;

export default function AiCrudPage() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const { stream, start, stop } = useAiStream();

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setResult(null);
      start('crud', { tableName: values.tableName, description: values.description });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '请填写完整信息');
    }
  };

  // 流式完成后自动解析 JSON
  const handleStreamDone = (content: string) => {
    try {
      const trimmed = content.trim();
      const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed];
      const json = JSON.parse(match[1] || trimmed);
      setResult(json);
    } catch { /* 非 JSON 不解析 */ }
  };

  const copyText = (text: string) => navigator.clipboard.writeText(text).then(() => message.success('已复制'));

  return (
    <PageContainer header={{ title: <Space><CodeOutlined /><span>CRUD 生成器</span></Space>, subTitle: '描述需求，AI 实时生成建表 SQL 和 CRUD 配置' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Card>
          <Form form={form} layout="vertical" initialValues={{ tenantIsolation: true }}>
            <Form.Item name="tableName" label="表名" rules={[{ required: true, message: '请输入表名' }, { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '表名格式不合法' }]}>
              <Input placeholder="例如: sys_product" maxLength={64} />
            </Form.Item>
            <Form.Item name="description" label="模块描述" rules={[{ required: true }, { max: 2000 }]}>
              <TextArea rows={4} placeholder="例如：商品管理模块，包含商品名称、分类、价格、库存、状态、创建时间" maxLength={2000} showCount />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} loading={stream.loading} onClick={handleGenerate} size="large">流式生成</Button>
              {stream.loading && <Button onClick={stop} danger>停止</Button>}
              {!stream.loading && <Button onClick={() => { form.resetFields(); setResult(null); }}>重置</Button>}
            </Space>
          </Form>
        </Card>

        {/* 流式输出 - 自动滚动、自动解析 */}
        <div style={{ marginTop: 16 }}>
          <AiStreamOutput content={stream.content} loading={stream.loading} done={stream.done} onDone={handleStreamDone} />
        </div>

        {/* 结构化结果 */}
        {result && (
          <div style={{ marginTop: 16 }}>
            <Card title="建表 SQL" extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(result.sql)}>复制</Button>} style={{ marginBottom: 16 }}>
              <pre style={{ background: '#f6f8fa', padding: 16, borderRadius: 6, overflow: 'auto', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{result.sql}</pre>
            </Card>
            {result.crudConfig?.columns && (
              <Card title="字段配置" style={{ marginBottom: 16 }}>
                <Table dataSource={result.crudConfig.columns.map((c: any, i: number) => ({ ...c, key: i }))}
                  pagination={false} size="small" bordered
                  columns={[
                    { title: '字段名', dataIndex: 'field', width: 150 },
                    { title: '显示名', dataIndex: 'label', width: 120 },
                    { title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag color="blue">{v}</Tag> },
                    { title: '必填', dataIndex: 'required', width: 60, render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
                    { title: '可搜索', dataIndex: 'searchable', width: 70, render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag> },
                    { title: '可排序', dataIndex: 'sortable', width: 70, render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag> },
                  ]}
                />
              </Card>
            )}
            {result.menuSuggestion && (
              <Card title="菜单建议" style={{ marginBottom: 16 }}>
                <Descriptions column={3} size="small" bordered>
                  <Descriptions.Item label="菜单名称">{result.menuSuggestion.name}</Descriptions.Item>
                  <Descriptions.Item label="建议图标">{result.menuSuggestion.icon}</Descriptions.Item>
                  <Descriptions.Item label="父级路由">{result.menuSuggestion.parentPath}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}
            {result.permissionCodes?.length > 0 && (
              <Card title="权限码建议" style={{ marginBottom: 16 }}>
                <Space wrap>{result.permissionCodes.map((c: string) => <Tag key={c} color="purple">{c}</Tag>)}</Space>
              </Card>
            )}
            {result.dynamicColumns && (
              <Card title="动态列配置 JSON" extra={<Button size="small" icon={<CopyOutlined />} onClick={() => copyText(JSON.stringify(result.dynamicColumns, null, 2))}>复制</Button>}>
                <pre style={{ background: '#f6f8fa', padding: 16, borderRadius: 6, overflow: 'auto', fontSize: 13, maxHeight: 400 }}>{JSON.stringify(result.dynamicColumns, null, 2)}</pre>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
