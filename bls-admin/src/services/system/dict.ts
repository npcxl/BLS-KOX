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
const dictPending = new Map<string, Promise<DictDataItem[]>>();

/**
 * 获取字典数据（带缓存与请求去重）
 *
 * 规则：
 *   - 成功数据 → 缓存
 *   - 成功空数组 → 缓存 []
 *   - 请求失败 → 不缓存
 *   - 响应结构错误 → 不缓存
 *   - 同一类型并发请求 → 只发 1 次网络请求
 */
export async function fetchDictData(dictType: string): Promise<DictDataItem[]> {
  // 已有缓存 → 直接返回
  if (dictCache.has(dictType)) {
    return dictCache.get(dictType)!;
  }

  // 已有进行中的请求 → 复用同一个 Promise
  if (dictPending.has(dictType)) {
    return dictPending.get(dictType)!;
  }

  const promise = request<{ code?: number; data?: DictDataItem[] }>(
    '/api/system/dict/data/type',
    { method: 'GET', params: { dictType } },
  )
    .then((res) => {
      if (res.code !== 200) {
        throw new Error(`Dict request failed: ${dictType} (code: ${res.code})`);
      }

      if (!Array.isArray(res.data)) {
        throw new Error(`Invalid dict response: ${dictType}`);
      }

      // 成功 → 缓存（包括空数组）
      dictCache.set(dictType, res.data);
      return res.data;
    })
    .finally(() => {
      dictPending.delete(dictType);
    });

  dictPending.set(dictType, promise);
  return promise;
}

/**
 * 清除字典缓存
 */
export function clearDictCache(dictType?: string) {
  if (dictType) {
    dictCache.delete(dictType);
    dictPending.delete(dictType);
  } else {
    dictCache.clear();
    dictPending.clear();
  }
}

export async function getDictLabel(dictType: string, dictValue: string): Promise<string> {
  const data = await fetchDictData(dictType);
  return data.find((item) => item.dictValue === dictValue)?.dictLabel ?? dictValue;
}

export async function getDictValueEnum(
  dictType: string,
): Promise<Record<string, { text: string; status?: string; color?: string }>> {
  const data = await fetchDictData(dictType);
  const enumMap: Record<string, { text: string; status?: string; color?: string }> = {};
  for (const item of data) {
    enumMap[item.dictValue] = { text: item.dictLabel, color: item.tag };
  }
  return enumMap;
}

export async function getDictFormValueEnum(
  dictType: string,
): Promise<Record<string, string>> {
  const data = await fetchDictData(dictType);
  const enumMap: Record<string, string> = {};
  for (const item of data) {
    enumMap[item.dictValue] = item.dictLabel;
  }
  return enumMap;
}
