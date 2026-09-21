/**
 * Job Worker
 *
 * - atomic claim (queue.ts)
 * - retry / exponential backoff / timeout
 * - **Graceful Shutdown Drain**: shutdown 等待所有进行中的 Job 完成
 */
import { dequeue, completeJob, failJob } from './queue';
import type { JobDefinition, JobRecord } from './job-types';
import { logger } from '../core/logger';

const POLL_INTERVAL = 2_000;
const DEFAULT_TIMEOUT = 60_000;
const DRAIN_TIMEOUT = 30_000;

export class Worker {
  private handlers = new Map<string, JobDefinition>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private inflight = new Map<string, Promise<void>>();

  register(def: JobDefinition): this {
    this.handlers.set(def.type, def);
    return this;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('[worker] started');
    this.poll();
  }

  /** Graceful Shutdown: 等待 inflight 完成后退出 */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    // Drain: 等待所有进行中的 Job 完成（最长 DRAIN_TIMEOUT）
    if (this.inflight.size > 0) {
      logger.info('[worker] draining', { inflight: this.inflight.size });
      const drained = Promise.allSettled(this.inflight.values());
      const timeout = new Promise<void>((r) => setTimeout(r, DRAIN_TIMEOUT));
      await Promise.race([drained, timeout]);
      logger.info('[worker] drain complete', { remaining: this.inflight.size });
    }

    logger.info('[worker] stopped');
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const job = await dequeue();
        if (job) {
          const promise = this.processJob(job).finally(() => {
            this.inflight.delete(job.jobId);
          });
          this.inflight.set(job.jobId, promise);
        }
      } catch (err) {
        logger.error('[worker] poll error', { error: String(err) });
      }
      await new Promise<void>((resolve) => {
        this.timer = setTimeout(() => { this.timer = null; resolve(); }, POLL_INTERVAL);
      });
    }
  }

  private async processJob(job: JobRecord): Promise<void> {
    const def = this.handlers.get(job.jobType);
    if (!def) {
      logger.warn('[worker] no handler', { jobType: job.jobType, jobId: job.jobId });
      await failJob(job.jobId, job, `No handler for: ${job.jobType}`, job.tenantId);
      return;
    }

    // 阶段一：租户被停用 / 过期 / offboarding 后，拒绝执行它的后台任务
    // （tenant.offboard 本身必须在租户已停用后继续运行，故排除）
    if (job.tenantId && job.jobType !== 'tenant.offboard') {
      try {
        const { isTenantActive } = require('../services/tenant-lifecycle');
        const active = await isTenantActive(job.tenantId);
        if (!active) {
          logger.warn('[worker] tenant inactive, job skipped', {
            jobId: job.jobId, jobType: job.jobType, tenantId: job.tenantId,
          });
          await completeJob(job.jobId, { skipped: true, reason: 'TENANT_INACTIVE' }, job.tenantId);
          return;
        }
      } catch (err) {
        // 校验本身失败不应阻塞任务（例如数据库瞬时不可用）
        logger.warn('[worker] tenant lifecycle check failed', { jobId: job.jobId, error: String(err) });
      }
    }

    try {
      const result = await withTimeout(def.handler(job.jobData), def.timeout ?? DEFAULT_TIMEOUT);
      await completeJob(job.jobId, result ?? null, job.tenantId);
    } catch (err: any) {
      await failJob(job.jobId, job, err?.message ?? String(err), job.tenantId);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms); }),
  ]).finally(() => { if (timer!) clearTimeout(timer); });
}

export const worker = new Worker();
