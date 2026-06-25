import CrudTablePage from '@/components/CrudTablePage';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { ProColumns } from '@ant-design/pro-components';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Drawer, Form, Input, Select, Space, Upload, message } from 'antd';
import { useMemo, useState } from 'react';
import type { UploadFile } from 'antd/es/upload/interface';
import type { DownloadRecord } from './type';
import { createDownload, getDownload, updateDownload } from './api';

function formatBytes(value?: number | string | null) {
  const size = Number(value ?? 0);
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Download() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DownloadRecord | null>(null);
  const [form] = Form.useForm();
  const [tableKey, setTableKey] = useState(0);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const { upload, uploading } = useFileUpload({
    uploadUrl: '/api/system/storage/upload',
    defaultData: {
      accessType: 'public',
      moduleName: 'download-center',
    },
  });

  const columns: ProColumns<DownloadRecord>[] = useMemo(
    () => [
      { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true, search: true },
      { title: '文件格式', dataIndex: 'fileFormat', key: 'fileFormat', width: 120, search: true },
      {
        title: '文件大小',
        dataIndex: 'fileSize',
        key: 'fileSize',
        width: 120,
        search: false,
        render: (_, record) => formatBytes(record.fileSize),
      },
      { title: '上传时间', dataIndex: 'uploadTime', key: 'uploadTime', search: false },
      { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', search: false },
    ],
    [],
  );

  const refreshTable = () => setTableKey((key) => key + 1);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ fileFormat: 'pdf' });
    setFileList([]);
    setDrawerOpen(true);
  };

  const openEdit = async (record: DownloadRecord) => {
    const detail = await getDownload(String(record.id));
    const data = (detail?.data ?? record) as DownloadRecord;
    setEditing(data);
    form.setFieldsValue(data);
    setFileList(data.fileUrl ? [{ uid: String(data.id), name: data.fileName, status: 'done', url: data.fileUrl }] : []);
    setDrawerOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      id: editing?.id != null ? String(editing.id) : undefined,
      fileSize: Number(values.fileSize ?? 0),
    };
    const res = editing ? await updateDownload(payload as DownloadRecord & { id: string }) : await createDownload(payload as DownloadRecord);
    if (res?.code === 200) {
      message.success(editing ? '修改成功' : '新增成功');
      setDrawerOpen(false);
      setEditing(null);
      setFileList([]);
      form.resetFields();
      refreshTable();
    }
  };

  const uploadFile = async (file: File) => {
    const result = await upload({ file, filename: file.name });
    if (!result.url) throw new Error('上传成功，但未获取到文件地址');
    form.setFieldsValue({
      fileUrl: result.url,
      fileName: form.getFieldValue('fileName') || file.name,
      fileSize: file.size,
      fileFormat: file.name.split('.').pop()?.toLowerCase() || 'pdf',
    });
    setFileList([{ uid: `${Date.now()}`, name: file.name, status: 'done', url: result.url }]);
  };

  return (
    <>
      <CrudTablePage<DownloadRecord>
        key={tableKey}
        title="下载中心"
        rowKey="id"
        resource={{ basePath: '/api/content-management/download' }}
        columns={columns}
        formColumns={[]}
        showCreateButton={false}
        showEditAction={false}
        showFormModal={false}
        extraActions={(record) => [<a key="edit" onClick={() => openEdit(record)}>编辑</a>]}
        toolbarExtra={[<Button key="create-download" type="primary" onClick={openCreate}>新增文件</Button>]}
      />

      <Drawer
        title={editing ? '编辑文件' : '新增文件'}
        open={drawerOpen}
        width={900}
        destroyOnClose
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={submit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ fileFormat: 'pdf' }}>
          <Form.Item name="fileName" label="文件名" rules={[{ required: true, message: '请输入文件名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="fileFormat" label="文件格式" rules={[{ required: true, message: '请选择文件格式' }]}>
            <Select options={[{ label: 'PDF', value: 'pdf' }, { label: 'DOCX', value: 'docx' }, { label: 'XLSX', value: 'xlsx' }]} />
          </Form.Item>
          <Form.Item name="fileSize" label="文件大小(字节)" rules={[{ required: true, message: '请输入文件大小' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="fileUrl" label="文件地址" rules={[{ required: true, message: '请上传文件' }]}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Upload
                accept=".pdf,.docx,.xlsx"
                maxCount={1}
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    await uploadFile(file);
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : '文件上传失败');
                  }
                  return false;
                }}
              >
                <Button icon={<PlusOutlined />} loading={uploading}>上传文件</Button>
              </Upload>
              {fileList.length ? <span>已选择：{fileList[0].name}</span> : null}
              <Input placeholder="也可以直接填写文件 URL" />
            </Space>
          </Form.Item>
          <Form.Item name="uploadTime" label="上传时间">
            <Input placeholder="2026-06-25 10:00:00" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
