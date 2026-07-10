import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { BetaSchemaForm, PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, Space, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { useCrudTable } from '@/hooks/useCrudTable';
import { listResource, type CrudResource } from '@/services/system/crud';
import { useDict } from '@/hooks/useDict';
import { usePageConfig } from '@/hooks/usePageConfig';

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
  tag?: string;
  status: '0' | '1';
  remark?: string;
  createTime?: string;
};

const TAG_OPTIONS = [
  { label: 'default', value: 'default' },
  { label: 'success', value: 'success' },
  { label: 'processing', value: 'processing' },
  { label: 'error', value: 'error' },
  { label: 'warning', value: 'warning' },
  { label: 'magenta', value: 'magenta' },
  { label: 'red', value: 'red' },
  { label: 'volcano', value: 'volcano' },
  { label: 'orange', value: 'orange' },
  { label: 'gold', value: 'gold' },
  { label: 'lime', value: 'lime' },
  { label: 'green', value: 'green' },
  { label: 'cyan', value: 'cyan' },
  { label: 'blue', value: 'blue' },
  { label: 'geekblue', value: 'geekblue' },
  { label: 'purple', value: 'purple' },
];

const typeResource: CrudResource = { basePath: '/api/system/dict/type', status: false };
const dataResource: CrudResource = { basePath: '/api/system/dict/data', status: false };

function DictTypeList({ onEnter }: { onEnter: (record: DictTypeRecord) => void }) {
  const crud = useCrudTable<DictTypeRecord>(typeResource, 'dictTypeId');
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const { proColumns: baseColumns } = usePageConfig('system_dict_type');

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

  const columns: ProColumns<DictTypeRecord>[] = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === 'status') {
      return {
        ...col,
        render: (_: any, record: DictTypeRecord) => (
          <Tag color={statusValueEnum[record.status]?.color ?? 'default'}>
            {statusValueEnum[record.status]?.text ?? record.status}
          </Tag>
        ),
      };
    }
    return col;
  }), [baseColumns, statusValueEnum]);

  const formColumns: ProFormColumnsType<DictTypeRecord>[] = [
    { title: '字典名称', dataIndex: 'dictName', formItemProps: { rules: [{ required: true, message: '请输入字典名称' }] } },
    { title: '字典类型', dataIndex: 'dictType', formItemProps: { rules: [{ required: true, message: '请输入字典类型' }] } },
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

  return (
    <>
      <ProTable<DictTypeRecord>
        rowKey="dictTypeId"
        actionRef={crud.actionRef}
        columns={[...columns, actionColumn]}
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
        columns={formColumns}
        initialValues={crud.current}
        onFinish={async (values) => crud.submit(values)}
      />
    </>
  );
}

function DictDataDetail({ record, onBack }: { record: DictTypeRecord; onBack: () => void }) {
  const { valueEnum: statusValueEnum } = useDict('sys_status');
  const { proColumns: baseColumns } = usePageConfig('system_dict_data');
  const crud = useCrudTable<DictDataRecord>(dataResource, 'dictDataId', {
    beforeSubmit: (values) => ({
      ...values,
      dictTypeId: record.dictTypeId,
    }),
  });

  const dataColumns: ProColumns<DictDataRecord>[] = useMemo(() => baseColumns.map((col: any) => {
    if (col.dataIndex === 'tag') {
      return {
        ...col,
        render: (_: any, r: DictDataRecord) => (
          <Tag color={r.tag || 'default'}>{r.tag || 'default'}</Tag>
        ),
      };
    }
    if (col.dataIndex === 'status') {
      return {
        ...col,
        render: (_: any, r: DictDataRecord) => (
          <Tag color={statusValueEnum[r.status]?.color ?? 'default'}>
            {statusValueEnum[r.status]?.text ?? (r.status === '0' ? '正常' : '停用')}
          </Tag>
        ),
      };
    }
    return col;
  }), [baseColumns, statusValueEnum]);

  const dataFormColumns: ProFormColumnsType<DictDataRecord>[] = [
    { title: '字典标签', dataIndex: 'dictLabel', formItemProps: { rules: [{ required: true, message: '请输入字典标签' }] } },
    { title: '字典值', dataIndex: 'dictValue', formItemProps: { rules: [{ required: true, message: '请输入字典值' }] } },
    { title: '排序', dataIndex: 'dictSort', valueType: 'digit', initialValue: 0 },
    {
      title: '标签颜色',
      dataIndex: 'tag',
      valueType: 'select',
      initialValue: 'default',
      fieldProps: { options: TAG_OPTIONS },
    },
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
