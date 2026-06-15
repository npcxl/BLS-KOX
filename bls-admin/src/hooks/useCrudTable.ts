import type { ActionType } from '@ant-design/pro-components';
import { App } from 'antd';
import { useRef, useState } from 'react';
import {
  addResource,
  changeResourceStatus,
  editResource,
  listResource,
  removeResource,
  type CrudResource,
} from '@/services/system/crud';

export type CrudMode = 'create' | 'edit';

export type UseCrudTableOptions<T extends Record<string, any>> = {
  beforeSubmit?: (values: Partial<T>, current?: T) => Partial<T>;
  onSaved?: (mode: CrudMode, values: Partial<T>, current?: T) => void | Promise<void>;
};

export function useCrudTable<T extends Record<string, any>>(
  resource: CrudResource,
  idKey: keyof T,
  options: UseCrudTableOptions<T> = {},
) {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<CrudMode>('create');
  const [current, setCurrent] = useState<T>();
  const { message, modal } = App.useApp();

  const reload = () => actionRef.current?.reload();

  const request = async (params: Record<string, any>) => {
    const res = await listResource<T>(resource, {
      ...params,
      pageNum: params.current,
      pageSize: params.pageSize,
    });
    return {
      data: res.data ?? [],
      total: res.total ?? res.data?.length ?? 0,
      success: res.code === 200 || res.success !== false,
    };
  };

  const openCreate = () => {
    console.log('[useCrudTable] openCreate', resource.basePath);
    setMode('create');
    setCurrent(undefined);
    setModalOpen(true);
  };

  const openEdit = (record: T) => {
    console.log('[useCrudTable] openEdit', resource.basePath, record);
    setMode('edit');
    setCurrent(record);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrent(undefined);
  };

  const submit = async (values: Partial<T>) => {
    const basePayload = mode === 'edit' && current ? { [idKey]: current[idKey], ...values } : values;
    const payload = options.beforeSubmit?.(basePayload, current) ?? basePayload;
    const res = mode === 'edit' ? await editResource(resource, payload) : await addResource(resource, payload);
    if (res.code !== 200) return false;
    message.success(mode === 'edit' ? '修改成功' : '新增成功');
    await options.onSaved?.(mode, payload, current);
    closeModal();
    reload();
    return true;
  };

  const remove = (records: T[]) => {
    const ids = records.map((item) => String(item[idKey])).filter(Boolean);
    if (!ids.length) return;
    modal.confirm({
      title: '确认删除选中的数据吗？',
      content: '删除后不可恢复，请谨慎操作。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const res = await removeResource(resource, ids);
        if (res.code === 200) {
          message.success('删除成功');
          reload();
        }
      },
    });
  };

  const changeStatus = async (record: T, status: '0' | '1') => {
    const res = await changeResourceStatus(resource, {
      [idKey as string]: record[idKey],
      status,
    });
    if (res.code === 200) {
      message.success('状态修改成功');
      reload();
    }
  };

  return {
    actionRef,
    modalOpen,
    mode,
    current,
    request,
    openCreate,
    openEdit,
    closeModal,
    submit,
    remove,
    changeStatus,
  };
}
