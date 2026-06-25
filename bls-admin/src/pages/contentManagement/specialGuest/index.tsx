import CrudTablePage from '@/components/CrudTablePage';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { ProColumns } from '@ant-design/pro-components';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Drawer, Form, Image, Input, Select, Space, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useMemo, useState } from 'react';
import { createSpecialGuest, getSpecialGuest, updateSpecialGuest } from './api';
import type { SpecialGuestRecord } from './type';

function SpecialGuestPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialGuestRecord | null>(null);
  const [form] = Form.useForm();
  const [tableKey, setTableKey] = useState(0);
  const [avatarFileList, setAvatarFileList] = useState<UploadFile[]>([]);
  const { upload: uploadAvatar, uploading: avatarUploading } = useFileUpload({
    uploadUrl: '/api/system/storage/upload',
    defaultData: {
      accessType: 'public',
      moduleName: 'special-guest',
    },
  });

  const columns: ProColumns<SpecialGuestRecord>[] = [
    { title: '姓名', dataIndex: 'name', key: 'name', ellipsis: true, search: true },
    { title: '职务/头衔', dataIndex: 'title', key: 'title', ellipsis: true, search: true },
    { title: '排序', dataIndex: 'sortNo', key: 'sortNo', width: 100, search: false },
    {
      title: '头像',
      dataIndex: 'avatar',
      key: 'avatar',
      search: false,
      width: 120,
      render: (_, record) =>
        record.avatar ? (
          <Image src={record.avatar} width={56} height={56} style={{ objectFit: 'cover' }} />
        ) : (
          '-'
        ),
    },
    { title: '简介', dataIndex: 'description', key: 'description', ellipsis: true, search: false },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      search: false,
      width: 120,
      valueEnum: {
        0: { text: '未发布', status: 'Default' },
        1: { text: '已发布', status: 'Success' },
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', search: false },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', search: false },
  ];

  const refreshTable = () => setTableKey((key) => key + 1);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, sortNo: 1 });
    setAvatarFileList([]);
    setDrawerOpen(true);
  };

  const openEdit = async (record: SpecialGuestRecord) => {
    const detail = await getSpecialGuest(String(record.id));
    const data = (detail?.data ?? record) as SpecialGuestRecord;
    setEditing(data);
    setAvatarFileList(
      data.avatar ? [{ uid: String(data.id), name: 'avatar', status: 'done', url: data.avatar }] : [],
    );
    form.setFieldsValue({ ...data, status: Number(data.status ?? 1) });
    setDrawerOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      sortNo: Number(values.sortNo ?? 0),
      status: Number(values.status ?? 1),
      id: editing?.id != null ? String(editing.id) : undefined,
    };
    const res = editing
      ? await updateSpecialGuest(payload as SpecialGuestRecord & { id: string })
      : await createSpecialGuest(payload as SpecialGuestRecord);
    if (res?.code === 200) {
      message.success(editing ? '修改成功' : '新增成功');
      setDrawerOpen(false);
      setEditing(null);
      setAvatarFileList([]);
      form.resetFields();
      refreshTable();
    }
  };

  const uploadAvatarImage = async (file: File) => {
    const result = await uploadAvatar({ file, filename: file.name });
    if (!result.url) throw new Error('上传成功，但未获取到图片地址');
    form.setFieldValue('avatar', result.url);
    setAvatarFileList([{ uid: `${Date.now()}`, name: file.name, status: 'done', url: result.url }]);
  };

  const avatarPreview = useMemo(() => avatarFileList[0]?.url, [avatarFileList]);

  return (
    <>
      <CrudTablePage<SpecialGuestRecord>
        key={tableKey}
        title="特邀嘉宾"
        rowKey="id"
        resource={{ basePath: '/api/content-management/special-guest', status: false }}
        columns={columns}
        formColumns={[]}
        modalWidth={920}
        scroll={{ x: 'max-content' }}
        defaultSearchMode="fuzzy"
        showCreateButton={false}
        showEditAction={false}
        showFormModal={false}
        
        extraActions={(record) => [
          <a key="edit" onClick={() => openEdit(record)}>编辑</a>,
          <a
            key="status"
            onClick={async () => {
              const nextStatus = String(record.status) === '1' ? 0 : 1;
              const actionText = String(record.status) === '1' ? '下线' : '发布';
              const res = await fetch('/api/content-management/special-guest/status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: record.id, status: nextStatus }),
              });
              if (res.ok) {
                message.success(`${actionText}成功`);
                refreshTable();
              }
            }}
          >
            {String(record.status) === '1' ? '下线' : '发布'}
          </a>,
        ]}
        toolbarExtra={[<Button key="create-guest" type="primary" onClick={openCreate}>新增嘉宾</Button>]}
      />

      <Drawer
        title={editing ? '编辑嘉宾' : '新增嘉宾'}
        open={drawerOpen}
        width={980}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={submit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ status: 1, sortNo: 1 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="职务/头衔">
            <Input />
          </Form.Item>
          <Form.Item name="sortNo" label="排序" rules={[{ required: true, message: '请输入排序' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="avatar" label="头像">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Upload
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    await uploadAvatarImage(file);
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : '头像上传失败');
                  }
                  return false;
                }}
              >
                <Button icon={<PlusOutlined />} loading={avatarUploading}>上传头像</Button>
              </Upload>
              {avatarPreview ? <Image src={avatarPreview} width={160} /> : null}
              <Input placeholder="也可以直接填图片 URL" />
            </Space>
          </Form.Item>
          <Form.Item name="description" label="简介">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { label: '未发布', value: 0 },
                { label: '已发布', value: 1 },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}

export default SpecialGuestPage;
