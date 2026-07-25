import { request } from '@umijs/max';

export interface ReleaseTask {
  taskId: string;
  environment: string;
  action: string;
  fromVersion: string | null;
  targetVersion: string;
  services: string;
  status: string;
  currentStage: string | null;
  progress: number;
  reason: string | null;
  githubRunId: string | null;
  triggeredBy: string;
  triggeredByName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createTime: string;
}

export interface ReleaseStep {
  stepId: string;
  taskId: string;
  stepKey: string;
  stepName: string;
  stepOrder: number;
  status: string;
  progress: number;
  message: string | null;
  durationMs: number | null;
}

export interface DeployableVersion {
  version: string;
  commitHash: string;
  builtAt: string;
  available: boolean;
}

export interface CurrentVersion {
  environment: string;
  version: string | null;
  deployedAt: string | null;
  deployedBy: string | null;
  previousVersion: string | null;
  status: string;
}

export interface ServiceStatus {
  environment: string;
  currentVersion: string | null;
  checkedAt: string;
  runningTask: { taskId: string; status: string; progress: number } | null;
}

export async function getReleaseVersions() {
  const res = await request<{ code: number; data: DeployableVersion[] }>('/api/ops/releases/versions');
  return res.data || [];
}

export async function getReleaseList(params: { pageNum?: number; pageSize?: number }) {
  return request<{ code: number; data: ReleaseTask[]; total: number }>('/api/ops/releases', { params });
}

export async function getReleaseDetail(taskId: string) {
  const res = await request<{ code: number; data: ReleaseTask }>(`/api/ops/releases/${taskId}`);
  return res.data;
}

export async function getReleaseSteps(taskId: string) {
  const res = await request<{ code: number; data: ReleaseStep[] }>(`/api/ops/releases/${taskId}/steps`);
  return res.data || [];
}

export async function getReleaseLogs(taskId: string, limit = 100) {
  const res = await request<{ code: number; data: Array<{ logId: string; stepKey: string; level: string; message: string; createdAt: string }> }>(
    `/api/ops/releases/${taskId}/logs`, { params: { limit } },
  );
  return res.data || [];
}

export async function createRelease(data: { environment: string; version: string; services: string[]; reason: string }) {
  return request<{ code: number; data: ReleaseTask; message: string }>('/api/ops/releases', { method: 'POST', data });
}

export async function rollbackRelease(taskId: string) {
  return request<{ code: number; data: any }>(`/api/ops/releases/${taskId}/rollback`, { method: 'POST' });
}

export async function getCurrentVersion(environment = 'production') {
  const res = await request<{ code: number; data: CurrentVersion }>('/api/ops/releases/current', { params: { environment } });
  return res.data;
}

export async function getRunningTask(environment = 'production') {
  const res = await request<{ code: number; data: ReleaseTask | null }>('/api/ops/releases/running', { params: { environment } });
  return res.data;
}

export async function getServiceStatus(environment = 'production') {
  const res = await request<{ code: number; data: ServiceStatus }>('/api/ops/releases/services/status', { params: { environment } });
  return res.data;
}
