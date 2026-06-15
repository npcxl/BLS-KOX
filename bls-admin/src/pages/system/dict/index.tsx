import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { BetaSchemaForm, PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, Space, Tag } from 'antd';
import { useState } from 'react';
import { useCrudTable } from '@/hooks/useCrudTable';
import { listResource } from '@/services/system/crud';
import { useDict } from '@/hooks/useDict';

export type DictTypeRecord = {
  dictTypeId: string;
  dictName: string;
  dictType: string;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

export type DictDataRecord = {
  dictDataId: string;
  dictTypeId: string;
  dictLabel: string;
  dictValue: string;
  dictSort?: number;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

const typeResource: CrudResource = { basePath: '/api/system/dict/type', status: false };

const typeColumns: ProColumns<DictTypeRecord>[] = [
  { title: '字典名称', dataIndex: 'dictName', ellipsis: true },
  { title: '字典类型', dataIndex: 'dictType', copyable: true, ellipsis: true },
  {
    title: '状态',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: { '0': { text: '正常', status: 'Success' }, '1': { text: '停用', status: 'Default' } },
  },
  { title: '备注', dataIndex: 'remark', search: false, ellipsis: true },
  { title: '创建时间', dataIndex: 'createTime', valueType: 'dateTime', search: false },
];

const typeFormColumns: ProFormColumnsType<DictTypeRecord>[] = [
  { title: '字典名称', dataIndex: 'dictName', formItemProps: { rules: [{ required: true, message: '请输入字典名称' }] } },
  { title: '字典类型', dataIndex: 'dictType', formItemProps: { rules: [{ required: true, message: '请输入字典类型' }] } },
  { title: '状态', dataIndex: 'status', valueType: 'select', initialValue: '0', valueEnum: { '0': '正常', '1': '停用' } },
  { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
];

const dataResource: CrudResource = { basePath: '/api/system/dict/data', status: false };

function DictTypeList({ onEnter }: { onEnter: (record: DictTypeRecord) => void }) {
  const crud = useCrudTable<DictTypeRecord>(typeResource, 'dictTypeId');

  const actionColumn: ProColumns<DictTypeRecord> = {
    title: '操作',
    valueType: 'option',
    width: 240,
    render: (_, record) => (
      <Space size="small" wrap>
        <a onClick={() => onEnter(record)}>字典数据</a>
        <a onClick={() => crud.openEdit(record)}>编辑</a>
        <a style={{ color: '#ff4d4f' }} onClick={() => crud.remove([record])}>删除</a>
      </Space>
    ),
  };

  const statusColumn: ProColumns<DictTypeRecord> = {
    title: '状态',
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: { '0': { text: '正常', status: 'Success' }, '1': { text: '停用', status: 'Default' } },
    render: (_, record) => (
      <Tag color={record.status === '0' ? 'success' : 'default'}>
        {record.status === '0' ? '正常' : '停用'}
      </Tag>
    ),
  };

  const mergedColumns = typeColumns.map((col) =>
    col.dataIndex === 'status' ? statusColumn : col,
  );

  return (
    <>
      <ProTable<DictTypeRecord>
        rowKey="dictTypeId"
        actionRef={crud.actionRef}
        columns={[...mergedColumns, actionColumn]}
        request={crud.request}
        search={{ labelWidth: 96 }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        toolBarRender={() => [
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={crud.openCreate}>
            新增类型
          </Button>,
        ]}
        rowSelection={{}}
        tableAlertOptionRender={({ selectedRows, onCleanSelected }) => (
          <Space size={16}>
            <a onClick={() => { crud.remove(selectedRows as DictTypeRecord[]); onCleanSelected(); }}>
              批量删除
            </a>
          </Space>
        )}
      />
      <BetaSchemaForm<DictTypeRecord>
        title={crud.mode === 'edit' ? '编辑字典类型' : '新增字典类型'}
        width={720}
        layoutType="ModalForm"
        open={crud.modalOpen}
        modalProps={{ destroyOnHidden: true, onCancel: crud.closeModal }}
        columns={typeFormColumns}
        initialValues={crud.current}
        onFinish={async (values) => crud.submit(values)}
      />
    </>
  );
}

function DictDataDetail({ record, onBack }: { record: DictTypeRecord; onBack: () => void }) {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const crud = useCrudTable<DictDataRecord>(dataResource, 'dictDataId', {
    beforeSubmit: (values) => ({
      ...values,
      dictTypeId: record.dictTypeId,
    }),
  });

  const dataColumns: ProColumns<DictDataRecord>[] = [
    { title: '字典标签', dataIndex: 'dictLabel', ellipsis: true },
    { title: '字典值', dataIndex: 'dictValue', copyable: true, ellipsis: true },
    { title: '排序', dataIndex: 'dictSort', search: false, width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: statusValueEnum,
      render: (_, r) => (
        <Tag color={r.status === '0' ? 'success' : 'default'}>
          {statusValueEnum[r.status]?.text ?? (r.status === '0' ? '正常' : '停用')}
        </Tag>
      ),
    },
    { title: '备注', dataIndex: 'remark', search: false, ellipsis: true },
  ];

  const dataFormColumns: ProFormColumnsType<DictDataRecord>[] = [
    { title: '字典标签', dataIndex: 'dictLabel', formItemProps: { rules: [{ required: true, message: '请输入字典标签' }] } },
    { title: '字典值', dataIndex: 'dictValue', formItemProps: { rules: [{ required: true, message: '请输入字典值' }] } },
    { title: '排序', dataIndex: 'dictSort', valueType: 'digit', initialValue: 0 },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      initialValue: '0',
      valueEnum: Object.fromEntries(
        Object.entries(statusValueEnum).map(([k, v]) => [k, v.text]),
      ),
    },
    { title: '备注', dataIndex: 'remark', valueType: 'textarea' },
  ];

  const actionColumn: ProColumns<DictDataRecord> = {
    title: '操作',
    valueType: 'option',
    width: 180,
    render: (_, r) => (
      <Space size="small" wrap>
        <a onClick={() => crud.openEdit(r)}>编辑</a>
        <a style={{ color: '#ff4d4f' }} onClick={() => crud.remove([r])}>删除</a>
      </Space>
    ),
  };

  const requestWithFilter = async (params: Record<string, any>) => {
    const res = await listResource<DictDataRecord>(dataResource, {
      ...params,
      dictTypeId: record.dictTypeId,
      pageNum: params.current,
      pageSize: params.pageSize,
    });
    return {
      data: res.data ?? [],
      total: res.total ?? res.data?.length ?? 0,
      success: res.code === 200 || res.success !== false,
    };
  };

  return (
    <>
      <ProTable<DictDataRecord>
        rowKey="dictDataId"
        actionRef={crud.actionRef}
        columns={[...dataColumns, actionColumn]}
        request={requestWithFilter}
        search={{ labelWidth: 96 }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        toolBarRender={() => [
          <Button key="back" icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回
          </Button>,
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={crud.openCreate}>
            新增数据
          </Button>,
        ]}
        rowSelection={{}}
        tableAlertOptionRender={({ selectedRows, onCleanSelected }) => (
          <Space size={16}>
            <a onClick={() => { crud.remove(selectedRows as DictDataRecord[]); onCleanSelected(); }}>
              批量删除
            </a>
          </Space>
        )}
      />
      <BetaSchemaForm<DictDataRecord>
        title={crud.mode === 'edit' ? '编辑字典数据' : '新增字典数据'}
        width={720}
        layoutType="ModalForm"
        open={crud.modalOpen}
        modalProps={{ destroyOnHidden: true, onCancel: crud.closeModal }}
        columns={dataFormColumns}
        initialValues={crud.current}
        onFinish={async (values) => crud.submit(values)}
      />
    </>
  );
}

export default function DictPage() {
  const [activeRecord, setActiveRecord] = useState<DictTypeRecord | null>(null);

  if (activeRecord) {
    return (
      <PageContainer
        title={`字典数据 - ${activeRecord.dictName}`}
        subTitle={`类型: ${activeRecord.dictType}`}
        onBack={() => setActiveRecord(null)}
      >
        <DictDataDetail record={activeRecord} onBack={() => setActiveRecord(null)} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="字典管理" subTitle="维护字典类型和字典数据">
      <DictTypeList onEnter={setActiveRecord} />
    </PageContainer>
  );
}
