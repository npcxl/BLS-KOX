import CrudTablePage from '@/components/CrudTablePage';
import RichTextEditor from '@/components/RichTextEditor';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { ProColumns } from '@ant-design/pro-components';
import { PlusOutlined } from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  Space,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { createNews, getNews, updateNews } from './api';
import type { NewsRecord } from './type';

function News() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NewsRecord | null>(null);
  const [form] = Form.useForm();
  const [tableKey, setTableKey] = useState(0);
  const [coverFileList, setCoverFileList] = useState<UploadFile[]>([]);
  const { upload: uploadCover, uploading: coverUploading } = useFileUpload({
    uploadUrl: '/api/system/storage/upload',
    defaultData: {
      accessType: 'public',
      moduleName: 'news',
    },
  });

  const columns: ProColumns<NewsRecord>[] = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, search: true },
    { title: '副标题', dataIndex: 'subtitle', key: 'subtitle', ellipsis: true, search: true },
    {
      title: '封面图',
      dataIndex: 'coverImage',
      key: 'coverImage',
      search: false,
      width: 120,
      render: (_, record) =>
        record.coverImage ? (
          <Image src={record.coverImage} width={80} height={80} style={{ objectFit: 'cover' }} />
        ) : (
          '-'
        ),
    },
    { title: '发布日期', dataIndex: 'publishDate', key: 'publishDate', search: false },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', search: false },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', search: false },
  ];

  const refreshTable = () => setTableKey((key) => key + 1);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ content: '' });
    setCoverFileList([]);
    setDrawerOpen(true);
  };

  const openEdit = async (record: NewsRecord) => {
    const detail = await getNews(String(record.id));
    const data = (detail?.data ?? record) as NewsRecord;
    setEditing(data);
    setCoverFileList(
      data.coverImage
        ? [{ uid: String(data.id), name: 'cover', status: 'done', url: data.coverImage }]
        : [],
    );
    form.setFieldsValue({ ...data, publishDate: data.publishDate ? dayjs(data.publishDate) : undefined });
    setDrawerOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      publishDate: values.publishDate ? (values.publishDate as Dayjs).format('YYYY-MM-DD HH:mm:ss') : null,
      id: editing?.id != null ? String(editing.id) : undefined,
    };
    const res = editing ? await updateNews(payload as NewsRecord & { id: string }) : await createNews(payload as NewsRecord);
    if (res?.code === 200) {
      message.success(editing ? '修改成功' : '新增成功');
      setDrawerOpen(false);
      setEditing(null);
      setCoverFileList([]);
      form.resetFields();
      refreshTable();
    }
  };

  const uploadCoverImage = async (file: File) => {
    const result = await uploadCover({ file, filename: file.name });
    if (!result.url) throw new Error('上传成功，但未获取到图片地址');
    form.setFieldValue('coverImage', result.url);
    setCoverFileList([{ uid: `${Date.now()}`, name: file.name, status: 'done', url: result.url }]);
  };

  const coverImagePreview = useMemo(() => coverFileList[0]?.url, [coverFileList]);

  return (
    <>
      <CrudTablePage<NewsRecord>
        key={tableKey}
        title="新闻资讯"
        rowKey="id"
        resource={{ basePath: '/api/content-management/news' }}
        columns={columns}
        formColumns={[]}
        modalWidth={920}
        scroll={{ x: 'max-content' }}
        defaultSearchMode="fuzzy"
        showCreateButton={false}
        showEditAction={false}
        showFormModal={false}
        extraActions={(record) => [<a key="edit" onClick={() => openEdit(record)}>编辑</a>]}
        toolbarExtra={[<Button key="create-news" type="primary" onClick={openCreate}>新增</Button>]}
      />

      <Drawer
        title={editing ? '编辑新闻' : '新增新闻'}
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
        <Form form={form} layout="vertical" initialValues={{ content: '' }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="subtitle" label="副标题">
            <Input />
          </Form.Item>
          <Form.Item name="coverImage" label="首图">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Upload
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    await uploadCoverImage(file);
                  } catch (error) {
                    message.error(error instanceof Error ? error.message : '封面上传失败');
                  }
                  return false;
                }}
              >
                <Button icon={<PlusOutlined />} loading={coverUploading}>上传封面</Button>
              </Upload>
              {coverImagePreview ? <Image src={coverImagePreview} width={160} /> : null}
              <Input placeholder="也可以直接填图片 URL" />
            </Space>
          </Form.Item>
          <Form.Item name="publishDate" label="发布日期">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <RichTextEditor placeholder="请输入新闻正文，支持上传图片插入到正文" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}

export default News;
