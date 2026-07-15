import { PageContainer } from '@ant-design/pro-components';
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Form, Input, InputNumber, message, Select, Space, Table, Tag, TreeSelect, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined, UserOutlined } from '@ant-design/icons';
import { request } from '@umijs/max';
import { useDict } from '@/hooks/useDict';
import { listResource } from '@/services/system/crud';

const { Text } = Typography;

export type DeptRecord = {
  deptId: string;
  parentId: string;
  deptName: string;
  sortNum?: number;
  status: '0' | '1';
  children?: DeptRecord[];
};

function mapValueEnum(valueEnum: Record<string, { text: string }>) {
  return Object.fromEntries(Object.entries(valueEnum).map(([k, v]) => [k, v.text]));
}

function flattenDepts(nodes: DeptRecord[]): DeptRecord[] {
  const flat: DeptRecord[] = [];
  const walk = (list: DeptRecord[]) => {
    for (const n of list) {
      flat.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return flat;
}

export default function DeptPage() {
  const { valueEnum: statusValueEnum } = useDict('sys_status');

  useMemo(() => mapValueEnum(statusValueEnum), [statusValueEnum]);

  const [deptTree, setDeptTree] = useState<DeptRecord[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Partial<DeptRecord> | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadDeptTree = () => {
    listResource<DeptRecord>({ basePath: '/api/system/dept' }).then((res) => {
      if (res.code === 200 && res.data) {
        setDeptTree(res.data);
        if (!selectedDeptId && res.data.length > 0) {
          setSelectedDeptId(res.data[0].deptId);
        }
      }
    });
  };

  useEffect(() => { loadDeptTree(); }, []);

  // 加载用户
  useEffect(() => {
    if (!selectedDeptId) return;
    setUsersLoading(true);
    request(`/api/system/dept/${selectedDeptId}/users`, { method: 'GET' })
      .then((res: any) => { if (res.code === 200) setUsers(res.data ?? []); })
      .finally(() => setUsersLoading(false));
  }, [selectedDeptId]);

  const flatDepts = useMemo(() => flattenDepts(deptTree), [deptTree]);
  const selectedDept = useMemo(() => flatDepts.find(d => d.deptId === selectedDeptId), [flatDepts, selectedDeptId]);

  // 部门树数据（用于 TreeSelect）
  const treeData = useMemo(() => {
    const build = (nodes: DeptRecord[]): any[] => nodes.map(n => ({
      title: n.deptName, value: n.deptId, key: n.deptId,
      children: n.children ? build(n.children) : undefined,
    }));
    return [{ title: '根部门', value: '000000', key: '000000' }, ...build(deptTree)];
  }, [deptTree]);

  // 用户表格列
  const userColumns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
    { title: '邮箱', dataIndex: 'email', key: 'email', ellipsis: true },
    { title: '手机', dataIndex: 'phone', key: 'phone' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 60,
      render: (v: string) => v === '0' ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
  ];

  // 新增/编辑部门
  const openAdd = (parentDept?: DeptRecord) => {
    setEditingDept(null);
    form.resetFields();
    form.setFieldsValue({ parentId: parentDept?.deptId ?? '000000', status: '0', sortNum: 0 });
    setModalOpen(true);
  };
  const openEdit = (dept: DeptRecord) => {
    setEditingDept(dept);
    form.setFieldsValue({ deptName: dept.deptName, parentId: dept.parentId, sortNum: dept.sortNum, status: dept.status });
    setModalOpen(true);
  };
  const handleSave = async () => {
    try {
      await form.validateFields();
      setSaving(true);
      const values = form.getFieldsValue();
      const payload = { ...values };
      if (editingDept) {
        await request('/api/system/dept/edit', { method: 'PUT', data: { ...payload, deptId: editingDept.deptId } });
        message.success('修改成功');
      } else {
        await request('/api/system/dept/add', { method: 'POST', data: payload });
        message.success('新增成功');
      }
      setModalOpen(false);
      loadDeptTree();
    } finally { setSaving(false); }
  };
  const handleDelete = (dept: DeptRecord) => {
    request('/api/system/dept/remove', { method: 'DELETE', data: { ids: [dept.deptId] } })
      .then(() => { message.success('删除成功'); loadDeptTree(); });
  };

  return (
    <PageContainer title="部门管理" subTitle="管理组织架构及部门成员">
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 200px)' }}>
        {/* 左侧：部门列表 30% */}
        <div style={{ width: '30%', minWidth: 280, background: '#fff', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Space><ApartmentOutlined /><Text strong>部门列表</Text></Space>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openAdd()}>新增</Button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Table<DeptRecord & { _rowKey?: string }>
              rowKey="deptId"
              dataSource={flatDepts}
              pagination={false}
              size="small"
              showHeader={true}
              columns={[
                { title: '部门名称', dataIndex: 'deptName', key: 'deptName', ellipsis: true },
                {
                  title: '状态', dataIndex: 'status', key: 'status', width: 56,
                  render: (v: string) => v === '0' ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
                },
                {
                  title: '操作', key: 'action', width: 120,
                  render: (_: any, record: DeptRecord) => (
                    <Space size={0}>
                      <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openAdd(record)} />
                      <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
                    </Space>
                  ),
                },
              ]}
              onRow={(record) => ({
                onClick: () => setSelectedDeptId(record.deptId),
                style: {
                  cursor: 'pointer',
                  background: record.deptId === selectedDeptId ? '#e6f4ff' : undefined,
                },
              })}
              locale={{ emptyText: <Empty description="暂无部门" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>

        {/* 右侧：用户列表 70% */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 12 }}>
            <Space><UserOutlined /><Text strong>{selectedDept?.deptName ?? '选择部门'}</Text><Text type="secondary">— 部门成员</Text></Space>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Table
              rowKey="user_id"
              dataSource={users}
              columns={userColumns}
              pagination={false}
              size="small"
              loading={usersLoading}
              locale={{ emptyText: <Empty description="该部门暂无用户" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>
      </div>

      {/* 新增/编辑部门弹窗 */}
      <Form form={form} layout="vertical" style={{ display: modalOpen ? 'block' : 'none' }}>
        <div style={{ display: modalOpen ? 'block' : 'none' }}>
          <div style={{ display: 'none' }}>{/* Form needs to be mounted for getFieldsValue */}</div>
        </div>
      </Form>
      {modalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 480 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>{editingDept ? '编辑部门' : '新增部门'}</h3>
            <Form form={form} layout="vertical">
              <Form.Item name="parentId" label="上级部门" rules={[{ required: true }]}>
                <TreeSelect treeData={treeData} placeholder="请选择上级部门" treeDefaultExpandAll allowClear={false} />
              </Form.Item>
              <Form.Item name="deptName" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
                <Input placeholder="请输入部门名称" />
              </Form.Item>
              <Form.Item name="sortNum" label="排序" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="status" label="状态" initialValue="0">
                <Select options={[{ label: '启用', value: '0' }, { label: '停用', value: '1' }]} />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setModalOpen(false)}>取消</Button>
                <Button type="primary" loading={saving} onClick={handleSave}>确定</Button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
