import type { ExcelMetaConfig } from './excel.meta';

const excelMetaRegistry = new Map<string, ExcelMetaConfig>();

export function registerExcelMeta(config: ExcelMetaConfig) {
  excelMetaRegistry.set(config.metaKey, config);
}

export function registerExcelMetas(configs: ExcelMetaConfig[]) {
  for (const config of configs) registerExcelMeta(config);
}

export function getExcelMeta(metaKey: string) {
  return excelMetaRegistry.get(metaKey) ?? null;
}

export function listExcelMetas() {
  return Array.from(excelMetaRegistry.values());
}
