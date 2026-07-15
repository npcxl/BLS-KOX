/**
 * Queue Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/database.js', () => ({
  getDb: vi.fn(),
}));
vi.mock('../../shared/utils/snowflake.js', () => ({
  generateSnowflakeId: () => ({ toString: () => String(Date.now()) }),
}));
vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../observability/metrics.js', () => ({
  jobQueueWaiting: { inc: vi.fn(), dec: vi.fn() },
  jobQueueFailedTotal: { inc: vi.fn() },
  jobQueueCompletedTotal: { inc: vi.fn() },
}));

import { enqueue, failJob, getJob, listJobs } from '../queue.js';
import { getDb } from '../../core/database.js';

/**
 * mockDb 定义在模块顶层（非 vi.hoisted），在 beforeEach 中绑定到 getDb。
 * 避免 vi.mock 工厂引用外部变量导致的 hoisting 初始化顺序问题。
 */
const mockDb = {
  insertInto: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue(undefined),
  executeTakeFirst: vi.fn().mockResolvedValue(null),
  selectFrom: vi.fn().mockReturnThis(),
  selectAll: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  updateTable: vi.fn().mockReturnThis(),
  transaction: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  forUpdate: vi.fn().mockReturnThis(),
  skipLocked: vi.fn().mockReturnThis(),
} as any;

describe('Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb);
  });

  it('enqueue returns a queued job', async () => {
    mockDb.insertInto.mockReturnValue({ values: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) }) } as any);
    const job = await enqueue({ tenantId: 't1', jobType: 'test', jobData: {} });
    expect(job.jobType).toBe('test');
    expect(job.status).toBe('queued');
  });

  it('failJob marks dead letter after max attempts', async () => {
    const chain = { where: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) }) };
    mockDb.updateTable.mockReturnValue({ set: vi.fn().mockReturnValue(chain) } as any);
    await failJob('j1', { attempt: 3, maxAttempts: 3 }, 'error');
    expect(mockDb.updateTable).toHaveBeenCalled();
  });

  it('getJob returns null for missing job', async () => {
    mockDb.executeTakeFirst.mockResolvedValue(null);
    expect(await getJob('t1', 'x')).toBeNull();
  });

  it('listJobs returns empty array', async () => {
    mockDb.execute.mockResolvedValue([]);
    expect(await listJobs('t1')).toEqual([]);
  });
});
