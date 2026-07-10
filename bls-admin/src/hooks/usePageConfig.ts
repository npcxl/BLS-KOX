import { useEffect, useState } from 'react';
import type { ProColumns, ProFormColumnsType } from '@ant-design/pro-components';
import { getPageColumnConfig, type PageColumnConfigRecord } from '@/services/system/page-config';
import { fetchDictData, clearDictCache, type DictDataItem } from '@/services/system/dict';

function columnToProColumn(col: PageColumnConfigRecord, dictValueEnum?: Record<string, { text: string; color?: string }>): ProColumns<any> {
  const colDef: ProColumns<any> = {
    title: col.title,
    dataIndex: col.dataIndex,
    search: col.searchable,
    ellipsis: col.ellipsis,
    copyable: col.copyable,
  };

  if (col.valueType) {
    colDef.valueType = col.valueType as any;
  }

  if (col.valueEnumCode && dictValueEnum) {
    colDef.valueEnum = dictValueEnum;
  }

  return colDef;
}

function columnToFormColumn(col: PageColumnConfigRecord): ProFormColumnsType<any> {
  const colDef: ProFormColumnsType<any> = {
    title: col.title,
    dataIndex: col.dataIndex,
  };

  if (col.valueType) {
    colDef.valueType = col.valueType as any;
  }

  if (col.required) {
    colDef.formItemProps = {
      rules: [{ required: true, message: `请输入${col.title}` }],
    };
  }

  if (col.placeholder) {
    colDef.fieldProps = { placeholder: col.placeholder };
  }

  return colDef;
}

export function usePageConfig(pageCode: string) {
  const [columns, setColumns] = useState<PageColumnConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dictValueEnums, setDictValueEnums] = useState<Map<string, Record<string, { text: string; color?: string }>>>(new Map());

  useEffect(() => {
    if (!pageCode) return;
    let cancelled = false;
    setLoading(true);

    getPageColumnConfig(pageCode)
      .then((res) => {
        if (cancelled) return;
        const cols = res.data ?? [];
        setColumns(cols);

        const dictCodes = [...new Set(cols.map((c) => c.valueEnumCode).filter(Boolean) as string[])];
        if (dictCodes.length > 0) {
          return Promise.all(
            dictCodes.map((code) =>
              fetchDictData(code)
                .then((data: DictDataItem[]) => {
                  const enumMap: Record<string, { text: string; color?: string }> = {};
                  for (const item of data) {
                    enumMap[item.dictValue] = { text: item.dictLabel, color: item.tag };
                  }
                  return { code, enumMap };
                })
                .catch(() => ({ code, enumMap: {} })),
            ),
          ).then((results) => {
            if (cancelled) return;
            const map = new Map<string, Record<string, { text: string; color?: string }>>();
            for (const { code, enumMap } of results) {
              map.set(code, enumMap);
            }
            setDictValueEnums(map);
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pageCode]);

  const proColumns: ProColumns<any>[] = columns
    .filter((col) => col.visible)
    .map((col) => {
      const dictEnum = col.valueEnumCode ? dictValueEnums.get(col.valueEnumCode) : undefined;
      return columnToProColumn(col, dictEnum);
    });

  const formColumns: ProFormColumnsType<any>[] = columns
    .filter((col) => col.editable)
    .map((col) => columnToFormColumn(col));

  return { columns, proColumns, formColumns, loading };
}
