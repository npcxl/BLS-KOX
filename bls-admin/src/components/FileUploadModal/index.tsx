import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { Form, Modal, Radio, Upload, message, Input } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { request } from '@umijs/max';

export type FileUploadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void | Promise<void>;
};

export default function FileUploadModal({ open, onOpenChange, onUploaded }: FileUploadModalProps) {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const initialValues = useMemo(
    () => ({
      accessType: 'private',
      moduleName: undefined,
    }),
    [],
  );

  useEffect(() => {
    if (open) {
      form.setFieldsValue(initialValues);
    }
  }, [form, initialValues, open]);

  const uploadProps: UploadProps = {
    multiple: false,
    fileList,
    beforeUpload: (file) => {
      setFileList([file]);
      return false;
    },
    onRemove: () => {
      setFileList([]);
      return true;
    },
    maxCount: 1,
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    const file = fileList[0];
    if (!file) {
      message.warning('请选择文件');
      return;
    }

    const rawFile = file.originFileObj ?? file;
    if (!rawFile) {
      message.warning('无法读取文件');
      return;
    }

    const fd = new FormData();
    fd.append('file', rawFile as Blob, file.name);
    fd.append('accessType', values.accessType);
    if (values.moduleName) fd.append('moduleName', values.moduleName);

    setSubmitting(true);
    try {
      const res = await request('/api/system/storage/upload', {
        method: 'POST',
        data: fd,
      });
      if (res?.code === 200) {
        message.success('上传成功');
        setFileList([]);
        form.resetFields();
        onOpenChange(false);
        await onUploaded?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="上传文件"
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={handleOk}
      confirmLoading={submitting}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical" initialValues={initialValues}>
        <Form.Item name="accessType" label="访问类型" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="private">私有</Radio>
            <Radio value="public">公共</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="moduleName" label="模块">
          <Input placeholder="可选，默认 common" />
        </Form.Item>
        <Form.Item label="文件">
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
            <p className="ant-upload-hint">支持单文件上传，上传时可选择私有或公共。</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Modal>
  );
}
