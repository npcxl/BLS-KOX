/**
 * P12: Webhook 管理页面
 */
import { request } from '@umijs/max';
import { PageContainer, ProCard, ProTable } from '@ant-design/pro-components';
import { Button, Drawer, Form, Input, message, Modal, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, SendOutlined, LinkOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';

const EVENT_OPTIONS = [
  { label: '用户创建', value: 'USER_CREATED' },
  { label: '用户禁用', value: 'USER_DISABLED' },
  { label: '订单创建', value: 'ORDER_CREATED' },
  { label: '支付完成', value: 'PAYMENT_COMPLETED' },
  { label: '文件上传', value: 'FILE_UPLOADED' },
  { label: '会话吊销', value: 'SESSION_REVOKED' },
];

export default function WebhookPage() {
  const actionRef = useRef<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const [logDrawer, setLogDrawer] = useState<{ open: boolean; webhookId?: string }>({ open: false });

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const body = { ...values, events: values.events ?? [] };
    if (editing) {
      await request(`/api/system/webhooks/${editing.webhook_id}`, { method: 'PUT', data: body });
      message.success('更新成功');
    } else {
      await request('/api/system/webhooks', { method: 'POST', data: body });
      message.success('注册成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditing(null);
    actionRef.current?.reload();
  };

  return (
    <PageContainer header={{ title: <Space><LinkOutlined />Webhook 管理</Space> }}>
      <ProCard
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
            注册 Webhook
          </Button>
        }
      >
        <ProTable<any>
          actionRef={actionRef}
          rowKey="webhook_id"
          request={async (params) => {
            const res = await request<{ data: any[] }>('/api/system/webhooks');
            return { data: res.data ?? [], total: (res.data ?? []).length, success: true };
          }}
          search={false}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name', width: 150 },
            { title: 'URL', dataIndex: 'url', ellipsis: true },
            {
              title: '事件', dataIndex: 'events',
              render: (_, r) => {
                const evts = typeof r.events === 'string' ? JSON.parse(r.events) : (r.events ?? []);
                return <Space size={2} wrap>{evts.map((e: string) => <Tag key={e}>{e}</Tag>)}</Space>;
              },
            },
            {
              title: '状态', dataIndex: 'enabled', width: 80,
              render: (_, r) => r.enabled ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
            },
            { title: '创建时间', dataIndex: 'created_at', width: 160, valueType: 'dateTime' },
            {
              title: '操作', width: 280,
              render: (_, record) => (
                <Space>
                  <a onClick={() => { setLogDrawer({ open: true, webhookId: record.webhook_id }); }}>日志</a>
                  <Popconfirm title="确定发送测试?" onConfirm={async () => {
                    await request(`/api/system/webhooks/${record.webhook_id}/test`, { method: 'POST' });
                    message.success('测试已发送');
                  }}>
                    <a><SendOutlined /> 测试</a>
                  </Popconfirm>
                  <a onClick={() => { setEditing(record); form.setFieldsValue({ name: record.name, url: record.url, events: typeof record.events === 'string' ? JSON.parse(record.events) : record.events }); setModalOpen(true); }}>编辑</a>
                  <Popconfirm title="确定删除?" onConfirm={async () => {
                    await request(`/api/system/webhooks/${record.webhook_id}`, { method: 'DELETE' });
                    message.success('已删除');
                    actionRef.current?.reload();
                  }}>
                    <a style={{ color: 'red' }}>删除</a>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </ProCard>

      {/* ====== 注册/编辑 Modal ====== */}
      <Modal
        title={editing ? '编辑 Webhook' : '注册 Webhook'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditing(null); }}
        onOk={handleSubmit}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="订单通知" />
          </Form.Item>
          <Form.Item name="url" label="回调 URL" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://example.com/webhook" />
          </Form.Item>
          <Form.Item name="events" label="订阅事件">
            <Select mode="multiple" placeholder="选择事件类型（可选）" options={EVENT_OPTIONS} />
          </Form.Item>
          {editing && (
            <Form.Item name="enabled" label="启用">
              <Select options={[{ label: '启用', value: true }, { label: '停用', value: false }]} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ====== 投递日志 Drawer ====== */}
      <Drawer
        title="投递日志"
        open={logDrawer.open}
        onClose={() => setLogDrawer({ open: false })}
        width={720}
      >
        {logDrawer.webhookId && (
          <ProTable<any>
            rowKey="id"
            request={async (params) => {
              const res = await request<{ data: any[]; total: number }>(`/api/system/webhooks/${logDrawer.webhookId}/logs`, {
                params: { pageNum: params.current, pageSize: params.pageSize },
              });
              return { data: res.data ?? [], total: res.total ?? 0, success: true };
            }}
            search={false}
            columns={[
              { title: '时间', dataIndex: 'created_at', width: 150, valueType: 'dateTime' },
              { title: '事件', dataIndex: 'event', width: 120 },
              {
                title: '状态', dataIndex: 'status', width: 80,
                render: (_, r) => r.status === 'success' ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
              },
              { title: '响应码', dataIndex: 'response_code', width: 80 },
              { title: '错误', dataIndex: 'error_message', ellipsis: true, width: 200 },
              { title: '重试次数', dataIndex: 'attempt', width: 80 },
            ]}
            pagination={{ defaultPageSize: 10 }}
          />
        )}
      </Drawer>
    </PageContainer>
  );
}
