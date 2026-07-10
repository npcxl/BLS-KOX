/**
 * P6: MySQL-backed Job Queue
 *
 * - 原子 claim: SELECT FOR UPDATE SKIP LOCKED + UPDATE in transaction
 * - 多 Worker 安全: SKIP LOCKED
 * - Stale Recovery: processing > 5min → queued
 * - Dead Letter: attempt >= maxAttempts → dead
 * - Metrics: completed/failed counters (waiting → collect() query)
 */
import { getDb } from '../core/database';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import type { JobRecord, JobStatus } from './job-types';
import { logger } from '../core/logger';
import { jobQueueFailedTotal, jobQueueCompletedTotal } from '../observability/metrics';

const TABLE = 'sys_jobs';
const STALE_TIMEOUT = 300_000;

export async function enqueue(params: {
  tenantId: string; userId?: string; jobType: string;
  jobData: Record<string, unknown>; maxAttempts?: number;
}): Promise<JobRecord> {
  const db = await getDb();
  const jobId = generateSnowflakeId().toString();
  const now = new Date();
  await db.insertInto(TABLE).values({
    job_id: jobId, tenant_id: params.tenantId, user_id: params.userId ?? null,
    job_type: params.jobType, job_data: JSON.stringify(params.jobData),
    status: 'queued', attempt: 0, max_attempts: params.maxAttempts ?? 3,
    next_retry_at: now, error_message: null, result: null, created_at: now, updated_at: now,
  } as any).execute();
  logger.info('[queue] enqueued', { jobId, jobType: params.jobType });
  return mapRow({ job_id: jobId, tenant_id: params.tenantId, user_id: params.userId, job_type: params.jobType, job_data: params.jobData, status: 'queued', attempt: 0, max_attempts: params.maxAttempts ?? 3, next_retry_at: now, error_message: null, result: null, created_at: now, updated_at: now });
}

export async function dequeue(): Promise<JobRecord | null> {
  const db = (await getDb()) as any;
  await recoverStale(db);
  const row = await db.transaction().execute(async (trx: any) => {
    const r = await trx.selectFrom(TABLE).selectAll()
      .where('status', '=', 'queued').where('next_retry_at', '<=', new Date())
      .orderBy('next_retry_at', 'asc').limit(1).forUpdate().skipLocked().executeTakeFirst();
    if (!r) return null;
    await trx.updateTable(TABLE).set({ status: 'processing', attempt: (r.attempt ?? 0) + 1, updated_at: new Date() } as any)
      .where('job_id', '=', r.job_id).execute();
    return r;
  });
  return row ? mapRow(row) : null;
}

export async function completeJob(jobId: string, result: unknown): Promise<void> {
  const db = await getDb();
  await db.updateTable(TABLE).set({ status: 'completed', result: JSON.stringify(result), updated_at: new Date() } as any)
    .where('job_id', '=', jobId).execute();
  jobQueueCompletedTotal.inc();
  logger.info('[queue] completed', { jobId });
}

export async function failJob(jobId: string, record: Pick<JobRecord, 'attempt' | 'maxAttempts'>, error: string): Promise<void> {
  const db = await getDb();
  const attempt = record.attempt + 1;
  if (attempt >= record.maxAttempts) {
    await db.updateTable(TABLE).set({ status: 'dead', error_message: error, updated_at: new Date() } as any)
      .where('job_id', '=', jobId).execute();
    jobQueueFailedTotal.inc();
    logger.warn('[queue] dead letter', { jobId, attempts: attempt });
  } else {
    const backoff = Math.pow(2, attempt - 1) * 1000;
    await db.updateTable(TABLE).set({ status: 'queued', error_message: error, next_retry_at: new Date(Date.now() + backoff), updated_at: new Date() } as any)
      .where('job_id', '=', jobId).execute();
    logger.info('[queue] retry scheduled', { jobId, backoff: `${backoff / 1000}s` });
  }
}

export async function getJob(tenantId: string, jobId: string): Promise<JobRecord | null> {
  const row = await (await getDb()).selectFrom(TABLE).selectAll()
    .where('job_id', '=', jobId).where('tenant_id', '=', tenantId).executeTakeFirst();
  return row ? mapRow(row) : null;
}

export async function listJobs(tenantId: string, opts?: { status?: JobStatus; limit?: number }): Promise<JobRecord[]> {
  const db = await getDb();
  let q = db.selectFrom(TABLE).selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc');
  if (opts?.status) q = q.where('status', '=', opts.status);
  if (opts?.limit) q = q.limit(opts.limit);
  return (await q.execute()).map(mapRow);
}

async function recoverStale(db: any): Promise<void> {
  await db.updateTable(TABLE).set({ status: 'queued', error_message: 'Recovered from stale processing' } as any)
    .where('status', '=', 'processing').where('updated_at', '<=', new Date(Date.now() - STALE_TIMEOUT)).execute();
}

function mapRow(row: any): JobRecord {
  return {
    jobId: String(row.job_id), tenantId: String(row.tenant_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    jobType: String(row.job_type),
    jobData: typeof row.job_data === 'string' ? JSON.parse(row.job_data) : (row.job_data ?? {}),
    status: row.status as JobStatus, attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : null,
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  };
}
