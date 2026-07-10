/**
 * Job Worker
 *
 * 支持：retry、exponential backoff、timeout、graceful shutdown。
 */
import { dequeue, completeJob, failJob } from './queue';
import type { JobDefinition, JobRecord } from './job-types';
import { logger } from '../core/logger';

const POLL_INTERVAL = 2_000;
const DEFAULT_TIMEOUT = 60_000;

export class Worker {
  private handlers = new Map<string, JobDefinition>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  register(def: JobDefinition): this {
    this.handlers.set(def.type, def);
    logger.info('[worker] registered', { type: def.type });
    return this;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('[worker] started');
    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    logger.info('[worker] stopped');
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const job = await dequeue();
        if (job) { this.processJob(job).catch(() => {}); }
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
      await failJob(job.jobId, job, `No handler for: ${job.jobType}`);
      return;
    }
    try {
      const result = await withTimeout(def.handler(job.jobData), def.timeout ?? DEFAULT_TIMEOUT);
      await completeJob(job.jobId, result ?? null);
    } catch (err: any) {
      await failJob(job.jobId, job, err?.message ?? String(err));
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

export const worker = new Worker();
