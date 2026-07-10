/**
 * 导入任务
 */
import type { JobDefinition } from '../job-types';
import { logger } from '../../core/logger';

export const importJob: JobDefinition = {
  type: 'import',
  maxAttempts: 2,
  timeout: 180_000,

  async handler(payload: Record<string, unknown>) {
    const { tenantId, userId, excelMetaKey, fileUrl } = payload;

    logger.info('[job:import] started', { tenantId, excelMetaKey });

    // TODO: 实际导入逻辑接入 Excel 模块

    await new Promise((r) => setTimeout(r, 500));

    return {
      imported: 0,
      failed: 0,
      errors: [],
    };
  },
};
