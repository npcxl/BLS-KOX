import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { Form, Modal, Radio, Upload, message, Input } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useFileUpload } from '@/hooks/useFileUpload';

export type FileUploadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (res: any) => void | Promise<void>;
  title?: string;
  uploadUrl?: string;
  accept?: string;
  extraData?: Record<string, string>;
};

export default function FileUploadModal({
  open,
  onOpenChange,
  onUploaded,
  title = '上传文件',
  uploadUrl = '/api/system/storage/upload',
  accept,
  extraData,
}: FileUploadModalProps) {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const initialValues = useMemo(
    () => ({
      accessType: 'private',
      moduleName: undefined,
    }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(initialValues);
    setFileList([]);
  }, [form, initialValues, open]);

  const { upload, uploading } = useFileUpload({ uploadUrl, defaultData: extraData });

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

    const res = await upload({
      file: rawFile as File | Blob,
      filename: file.name,
      data: {
        accessType: values.accessType,
        moduleName: values.moduleName ?? '',
      },
    });

    if (!res.url && !res.data) {
      throw new Error('上传成功但未返回文件信息');
    }

    message.success('上传成功');
    setFileList([]);
    form.resetFields();
    onOpenChange(false);
    await onUploaded?.(res);
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={handleOk}
      confirmLoading={uploading}
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
          <Upload.Dragger {...uploadProps} accept={accept}>
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
