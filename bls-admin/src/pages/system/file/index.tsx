import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import CrudTablePage from '@/components/CrudTablePage';

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

  return (
    <CrudTablePage<FileRecord>
      title="文件管理"
      rowKey="fileId"
      resource={{ basePath: '/api/system/storage', list: '/files', add: false, edit: false, remove: false, status: false }}
      columns={columns}
      formColumns={formColumns}
      modalWidth={720}
    />
  );
}

export default FilePageInner;
