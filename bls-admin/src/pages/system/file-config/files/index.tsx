import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { Button, message } from 'antd';
import { useMemo, useState } from 'react';
import { request } from '@umijs/max';
import CrudTablePage from '@/components/CrudTablePage';
import FileUploadModal from '@/components/FileUploadModal';

export type FileRecord = {
  fileId: string;
  tenantId: string;
  storageId: string;
  bucketName: string;
  objectName: string;
  originalName: string;
  fileName: string;
  fileExt?: string;
  mimeType?: string;
  fileSize: number;
  accessType: 'public' | 'private';
  moduleName?: string;
  url?: string;
  createTime?: string;
};

function FilePageInner() {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const columns: ProColumns<FileRecord>[] = [
    { title: '原始文件名', dataIndex: 'originalName', ellipsis: true },
    { title: '存储文件名', dataIndex: 'fileName', search: false, ellipsis: true },
    { title: '桶名称', dataIndex: 'bucketName', search: false, ellipsis: true },
    { title: '对象路径', dataIndex: 'objectName', search: false, ellipsis: true },
    { title: '模块', dataIndex: 'moduleName', valueType: 'text' },
    { title: '访问类型', dataIndex: 'accessType', valueType: 'select', valueEnum: { public: { text: 'public' }, private: { text: 'private' } } },
    { title: '文件大小', dataIndex: 'fileSize', search: false },
    { title: '公共 URL', dataIndex: 'url', search: false, ellipsis: true },
    { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
  ];

  const formColumns: ProFormColumnsType<FileRecord>[] = [
    { title: '模块', dataIndex: 'moduleName' },
    { title: '访问类型', dataIndex: 'accessType', valueType: 'select', initialValue: 'private', valueEnum: { public: 'public', private: 'private' } },
  ];

  const toolbarExtra = useMemo(
    () => [
      <Button key="upload" type="primary" onClick={() => setOpen(true)}>
        上传文件
      </Button>,
    ],
    [],
  );

  const handleDownload = async (fileId: string) => {
    const res = await request(`/api/system/storage/files/${fileId}/url`, { method: 'GET' });
    if (res?.code === 200 && res?.data?.url) {
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleRemove = async (fileId: string) => {
    const res = await request(`/api/system/storage/files/${fileId}`, { method: 'DELETE' });
    if (res?.code === 200) {
      message.success('删除成功');
      setReloadKey((v) => v + 1);
    }
  };

  return (
    <>
      <CrudTablePage<FileRecord>
        key={reloadKey}
        title="文件管理"
        rowKey="fileId"
        resource={{ basePath: '/api/system/storage', list: '/files', add: false, edit: false, remove: false, status: false }}
        columns={columns}
        formColumns={formColumns}
        modalWidth={720}
        toolbarExtra={toolbarExtra}
        extraActions={(record) => [
          <a key="download" onClick={() => handleDownload(record.fileId)}>
            下载
          </a>,
          <a key="delete" style={{ color: '#ff4d4f' }} onClick={() => handleRemove(record.fileId)}>
            删除
          </a>,
        ]}
      />
      <FileUploadModal open={open} onOpenChange={setOpen} onUploaded={() => setReloadKey((v) => v + 1)} />
    </>
  );
}

export default FilePageInner;
