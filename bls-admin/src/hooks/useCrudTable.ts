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
  searchMode?: 'fuzzy' | 'exact';
};

export function useCrudTable<T extends Record<string, any>>(
  resource: CrudResource,
  idKey: keyof T,
  options: UseCrudTableOptions<T> = {},
) {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const lastRequestParams = useRef<Record<string, any>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<CrudMode>('create');
  const [current, setCurrent] = useState<T>();
  const [createDefaults, setCreateDefaults] = useState<Partial<T> | undefined>();
  const { message, modal } = App.useApp();

  const reload = () => actionRef.current?.reload();

  const request = async (params: Record<string, any>) => {
    lastRequestParams.current = params;
    const { current, pageSize, ...rest } = params;
    const keywordParts = Object.entries(rest)
      .filter(([key, value]) => key !== 'keyword' && value !== undefined && value !== null && value !== '')
      .map(([, value]) => {
        if (Array.isArray(value)) return value.map(String).filter(Boolean).join(' ');
        return String(value).trim();
      })
      .filter(Boolean);
    const mergedKeyword = [rest.keyword, ...keywordParts].filter(Boolean).join(' ').trim();
    const isFuzzySearch = options.searchMode !== 'exact';
    const keyword = isFuzzySearch ? mergedKeyword : rest.keyword;
    const queryParams = isFuzzySearch ? { ...rest, keyword: keyword || undefined } : { ...params };

    const res = await listResource<T>(resource, {
      ...queryParams,
      pageNum: current,
      pageSize,
    });
    return {
      data: res.data ?? [],
      total: res.total ?? res.data?.length ?? 0,
      success: res.code === 200 || res.success !== false,
    };
  };

  const openCreate = (defaults?: Partial<T>) => {
    console.log('[useCrudTable] openCreate', resource.basePath);
    setMode('create');
    setCurrent(undefined);
    setCreateDefaults(defaults);
    setModalOpen(true);
  };

  const openEdit = (record: T) => {
    console.log('[useCrudTable] openEdit', resource.basePath, record);
    setMode('edit');
    setCurrent(record);
    setCreateDefaults(undefined);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrent(undefined);
    setCreateDefaults(undefined);
  };

  const normalizeIds = (input: Partial<T>) => {
    const output = { ...input } as Record<string, any>;
    Object.keys(output).forEach((key) => {
      if (key === 'id' && output[key] != null) {
        output[key] = String(output[key]);
      }
    });
    return output as Partial<T>;
  };

  const submit = async (values: Partial<T>) => {
    const basePayload = mode === 'edit' && current ? { [idKey]: current[idKey], ...values } : values;
    const payload = normalizeIds(options.beforeSubmit?.(basePayload, current) ?? basePayload);
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

  const changeStatus = async (record: T, status: string) => {
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
    lastRequestParams,
    modalOpen,
    mode,
    current,
    createDefaults,
    request,
    openCreate,
    openEdit,
    closeModal,
    submit,
    remove,
    changeStatus,
  };
}
