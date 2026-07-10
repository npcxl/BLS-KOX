/**
 * MySQL-backed Job Queue
 *
 * 提交 Job → INSERT sys_jobs (status='queued')
 * Worker   → SELECT FOR UPDATE → process → UPDATE status
 */
import { getDb } from '../core/database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import type { JobRecord, JobStatus } from './job-types';
import { logger } from '../core/logger';

const TABLE = 'sys_jobs';

/** 提交一个 Job */
export async function enqueue(params: {
  tenantId: string;
  userId?: string;
  jobType: string;
  jobData: Record<string, unknown>;
  maxAttempts?: number;
}): Promise<JobRecord> {
  const db = await getDb();
  const jobId = generateSnowflakeId().toString();
  const now = new Date();

  const record: any = {
    job_id: jobId,
    tenant_id: params.tenantId,
    user_id: params.userId ?? null,
    job_type: params.jobType,
    job_data: JSON.stringify(params.jobData),
    status: 'queued' as JobStatus,
    attempt: 0,
    max_attempts: params.maxAttempts ?? 3,
    next_retry_at: now,
    error_message: null,
    result: null,
    created_at: now,
    updated_at: now,
  };

  await db.insertInto(TABLE).values(record).execute();
  logger.info('[queue] enqueued', { jobId, jobType: params.jobType, tenantId: params.tenantId });

  return {
    jobId,
    tenantId: params.tenantId,
    userId: params.userId,
    jobType: params.jobType,
    jobData: params.jobData,
    status: 'queued',
    attempt: 0,
    maxAttempts: params.maxAttempts ?? 3,
    nextRetryAt: now,
    errorMessage: null,
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 获取一条待处理的 Job（Worker 调用） */
export async function dequeue(): Promise<JobRecord | null> {
  const db = (await getDb()) as any;

  const row = await db
    .selectFrom(TABLE)
    .selectAll()
    .where('status', 'in', ['queued', 'failed'])
    .where('next_retry_at', '<=', new Date())
    .orderBy('next_retry_at', 'asc')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();

  if (!row) return null;

  // 标记为 processing
  await db
    .updateTable(TABLE)
    .set({ status: 'processing', attempt: (row.attempt ?? 0) + 1, updated_at: new Date() } as any)
    .where('job_id', '=', row.job_id)
    .execute();

  return mapRow(row);
}

/** 标记 Job 完成 */
export async function completeJob(jobId: string, result: unknown): Promise<void> {
  const db = await getDb();
  await db
    .updateTable(TABLE)
    .set({ status: 'completed', result: JSON.stringify(result), updated_at: new Date() } as any)
    .where('job_id', '=', jobId)
    .execute();
  logger.info('[queue] completed', { jobId });
}

/** 标记 Job 失败（Worker 调用） */
export async function failJob(jobId: string, record: JobRecord, error: string): Promise<void> {
  const db = await getDb();
  const exceeded = record.attempt + 1 >= record.maxAttempts;

  if (exceeded) {
    await db
      .updateTable(TABLE)
      .set({
        status: 'failed',
        error_message: error,
        updated_at: new Date(),
      } as any)
      .where('job_id', '=', jobId)
      .execute();
    logger.warn('[queue] dead letter', { jobId, error, attempts: record.attempt + 1 });
  } else {
    const backoff = Math.pow(2, record.attempt) * 1000; // 指数退避: 2s, 4s, 8s...
    const nextRetry = new Date(Date.now() + backoff);
    await db
      .updateTable(TABLE)
      .set({
        status: 'queued',
        error_message: error,
        next_retry_at: nextRetry,
        updated_at: new Date(),
      } as any)
      .where('job_id', '=', jobId)
      .execute();
    logger.info('[queue] retry scheduled', { jobId, nextRetry: nextRetry.toISOString(), attempt: record.attempt + 1 });
  }
}

/** 查询 Job 状态（带 Tenant 隔离） */
export async function getJob(tenantId: string, jobId: string): Promise<JobRecord | null> {
  const db = await getDb();
  const row = await db
    .selectFrom(TABLE)
    .selectAll()
    .where('job_id', '=', jobId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  return row ? mapRow(row) : null;
}

/** 查询租户 Job 列表 */
export async function listJobs(tenantId: string, opts?: { status?: JobStatus; limit?: number }): Promise<JobRecord[]> {
  const db = await getDb();
  let q = db.selectFrom(TABLE).selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc');

  if (opts?.status) q = q.where('status', '=', opts.status);
  if (opts?.limit) q = q.limit(opts.limit);

  const rows = await q.execute();
  return rows.map(mapRow);
}

/** 数据库行 → JobRecord */
function mapRow(row: any): JobRecord {
  return {
    jobId: String(row.job_id),
    tenantId: String(row.tenant_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    jobType: String(row.job_type),
    jobData: typeof row.job_data === 'string' ? JSON.parse(row.job_data) : (row.job_data ?? {}),
    status: row.status as JobStatus,
    attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
