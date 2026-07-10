/** Job 类型定义 */
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobRecord {
  jobId: string;
  tenantId: string;
  userId?: string;
  jobType: string;
  jobData: Record<string, unknown>;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  errorMessage: string | null;
  result: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobHandler {
  (payload: Record<string, unknown>): Promise<unknown>;
}

export interface JobDefinition {
  type: string;
  handler: JobHandler;
  maxAttempts?: number;
  timeout?: number;
}
