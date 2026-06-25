import CrudTablePage from '@/components/CrudTablePage';
import RichTextEditor from '@/components/RichTextEditor';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { ProColumns } from '@ant-design/pro-components';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  Select,
  Space,
  TimePicker,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { createMeeting, getMeeting, updateMeeting } from './api';
import type { MeetingAgenda, MeetingGuest, MeetingRecord } from './type';

function normalizeGuests(value?: MeetingGuest[] | string | null): MeetingGuest[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAgendaTime(time?: string | null) {
  if (!time || typeof time !== 'string') return undefined;
  const [start, end] = time.split('-').map((item) => item.trim()).filter(Boolean);
  if (!start || !end) return undefined;
  return [dayjs(`2000-01-01 ${start}`), dayjs(`2000-01-01 ${end}`)];
}

function normalizeAgenda(value?: MeetingAgenda[] | string | null): MeetingAgenda[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function MeetingPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingRecord | null>(null);
  const [form] = Form.useForm();
  const [tableKey, setTableKey] = useState(0);
  const [coverFileList, setCoverFileList] = useState<UploadFile[]>([]);
  const { upload: uploadCover, uploading: coverUploading } = useFileUpload({
    uploadUrl: '/api/system/storage/upload',
    defaultData: {
      accessType: 'public',
      moduleName: 'meeting',
    },
  });

  const columns: ProColumns<MeetingRecord>[] = [
    { title: '会议名称', dataIndex: 'meetingName', key: 'meetingName', ellipsis: true, search: true },
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
    { title: '会议时间', dataIndex: 'meetingTime', key: 'meetingTime', search: false },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      search: false,
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
    form.setFieldsValue({ content: '', guests: [{}], agenda: [{}], status: 0 });
    setCoverFileList([]);
    setDrawerOpen(true);
  };

  const openEdit = async (record: MeetingRecord) => {
    const detail = await getMeeting(String(record.id));
    const data = (detail?.data ?? record) as MeetingRecord;
    setEditing(data);
    setCoverFileList(
      data.coverImage
        ? [{ uid: String(data.id), name: 'cover', status: 'done', url: data.coverImage }]
        : [],
    );
    form.setFieldsValue({
      ...data,
      meetingTime: data.meetingTime ? dayjs(data.meetingTime) : undefined,
      guests: normalizeGuests(data.guests).length ? normalizeGuests(data.guests) : [{}],
      agenda: normalizeAgenda(data.agenda).length
        ? normalizeAgenda(data.agenda).map((item) => ({
            ...item,
            time: parseAgendaTime(item.time as string | null),
          }))
        : [{}],
      status: data.status ?? 0,
    });
    setDrawerOpen(true);
  };
   


  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      meetingTime: values.meetingTime ? (values.meetingTime as Dayjs).format('YYYY-MM-DD HH:mm:ss') : null,
      id: editing?.id != null ? String(editing.id) : undefined,
      guests: (values.guests ?? []).filter((item: MeetingGuest) => item?.name),
      agenda: (values.agenda ?? [])
        .filter((item: MeetingAgenda) => item?.title)
        .map((item: MeetingAgenda) => ({
          ...item,
          time: Array.isArray(item.time)
            ? item.time
                .filter(Boolean)
                .map((value) => (dayjs.isDayjs(value) ? value.format('HH:mm') : String(value).slice(11, 16)))
                .join('-')
            : item.time,
        })),
      status: Number(values.status ?? 0),
    };
    const res = editing
      ? await updateMeeting(payload as MeetingRecord & { id: string })
      : await createMeeting(payload as MeetingRecord);
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
      <CrudTablePage<MeetingRecord>
        key={tableKey}
        title="会议信息"
        rowKey="id"
        resource={{ basePath: '/api/content-management/meeting', status: false }}
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
          <a key="status" onClick={() => {
            const nextStatus = String(record.status) === '1' ? 0 : 1;
            const actionText = String(record.status) === '1' ? '下线' : '发布';
            const go = async () => {
              const res = await fetch('/api/content-management/meeting/status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: record.id, status: nextStatus }),
              });
              if (res.ok) {
                message.success(`${actionText}成功`);
                refreshTable();
              }
            };
            void go();
          }}>{String(record.status) === '1' ? '下线' : '发布'}</a>,
        ]}
        toolbarExtra={[<Button key="create-meeting" type="primary" onClick={openCreate}>新增</Button>]}
      />

      <Drawer
        title={editing ? '编辑会议' : '新增会议'}
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
        <Form form={form} layout="vertical" initialValues={{ content: '', guests: [{}], agenda: [{}], status: 0 }}>
          <Form.Item name="meetingName" label="会议名称" rules={[{ required: true, message: '请输入会议名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="locationAddress" label="会场地址">
            <Input />
          </Form.Item>
          <Form.Item name="meetingTime" label="日期时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="subtitle" label="会议副标题">
            <Input />
          </Form.Item>
          <Form.Item name="coverImage" label="会议封面图">
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
          <Form.Item name="content" label="详情介绍" rules={[{ required: true, message: '请输入详情介绍' }]}>
            <RichTextEditor placeholder="请输入会议详情，支持上传图片插入到正文" />
          </Form.Item>

          <Form.List name="guests">
            {(fields, { add, remove }) => (
              <>
                <Space align="center" style={{ marginBottom: 8 }}>
                  <strong>嘉宾</strong>
                  <Button size="small" type="dashed" onClick={() => add({})} icon={<PlusOutlined />}>添加嘉宾</Button>
                </Space>
                {fields.map((field, index) => {
                  const fieldKey = `${field.key}-${index}`;
                  return (
                    <Space key={fieldKey} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item
                        {...field}
                        name={[field.name, 'name']}
                        rules={[{ required: true, message: '请输入嘉宾姓名' }]}
                        style={{ width: 220 }}
                      >
                        <Input placeholder="name: 小明" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'title']} style={{ width: 220 }}>
                        <Input placeholder="头衔/简介" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'avatar']} style={{ width: 320 }}>
                        <Input placeholder="头像 URL" />
                      </Form.Item>
                      {fields.length > 1 ? <MinusCircleOutlined onClick={() => remove(field.name)} /> : null}
                    </Space>
                  );
                })}
              </>
            )}
          </Form.List>

          <Form.List name="agenda">
            {(fields, { add, remove }) => (
              <>
                <Space align="center" style={{ marginBottom: 8, marginTop: 12 }}>
                  <strong>议程安排</strong>
                  <Button size="small" type="dashed" onClick={() => add({})} icon={<PlusOutlined />}>添加议程</Button>
                </Space>
                {fields.map((field, index) => {
                  const fieldKey = `${field.key}-${index}`;
                  return (
                    <Space key={fieldKey} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item
                        {...field}
                        name={[field.name, 'time']}
                        rules={[{ required: true, message: '请选择时间' }]}
                        style={{ width: 220 }}
                      >
                        <TimePicker.RangePicker format="HH:mm" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'title']}
                        rules={[{ required: true, message: '请输入议程标题' }]}
                        style={{ width: 320 }}
                      >
                        <Input placeholder="输入议程标题" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'content']} style={{ width: 260 }}>
                        <Input placeholder="输入补充说明" />
                      </Form.Item>
                      {fields.length > 1 ? <MinusCircleOutlined onClick={() => remove(field.name)} /> : null}
                    </Space>
                  );
                })}
              </>
            )}
          </Form.List>

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

export default MeetingPage;
