import { request } from '@umijs/max';

export type DictDataItem = {
  dictDataId: string;
  dictTypeId: string;
  dictLabel: string;
  dictValue: string;
  dictSort: number;
  tag: string;
  status: '0' | '1';
  remark: string | null;
};

const dictCache = new Map<string, DictDataItem[]>();

export async function fetchDictData(dictType: string): Promise<DictDataItem[]> {
  if (dictCache.has(dictType)) return dictCache.get(dictType)!;
  const res = await request<{ code?: number; data?: DictDataItem[] }>(
    '/api/system/dict/data/type',
    { method: 'GET', params: { dictType } },
  );
  const data = res.data ?? [];
  dictCache.set(dictType, data);
  return data;
}

export function clearDictCache(dictType?: string) {
  if (dictType) {
    dictCache.delete(dictType);
  } else {
    dictCache.clear();
  }
}

export async function getDictLabel(dictType: string, dictValue: string): Promise<string> {
  const data = await fetchDictData(dictType);
  return data.find((item) => item.dictValue === dictValue)?.dictLabel ?? dictValue;
}

export async function getDictValueEnum(dictType: string): Promise<Record<string, { text: string; status?: string; color?: string }>> {
  const data = await fetchDictData(dictType);
  const enumMap: Record<string, { text: string; status?: string; color?: string }> = {};
  for (const item of data) {
    enumMap[item.dictValue] = { text: item.dictLabel, color: item.tag };
  }
  return enumMap;
}

export async function getDictFormValueEnum(dictType: string): Promise<Record<string, string>> {
  const data = await fetchDictData(dictType);
  const enumMap: Record<string, string> = {};
  for (const item of data) {
    enumMap[item.dictValue] = item.dictLabel;
  }
  return enumMap;
}
