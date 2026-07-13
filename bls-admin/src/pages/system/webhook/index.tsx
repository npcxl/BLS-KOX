/**
 * P12: Webhook 管理页面
 * - 动态列配置 (usePageConfig)
 * - 字典支持 (status 字段)
 * - 自定义操作：测试发送 / 投递日志 / 编辑 / 删除
 */
import { request } from '@umijs/max';
import { PageContainer, ProCard, ProTable } from '@ant-design/pro-components';
import { Button, Drawer, Form, Input, message, Modal, Popconfirm, Select, Space, Tag } from 'antd';
import { PlusOutlined, SendOutlined, LinkOutlined } from '@ant-design/icons';
import { useRef, useState } from 'react';
import { useMultiDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';
import { usePermission } from '@/hooks/usePermission';

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

  // 权限
  const { can } = usePermission();
  const canAdd = can('system:webhook:add');
  const canEdit = can('system:webhook:edit');
  const canRemove = can('system:webhook:remove');
  const canTest = can('system:webhook:test');
  const canLogs = can('system:webhook:logs');

  // 字典 — status 字段用 sys_status (0=正常,1=停用)
  const multiDict = useMultiDict(['sys_status']) as any;
  const statusEnum = (multiDict?.sys_status?.valueEnum ?? {}) as Record<string, { text: string; color?: string }>;

  // 动态列配置
  const { proColumns, loading: columnsLoading, dictValueEnums } = usePageConfig('system:webhook:list') as any;

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const body = { ...values, events: values.events ?? [] };
    if (editing) {
      const eid = editing.webhook_id || editing.webhookId;
      await request(`/api/system/webhooks/${eid}`, { method: 'PUT', data: body });
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

  // 自定义操作列（测试 + 日志 + 编辑 + 删除）
  const actionColumn = {
    title: '操作', width: 280, fixed: 'right',
    render: (_: any, record: any) => (
      <Space>
        {canLogs && (
          <a onClick={() => { setLogDrawer({ open: true, webhookId: record.webhook_id || record.webhookId }); }}>日志</a>
        )}
        {canTest && (
          <Popconfirm title="确定发送测试?" onConfirm={async () => {
            const wid = record.webhook_id || record.webhookId;
            const res = await request<{ code: number; message?: string; data?: any }>(`/api/system/webhooks/${wid}/test`, { method: 'POST' });
            if (res.code === 200) {
              message.success(`测试成功 (${res.data?.elapsedMs ?? '?'}ms)`);
            } else {
              message.warning(res.message ?? '发送失败');
            }
          }}>
            <a><SendOutlined /> 测试</a>
          </Popconfirm>
        )}
        {canEdit && (
          <a onClick={() => {
            setEditing(record);
            form.setFieldsValue({
              name: record.name, url: record.url,
              status: record.status,
              events: typeof record.events === 'string' ? JSON.parse(record.events) : record.events,
            });
            setModalOpen(true);
          }}>编辑</a>
        )}
        {canRemove && (
          <Popconfirm title="确定删除?" onConfirm={async () => {
            const wid = record.webhook_id || record.webhookId;
            await request(`/api/system/webhooks/${wid}`, { method: 'DELETE' });
            message.success('已删除');
            actionRef.current?.reload();
          }}>
            <a style={{ color: 'red' }}>删除</a>
          </Popconfirm>
        )}
      </Space>
    ),
  };

  // 合并动态列 + action 列，status 用 Tag 渲染（ProTable Badge 不认 dict 的 color 字段）
  const colorToStatus: Record<string, string> = { green: 'success', red: 'error', blue: 'processing', orange: 'warning' };
  const columns = [
    ...(proColumns ?? []).map((col: any) => {
      if (col.dataIndex === 'status' && col.valueEnum) {
        return {
          ...col,
          render: (_: any, r: any) => {
            const item = col.valueEnum?.[r.status];
            if (!item) return r.status ?? '-';
            return <Tag color={colorToStatus[item.color] || 'default'}>{item.text}</Tag>;
          },
        };
      }
      return col;
    }),
    actionColumn,
  ];

  // 投递日志列
  const logColumns = [
    { title: '时间', dataIndex: 'createdAt', width: 150, valueType: 'dateTime' as const },
    { title: '事件', dataIndex: 'event', width: 120 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (_: any, r: any) => r.status === 'success' ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
    },
    { title: '响应码', dataIndex: 'responseCode', width: 80 },
    { title: '错误', dataIndex: 'errorMessage', ellipsis: true, width: 200 },
    { title: '重试', dataIndex: 'attempt', width: 60 },
  ];

  return (
    <PageContainer header={{ title: <Space><LinkOutlined />Webhook 管理</Space> }} loading={columnsLoading}>
      <ProCard
        extra={
          canAdd && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
              注册 Webhook
            </Button>
          )
        }
      >
        <ProTable<any>
          actionRef={actionRef}
          rowKey="webhookId"
          request={async () => {
            const res = await request<{ data: any[] }>('/api/system/webhooks');
            return { data: res.data ?? [], total: (res.data ?? []).length, success: true };
          }}
          columns={columns}
          search={false}
          pagination={false}
        />
      </ProCard>

      {/* 注册/编辑 Modal */}
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
            <Select mode="multiple" placeholder="选择事件类型" options={EVENT_OPTIONS} />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="状态">
              <Select
                options={Object.entries(statusEnum).map(([k, v]) => ({ label: v.text, value: k }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 投递日志 Drawer */}
      <Drawer title="投递日志" open={logDrawer.open} onClose={() => setLogDrawer({ open: false })} width={720}>
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
            columns={logColumns}
            pagination={{ defaultPageSize: 10 }}
          />
        )}
      </Drawer>
    </PageContainer>
  );
}
