import { useEffect, useState } from 'react';
import { fetchDictData, clearDictCache, type DictDataItem } from '@/services/system/dict';

export type DictOption = {
  label: string;
  value: string;
};

export function useDict(dictType: string) {
  const [options, setOptions] = useState<DictOption[]>([]);
  const [valueEnum, setValueEnum] = useState<Record<string, { text: string; color?: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dictType) return;
    let cancelled = false;
    setLoading(true);
    fetchDictData(dictType)
      .then((data: DictDataItem[]) => {
        if (cancelled) return;
        setOptions(data.map((item) => ({ label: item.dictLabel, value: item.dictValue })));
        const enumMap: Record<string, { text: string; color?: string }> = {};
        for (const item of data) {
          enumMap[item.dictValue] = { text: item.dictLabel, color: item.tag };
        }
        setValueEnum(enumMap);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dictType]);

  const getLabel = (dictValue: string | undefined): string => {
    if (dictValue === undefined) return '';
    return valueEnum[dictValue]?.text ?? dictValue;
  };

  const refresh = () => {
    clearDictCache(dictType);
    fetchDictData(dictType)
      .then((data: DictDataItem[]) => {
        setOptions(data.map((item) => ({ label: item.dictLabel, value: item.dictValue })));
        const enumMap: Record<string, { text: string; color?: string }> = {};
        for (const item of data) {
          enumMap[item.dictValue] = { text: item.dictLabel, color: item.tag };
        }
        setValueEnum(enumMap);
      })
      .catch(() => {});
  };

  return { options, valueEnum, loading, getLabel, refresh };
}

type DictResult = { options: DictOption[]; valueEnum: Record<string, { text: string; color?: string }> };

export function useMultiDict<T extends readonly string[]>(dictTypes: T): { [K in T[number]]: DictResult } & { loading: boolean } {
  const [result, setResult] = useState<Record<string, DictResult>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dictTypes.length) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      dictTypes.map((type) =>
        fetchDictData(type)
          .then((data: DictDataItem[]) => ({ type, data }))
          .catch(() => ({ type, data: [] as DictDataItem[] })),
      ),
    )
      .then((items) => {
        if (cancelled) return;
        const map: Record<string, DictResult> = {};
        for (const { type, data } of items) {
          map[type] = {
            options: data.map((item) => ({ label: item.dictLabel, value: item.dictValue })),
            valueEnum: Object.fromEntries(data.map((item) => [item.dictValue, { text: item.dictLabel, color: item.tag }])),
          };
        }
        setResult(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dictTypes.join(',')]);

  return { ...result, loading } as any;
}
