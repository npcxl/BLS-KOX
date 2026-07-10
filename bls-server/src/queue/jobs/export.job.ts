/**
 * 导出任务
 *
 * 将 Excel 导出从 HTTP 请求链路拆出为异步 Job。
 */
import type { JobDefinition } from '../job-types';
import { logger } from '../../core/logger';

export const exportJob: JobDefinition = {
  type: 'export',
  maxAttempts: 2,
  timeout: 120_000,

  async handler(payload: Record<string, unknown>) {
    const { tenantId, userId, pageCode, exportFields, keyword } = payload;

    logger.info('[job:export] started', { tenantId, pageCode });

    // TODO: 实际导出逻辑接入 Excel 模块
    // const data = await fetchData(pageCode as string, keyword as string);
    // const buffer = await generateExcel(data, exportFields as string[]);

    // 模拟导出耗时
    await new Promise((r) => setTimeout(r, 500));

    logger.info('[job:export] completed', { tenantId, pageCode });
    return {
      fileName: `export_${pageCode}_${Date.now()}.xlsx`,
      recordCount: 0, // TODO: 实际记录数
    };
  },
};
