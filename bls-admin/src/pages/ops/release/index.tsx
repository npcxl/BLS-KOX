import { PageContainer, ProTable, ProDescriptions } from '@ant-design/pro-components';
import { Badge, Button, Card, Col, Form, Input, Modal, Row, Select, Space, Steps, Tag, message, Popconfirm } from 'antd';
import { CloudUploadOutlined, RollbackOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEffect, useState, useRef, useCallback } from 'react';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { usePermission } from '@/hooks/usePermission';
import {
  getReleaseList, getReleaseDetail, getReleaseSteps, getReleaseLogs,
  createRelease, rollbackRelease, getReleaseVersions, getServiceStatus,
  getCurrentVersion, getRunningTask,
} from '@/services/ops/release';
import type { ReleaseTask, ReleaseStep, DeployableVersion, CurrentVersion, ServiceStatus } from '@/services/ops/release';

const statusMap: Record<string, { text: string; status: 'success' | 'processing' | 'error' | 'warning' | 'default' }> = {
  pending: { text: '待执行', status: 'default' },
  checking: { text: '校验中', status: 'processing' },
  waiting_approval: { text: '待审批', status: 'warning' },
  running: { text: '执行中', status: 'processing' },
  success: { text: '成功', status: 'success' },
  failed: { text: '失败', status: 'error' },
  rolling_back: { text: '回滚中', status: 'warning' },
  rolled_back: { text: '已回滚', status: 'default' },
  cancelled: { text: '已取消', status: 'default' },
};

export default function OpsReleasePage() {
  const { can } = usePermission();
  const canCreate = can('ops:release:create');
  const canRollback = can('ops:release:rollback');
  const canLogs = can('ops:release:logs');
  const canServiceView = can('ops:service:view');

  const actionRef = useRef<ActionType>();
  const [currentVer, setCurrentVer] = useState<CurrentVersion | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [versions, setVersions] = useState<DeployableVersion[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<any>(null);
  const [confirmText, setConfirmText] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<ReleaseTask | null>(null);
  const [detailSteps, setDetailSteps] = useState<ReleaseStep[]>([]);
  const [detailLogs, setDetailLogs] = useState<string[]>([]);
  const [form] = Form.useForm();

  const fetchStatus = useCallback(async () => {
    const [ver, svc, running] = await Promise.all([
      getCurrentVersion().catch(() => null),
      canServiceView ? getServiceStatus().catch(() => null) : null,
      getRunningTask().catch(() => null),
    ]);
    setCurrentVer(ver);
    setServiceStatus(svc);
    if (running) actionRef.current?.reload();
  }, [canServiceView]);

  useEffect(() => {
    fetchStatus();
    const t = window.setInterval(fetchStatus, 10000);
    return () => window.clearInterval(t);
  }, [fetchStatus]);

  // 详情弹窗实时刷新
  useEffect(() => {
    if (!detailOpen || !detailTask) return;
    const t = window.setInterval(async () => {
      try {
        const [task, steps, logs] = await Promise.all([
          getReleaseDetail(detailTask.taskId),
          getReleaseSteps(detailTask.taskId),
          canLogs ? getReleaseLogs(detailTask.taskId, 100) : [],
        ]);
        setDetailTask(task);
        setDetailSteps(steps);
        setDetailLogs(logs.map((l: any) => `[${l.level}] ${l.message}`));
        if (['success', 'failed', 'rolled_back', 'cancelled'].includes(task.status)) {
          actionRef.current?.reload();
          fetchStatus();
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => window.clearInterval(t);
  }, [detailOpen, detailTask?.taskId, canLogs, fetchStatus]);

  const handleCreateSubmit = async () => {
    const vals = await form.validateFields();
    setPendingCreate(vals);
    setConfirmText('');
    setConfirmOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (!pendingCreate) return;
    // 生产环境必须输入确认文字
    if (pendingCreate.environment === 'production' && confirmText !== '确认发布') {
      message.warning('请输入"确认发布"以继续');
      return;
    }
    try {
      const res = await createRelease(pendingCreate);
      if (res.code === 200) {
        message.success('发布任务已创建');
        setCreateOpen(false);
        setConfirmOpen(false);
        setPendingCreate(null);
        setConfirmText('');
        form.resetFields();
        actionRef.current?.reload();
        fetchStatus();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (err: any) {
      message.error(err?.message || '创建失败');
    }
  };

  const columns: ProColumns<ReleaseTask>[] = [
    { title: '任务ID', dataIndex: 'taskId', width: 100, ellipsis: true, copyable: true },
    { title: '环境', dataIndex: 'environment', width: 80, valueEnum: { production: { text: '生产', status: 'Error' }, staging: { text: '预发布', status: 'Warning' } } },
    { title: '操作', dataIndex: 'action', width: 60, valueEnum: { deploy: '部署', rollback: '回滚' } },
    { title: '版本', dataIndex: 'targetVersion', width: 90, render: (_, r) => <Tag>v{r.targetVersion}</Tag> },
    { title: '服务', dataIndex: 'services', width: 160, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80, render: (_, r) => {
      const s = statusMap[r.status] || { text: r.status, status: 'default' as const };
      return <Badge status={s.status} text={s.text} />;
    }},
    { title: '进度', dataIndex: 'progress', width: 60, render: (_, r) => `${r.progress}%` },
    { title: '触发人', dataIndex: 'triggeredByName', width: 70 },
    { title: '时间', dataIndex: 'createTime', width: 140, valueType: 'dateTime' },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Space>
          <a onClick={async () => {
            const task = await getReleaseDetail(r.taskId);
            const steps = await getReleaseSteps(r.taskId);
            const logs = canLogs ? await getReleaseLogs(r.taskId, 50) : [];
            setDetailTask(task);
            setDetailSteps(steps);
            setDetailLogs(logs.map((l: any) => `[${l.level}] ${l.message}`));
            setDetailOpen(true);
          }}>详情</a>
          {r.status === 'failed' && canRollback && (
            <Popconfirm title="确认回滚" description={`回滚到 ${r.fromVersion || '上一版本'}？`}
              onConfirm={async () => {
                await rollbackRelease(r.taskId);
                message.success('回滚已触发');
                actionRef.current?.reload();
                fetchStatus();
              }}
              okText="确认回滚" okButtonProps={{ danger: true }}>
              <a style={{ color: '#ff4d4f' }}>回滚</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer>
      {/* 状态卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={canServiceView ? 6 : 8}>
          <Card size="small" title="当前版本" extra={<ReloadOutlined onClick={fetchStatus} style={{ cursor: 'pointer' }} />}>
            <Tag color="blue" style={{ fontSize: 16, margin: 0 }}>{currentVer?.version || '未知'}</Tag>
            {currentVer?.deployedAt && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{currentVer.deployedAt}</div>}
          </Card>
        </Col>
        <Col span={canServiceView ? 6 : 8}>
          <Card size="small" title="上一版本">
            <Tag>{currentVer?.previousVersion || '无'}</Tag>
          </Card>
        </Col>
        {canServiceView && (
          <Col span={6}>
            <Card size="small" title="环境"><Tag color="green">{serviceStatus?.environment || 'production'}</Tag></Card>
          </Col>
        )}
        <Col span={canServiceView ? 6 : 8}>
          <Card size="small" title="进行中任务">
            {serviceStatus?.runningTask ? (
              <Tag color="processing">{statusMap[serviceStatus.runningTask.status]?.text} ({serviceStatus.runningTask.progress}%)</Tag>
            ) : <Tag>无</Tag>}
          </Card>
        </Col>
      </Row>

      {canCreate && (
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<CloudUploadOutlined />}
            onClick={() => { form.resetFields(); getReleaseVersions().then(setVersions); setCreateOpen(true); }}>
            创建发布
          </Button>
        </Space>
      )}

      <ProTable<ReleaseTask>
        actionRef={actionRef} rowKey="taskId" columns={columns}
        request={async (params) => {
          const res = await getReleaseList({ pageNum: params.current, pageSize: params.pageSize });
          return { data: res.data || [], total: res.total || 0, success: res.code === 200 };
        }}
        search={false} scroll={{ x: 1050 }}
      />

      {/* 创建发布表单 */}
      <Modal title="创建发布任务" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={handleCreateSubmit} width={520} destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="environment" label="环境" initialValue="production" rules={[{ required: true }]}>
            <Select options={[
              { label: '生产环境 (production)', value: 'production' },
              { label: '预发布环境 (staging)', value: 'staging' },
            ]} />
          </Form.Item>
          <Form.Item name="version" label="版本号" rules={[{ required: true, message: '请选择版本' }]}>
            <Select showSearch placeholder="选择版本"
              options={versions.filter(v => v.available).map(v => ({ label: `v${v.version}`, value: v.version }))} />
          </Form.Item>
          <Form.Item name="services" label="服务" rules={[{ required: true, message: '至少选择一个服务' }]}>
            <Select mode="multiple" placeholder="选择要发布的服务" options={[
              { label: 'bls-admin', value: 'bls-admin' },
              { label: 'bls-server', value: 'bls-server' },
              { label: 'bls-ai-service', value: 'bls-ai-service' },
              { label: 'bls-event-service', value: 'bls-event-service' },
              { label: 'bls-java-server', value: 'bls-java-server' },
            ]} />
          </Form.Item>
          <Form.Item name="reason" label="发布原因" rules={[{ required: true, message: '请填写原因' }, { max: 500 }]}>
            <Input.TextArea rows={3} placeholder="请输入发布原因" maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 二次确认 */}
      <Modal title="确认生产发布" open={confirmOpen}
        onOk={handleConfirmCreate} onCancel={() => { setConfirmOpen(false); setPendingCreate(null); setConfirmText(''); }}
        okText={pendingCreate?.environment === 'production' ? '确认发布到生产' : '确认发布'}
        okButtonProps={{
          danger: pendingCreate?.environment === 'production',
          disabled: pendingCreate?.environment === 'production' && confirmText !== '确认发布',
        }}
        width={480}>
        {pendingCreate && (
          <div>
            <p style={{ fontSize: 15, marginBottom: 16 }}>
              确认将以下版本发布到
              <Tag color={pendingCreate.environment === 'production' ? 'red' : 'orange'} style={{ marginLeft: 8 }}>
                {pendingCreate.environment === 'production' ? '生产环境' : '预发布环境'}
              </Tag>
            </p>
            <ProDescriptions column={1} size="small" bordered>
              <ProDescriptions.Item label="当前版本"><Tag>{currentVer?.version || '未知'}</Tag></ProDescriptions.Item>
              <ProDescriptions.Item label="目标版本"><Tag color="blue">v{pendingCreate.version}</Tag></ProDescriptions.Item>
              <ProDescriptions.Item label="服务">{pendingCreate.services?.join(', ')}</ProDescriptions.Item>
              <ProDescriptions.Item label="回滚版本"><Tag>{currentVer?.version || '无'}</Tag></ProDescriptions.Item>
              <ProDescriptions.Item label="原因">{pendingCreate.reason}</ProDescriptions.Item>
            </ProDescriptions>
            {pendingCreate.environment === 'production' && (
              <>
                <p style={{ color: '#ff4d4f', marginTop: 16, fontWeight: 500 }}>
                  ⚠️ 这是生产环境发布，将影响线上用户。
                </p>
                <Form.Item style={{ marginTop: 12 }}>
                  <Input
                    placeholder='输入 "确认发布" 以继续'
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                  />
                </Form.Item>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 任务详情（实时刷新） */}
      <Modal title={`任务详情 — ${detailTask?.taskId || ''}`} open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetailTask(null); }}
        footer={
          detailTask?.status === 'failed' && canRollback ? (
            <Popconfirm title="确认回滚" description={`回滚到 ${detailTask.fromVersion || '上一版本'}？`}
              onConfirm={async () => {
                if (!detailTask) return;
                await rollbackRelease(detailTask.taskId);
                message.success('回滚已触发');
                setDetailOpen(false);
                actionRef.current?.reload();
                fetchStatus();
              }}
              okText="确认回滚" okButtonProps={{ danger: true }}>
              <Button danger icon={<RollbackOutlined />}>回滚</Button>
            </Popconfirm>
          ) : <Button onClick={() => setDetailOpen(false)}>关闭</Button>
        }
        width={720}>
        {detailTask && (
          <>
            <ProDescriptions column={2} size="small" bordered dataSource={detailTask}>
              <ProDescriptions.Item label="任务ID" dataIndex="taskId" copyable />
              <ProDescriptions.Item label="状态" render={() => {
                const s = statusMap[detailTask.status] || { text: detailTask.status, status: 'default' as const };
                return <Badge status={s.status} text={s.text} />;
              }} />
              <ProDescriptions.Item label="环境" dataIndex="environment" />
              <ProDescriptions.Item label="目标版本" render={() => <Tag>v{detailTask.targetVersion}</Tag>} />
              <ProDescriptions.Item label="服务" dataIndex="services" span={2} />
              <ProDescriptions.Item label="原因" dataIndex="reason" span={2} />
              <ProDescriptions.Item label="进度" render={() => `${detailTask.progress}%`} />
              <ProDescriptions.Item label="触发人" dataIndex="triggeredByName" />
              {detailTask.errorMessage && (
                <ProDescriptions.Item label="错误" span={2}><span style={{ color: '#ff4d4f' }}>{detailTask.errorMessage}</span></ProDescriptions.Item>
              )}
            </ProDescriptions>
            {detailSteps.length > 0 && (
              <Card title="发布步骤" size="small" style={{ marginTop: 16 }}>
                <Steps direction="vertical" size="small"
                  current={detailSteps.findIndex(s => s.status === 'running')}
                  items={detailSteps.map(s => ({
                    title: s.stepName,
                    description: s.message || (s.status === 'waiting' ? '等待中' : `${s.progress}%`),
                    status: s.status === 'success' ? 'finish' : s.status === 'failed' ? 'error' : s.status === 'running' ? 'process' : 'wait',
                  }))} />
              </Card>
            )}
            {detailLogs.length > 0 && (
              <Card title={`日志 (${detailLogs.length} 条)`} size="small" style={{ marginTop: 16 }}>
                <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 12, background: '#f5f5f5', padding: 8, margin: 0, borderRadius: 4 }}>
                  {detailLogs.join('\n')}
                </pre>
              </Card>
            )}
          </>
        )}
      </Modal>
    </PageContainer>
  );
}
