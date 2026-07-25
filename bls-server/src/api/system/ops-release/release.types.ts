/** 发布任务状态 */
export type TaskStatus =
  | 'pending'
  | 'checking'
  | 'waiting_approval'
  | 'running'
  | 'success'
  | 'failed'
  | 'rolling_back'
  | 'rolled_back'
  | 'cancelled';

/** 步骤状态 */
export type StepStatus =
  | 'waiting'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rollback'
  | 'cancelled';

/** 步骤标识 */
export type StepKey =
  | 'validate'
  | 'lock'
  | 'backup'
  | 'pull_images'
  | 'update_services'
  | 'wait_services'
  | 'health_check'
  | 'business_check'
  | 'complete'
  | 'rollback';

/** 发布操作 */
export type ReleaseAction = 'deploy' | 'rollback';

/** 发布环境 */
export type ReleaseEnvironment = 'production' | 'staging';

/** 服务名称白名单 */
export type ServiceName =
  | 'bls-admin'
  | 'bls-server'
  | 'bls-ai-service'
  | 'bls-event-service'
  | 'bls-java-server';

/** 发布任务 */
export interface ReleaseTask {
  task_id: string;
  tenant_id: string;
  environment: ReleaseEnvironment;
  action: ReleaseAction;
  from_version: string | null;
  target_version: string;
  services: string;
  status: TaskStatus;
  current_stage: StepKey | null;
  progress: number;
  reason: string | null;
  github_run_id: string | null;
  triggered_by: string;
  triggered_by_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  rollback_version: string | null;
  deleted: number;
  create_time: string;
  update_time: string;
}

/** 发布步骤 */
export interface ReleaseStep {
  step_id: string;
  task_id: string;
  step_key: StepKey;
  step_name: string;
  step_order: number;
  status: StepStatus;
  progress: number;
  message: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  create_time: string;
  update_time: string;
}

/** 发布环境 */
export interface OpsEnvironment {
  env_id: string;
  env_key: string;
  env_name: string;
  description: string | null;
  is_default: number;
  sort_num: number;
  status: string;
  tenant_id: string;
  deleted: number;
  create_time: string;
  update_time: string;
}

/** 创建发布任务请求 */
export interface CreateReleaseRequest {
  environment: ReleaseEnvironment;
  version: string;
  services: ServiceName[];
  reason: string;
}

/** 回调请求 */
export interface ReleaseCallbackRequest {
  taskId: string;
  stage: StepKey;
  status: StepStatus;
  progress: number;
  message: string;
  timestamp: string;
}

/** WebSocket 推送消息 */
export interface ReleaseProgressMessage {
  type: 'release_progress';
  taskId: string;
  status: TaskStatus;
  stage: StepKey | null;
  progress: number;
  message: string;
  timestamp: string;
}

/** 可发布版本 */
export interface DeployableVersion {
  version: string;
  commitHash: string;
  builtAt: string;
  available: boolean;
}
